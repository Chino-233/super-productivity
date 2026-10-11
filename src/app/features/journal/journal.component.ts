import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DateService } from '../../core/date/date.service';
import { T } from '../../t.const';
import { download } from '../../util/download';
import { JournalService } from './journal.service';
import { applyJournalTemplate, isValidJournalTemplate } from './journal-template.util';
import { ReflectionNoteComponent } from '../metric/reflection-note/reflection-note.component';
import {
  JournalCalendarComponent,
  JournalCalendarSelection,
} from './journal-calendar.component';
import {
  JournalActivity,
  JournalActivityTemplate,
  JournalActivityKind,
  JournalCategory,
  JournalPeriod,
} from './journal.model';
import {
  isJournalDate,
  journalDate,
  journalPeriodDays,
  journalTime,
  parseJournalTime,
  shiftJournalDay,
  summarizeJournalActivities,
} from './journal.util';

interface ActivityDraft {
  id: string;
  title: string;
  start: string;
  end: string;
  categoryId: string;
  kind: JournalActivityKind;
  note: string;
  taskId?: string;
}

@Component({
  selector: 'journal',
  standalone: true,
  imports: [
    FormsModule,
    A11yModule,
    MatButtonModule,
    MatIconModule,
    TranslatePipe,
    JournalCalendarComponent,
    ReflectionNoteComponent,
  ],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalComponent implements OnDestroy {
  readonly T = T;
  readonly journal = inject(JournalService);
  readonly templateSaved = signal(false);
  private readonly _dateService = inject(DateService);
  private readonly _translate = inject(TranslateService);
  private readonly _language = toSignal(this._translate.onLangChange);

  readonly day = signal(this._dateService.todayStr());
  readonly period = signal<JournalPeriod>('day');
  readonly kind = signal<JournalActivityKind>('actual');
  readonly view = signal<'timeline' | 'list' | 'compare'>('timeline');
  readonly days = computed(() => journalPeriodDays(this.day(), this.period()));
  readonly categories = computed(() => {
    this._language();
    return this.journal.categories().map((category) => ({
      ...category,
      name: this._translate.instant(category.name),
    }));
  });
  readonly templates = computed(() => {
    this._language();
    const entries = this.journal.templates();
    return entries.map((template) => ({
      ...template,
      name: this._translate.instant(template.name ?? template.title ?? ''),
      title: template.title ? this._translate.instant(template.title) : undefined,
    }));
  });
  readonly periodTasks = computed(() => {
    const days = new Set(this.days());
    return this.journal
      .tasks()
      .filter((task) => {
        if (task.subTaskIds.length) return false;
        const due = task.dueWithTime
          ? journalDate(new Date(task.dueWithTime))
          : task.dueDay;
        return (
          (due && days.has(due)) ||
          (task.doneOn && days.has(journalDate(new Date(task.doneOn)))) ||
          this.days().some((day) => (task.timeSpentOnDay[day] ?? 0) > 0)
        );
      })
      .map((task) => ({
        task,
        hours: (
          this.days().reduce((sum, day) => sum + (task.timeSpentOnDay[day] ?? 0), 0) /
          3600000
        ).toFixed(2),
        active: this.journal.activeTasks().some((entry) => entry.id === task.id),
      }));
  });
  readonly taskTotals = computed(() => ({
    completed: this.periodTasks().filter(
      ({ task }) =>
        task.isDone &&
        (!task.doneOn || this.days().includes(journalDate(new Date(task.doneOn)))),
    ).length,
    hours:
      this.periodTasks().reduce(
        (sum, { task }) =>
          sum +
          this.days().reduce((total, day) => total + (task.timeSpentOnDay[day] ?? 0), 0),
        0,
      ) / 3600000,
  }));
  readonly allActivities = computed(() =>
    this.days().flatMap((day) => this.journal.activitiesByDay()[day] ?? []),
  );
  readonly actual = computed(() => summarizeJournalActivities(this.allActivities()));
  readonly planned = computed(() =>
    summarizeJournalActivities(this.allActivities(), 'plan'),
  );
  readonly unrecorded = computed(() => {
    const available = this.days().length * 1440;
    return available - this.actual().total;
  });
  readonly distribution = computed(() =>
    this.categories().map((category) => ({
      ...category,
      hours: ((this.actual().byCategory[category.id] ?? 0) / 60).toFixed(1),
      percent: this.actual().total
        ? ((this.actual().byCategory[category.id] ?? 0) / this.actual().total) * 100
        : 0,
    })),
  );
  readonly rows = computed(() =>
    (this.journal.activitiesByDay()[this.day()] ?? [])
      .filter((activity) => this.view() === 'compare' || activity.kind === this.kind())
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((activity) => {
        const category = this.categories().find(
          (entry) => entry.id === activity.categoryId,
        );
        return {
          ...activity,
          color: category?.color ?? 'var(--c-primary)',
          categoryName: category?.name ?? '',
          startLabel: journalTime(activity.start),
          endLabel: journalTime(activity.end),
          hours: ((activity.end - activity.start) / 60).toFixed(1),
          top: (activity.start / 60) * 64,
          height: ((activity.end - activity.start) / 60) * 64,
        };
      }),
  );
  readonly overview = computed(() =>
    this.days().map((day) => {
      const metric = this.journal.byDay()[day];
      const activities = this.journal.activitiesByDay()[day] ?? [];
      return {
        day,
        hours: (summarizeJournalActivities(activities).total / 60).toFixed(1),
        notes: metric?.notes ?? '',
        reflection: metric?.reflections?.[0]?.text ?? '',
        segments: activities
          .filter((a) => a.kind === 'actual')
          .map((a) => ({
            id: a.id,
            title: a.title,
            start: (a.start / 1440) * 100,
            width: ((a.end - a.start) / 1440) * 100,
            color:
              this.categories().find((c) => c.id === a.categoryId)?.color ??
              'var(--c-primary)',
          })),
      };
    }),
  );
  readonly ticks = Array.from({ length: 49 }, (_, i) => ({
    label: i % 2 ? '' : journalTime(i * 30),
    top: i * 32,
  }));
  readonly periodLabels = {
    day: T.F.JOURNAL.DAY,
    week: T.F.JOURNAL.WEEK,
    month: T.F.JOURNAL.MONTH,
  };
  readonly planningLabels = {
    day: T.F.JOURNAL.PLAN_DAY,
    week: T.F.JOURNAL.PLAN_WEEK,
    month: T.F.JOURNAL.PLAN_MONTH,
  };
  readonly editor = signal<ActivityDraft | null>(null);
  readonly error = signal('');
  readonly dirty = signal(false);
  categoryDraft: JournalCategory[] | null = null;
  templateDraft: JournalActivityTemplate[] | null = null;
  readonly templateError = signal('');
  private _selectedRange: JournalCalendarSelection | null = null;
  private _editedActivity: JournalActivity | null = null;
  text = '';
  plan = '';
  private _draftKey = '';

  constructor() {
    effect(() => {
      const period = this.period();
      const key = `${period}:${this.days()[0]}`;
      const metric = this.journal.byDay()[this.days()[0]];
      if (key === this._draftKey && this.dirty()) return;
      const entry = period === 'week' ? metric?.journalWeekly : metric?.journalMonthly;
      this.text = period === 'day' ? (metric?.notes ?? '') : (entry?.text ?? '');
      this.plan = period === 'day' ? (metric?.journalPlan ?? '') : (entry?.plan ?? '');
      this._draftKey = key;
    });
  }

  ngOnDestroy(): void {
    this.saveJournal();
  }

  setPeriod(period: JournalPeriod): void {
    this.saveJournal();
    this.period.set(period);
    this.editor.set(null);
  }

  changeDay(day: string): void {
    if (!isJournalDate(day)) return;
    this.saveJournal();
    this.day.set(day);
    this.editor.set(null);
  }

  openDay(day: string): void {
    this.saveJournal();
    this.day.set(day);
    this.period.set('day');
  }

  navigate(offset: number): void {
    if (this.period() === 'month') {
      const date = new Date(`${this.day()}T12:00:00`);
      date.setDate(1);
      date.setMonth(date.getMonth() + offset);
      this.changeDay(journalDate(date));
    } else
      this.changeDay(
        shiftJournalDay(this.day(), offset * (this.period() === 'week' ? 7 : 1)),
      );
  }

  today(): void {
    this.changeDay(this._dateService.todayStr());
  }

  editActivity(activity?: JournalActivity, copy = false): void {
    this.templateSaved.set(false);
    this._selectedRange = null;
    this._editedActivity = copy ? null : (activity ?? null);
    this.error.set('');
    this.editor.set({
      id: copy || !activity ? this.journal.newId() : activity.id,
      title: activity?.title ?? '',
      start: journalTime(activity?.start ?? 540),
      end: journalTime(activity?.end ?? 555),
      categoryId: activity?.categoryId ?? this.categories()[0].id,
      kind: copy ? 'actual' : (activity?.kind ?? this.kind()),
      note: activity?.note ?? '',
      ...(activity?.taskId ? { taskId: activity.taskId } : {}),
    });
  }

  selectCalendar(range: JournalCalendarSelection): void {
    this.editActivity();
    this._selectedRange = range;
    this.editor.update(
      (draft) =>
        draft && {
          ...draft,
          start: journalTime(range.start),
          end: journalTime(range.end),
          kind: range.kind,
        },
    );
  }

  changeCalendar(change: {
    activity: JournalActivity;
    start: number;
    end: number;
  }): void {
    this.error.set('');
    const error = this.journal.saveActivity(this.day(), {
      ...change.activity,
      start: change.start,
      end: change.end,
    });
    if (error) this.error.set(this._translate.instant(T.F.JOURNAL[error.code], error));
  }

  useTemplate(template: JournalActivityTemplate): void {
    if (!this.editor()) this.editActivity();
    const draft = this.editor()!;
    const lockedTask = this._editedActivity?.id.startsWith('task:');
    const taskId = lockedTask ? draft.taskId : template.taskId;
    const task = taskId ? this.journal.activeTasks().find((t) => t.id === taskId) : null;
    if (taskId && !task) {
      this.error.set(this._translate.instant(T.F.JOURNAL.TASK_UNAVAILABLE));
      return;
    }
    this.error.set('');
    const activity = applyJournalTemplate(
      {
        ...draft,
        start: parseJournalTime(draft.start),
        end: parseJournalTime(draft.end),
        title: draft.title || task?.title || '',
        note: draft.note || task?.notes || '',
      },
      {
        ...template,
        ...(lockedTask ? { taskId: draft.taskId } : {}),
        categoryId: this.categories().some((c) => c.id === template.categoryId)
          ? template.categoryId
          : undefined,
      },
      !!this._selectedRange && this._selectedRange.end - this._selectedRange.start > 15,
    );
    this.editor.set({
      ...activity,
      id:
        activity.kind === 'plan' && activity.taskId
          ? `task:${activity.taskId}`
          : !lockedTask && draft.id.startsWith('task:')
            ? (this._editedActivity?.id ?? this.journal.newId())
            : draft.id,
      start: journalTime(activity.start),
      end: journalTime(activity.end),
      note: activity.note ?? '',
    });
  }

  saveEditorTemplate(): void {
    const draft = this.editor();
    if (!draft) return;
    const template: JournalActivityTemplate = {
      id: this.journal.newId(),
      name: draft.title.trim(),
      title: draft.title.trim(),
      categoryId: draft.categoryId,
      start: draft.start,
      end: draft.end,
      kind: draft.kind,
      note: draft.note,
      taskId: draft.taskId ?? null,
    };
    if (!isValidJournalTemplate(template)) {
      this.error.set(this._translate.instant(T.F.JOURNAL.TEMPLATE_INVALID));
      return;
    }
    this.journal.saveTemplates([...this.journal.templates(), template]);
    this.error.set('');
    this.templateSaved.set(true);
  }

  linkTask(taskId: string): void {
    const task = this.journal.taskById()[taskId];
    this.editor.update(
      (draft) =>
        draft && {
          ...draft,
          ...(task && draft.kind === 'plan' ? { id: `task:${task.id}` } : {}),
          taskId: task?.id,
          title: task?.title ?? draft.title,
          note: draft.kind === 'plan' ? (task?.notes ?? '') : draft.note,
          categoryId: task?.journalCategoryId ?? draft.categoryId,
        },
    );
  }

  editTemplates(): void {
    this.templateError.set('');
    this.templateDraft = this.templates().map((template) => ({ ...template }));
  }

  addTemplate(): void {
    this.templateDraft?.push({
      id: this.journal.newId(),
      name: '',
    });
  }

  removeTemplate(id: string): void {
    this.templateDraft = this.templateDraft?.filter((entry) => entry.id !== id) ?? null;
  }

  saveTemplates(): void {
    if (!this.templateDraft) return;
    if (
      this.templateDraft.some(
        (entry) =>
          !isValidJournalTemplate(entry) ||
          (!!entry.categoryId &&
            !this.categories().some((c) => c.id === entry.categoryId)),
      )
    ) {
      this.templateError.set(this._translate.instant(T.F.JOURNAL.TEMPLATE_INVALID));
      return;
    }
    this.journal.saveTemplates(
      this.templateDraft.map((entry) => ({
        id: entry.id,
        name: (entry.name || entry.title)!.trim(),
        ...(entry.title?.trim() ? { title: entry.title.trim() } : {}),
        ...(entry.categoryId ? { categoryId: entry.categoryId } : {}),
        ...(entry.duration != null ? { duration: entry.duration } : {}),
        ...(entry.start ? { start: entry.start } : {}),
        ...(entry.end ? { end: entry.end } : {}),
        ...(entry.kind ? { kind: entry.kind } : {}),
        ...(entry.taskId !== undefined ? { taskId: entry.taskId } : {}),
        ...(entry.note ? { note: entry.note } : {}),
      })),
    );
    this.templateDraft = null;
  }

  saveActivity(): void {
    const draft = this.editor();
    if (!draft) return;
    const activity: JournalActivity = {
      ...draft,
      id:
        draft.kind === 'actual' && draft.id.startsWith('task:')
          ? this.journal.newId()
          : draft.id,
      title: draft.title.trim(),
      start: parseJournalTime(draft.start),
      end: parseJournalTime(draft.end),
    };
    const error = this.journal.saveActivity(this.day(), activity);
    if (error) {
      this.error.set(this._translate.instant(T.F.JOURNAL[error.code], error));
      return;
    }
    this.kind.set(activity.kind);
    if (
      this._editedActivity &&
      !this._editedActivity.id.startsWith('task:') &&
      this._editedActivity.id !== activity.id
    )
      this.journal.removeActivity(this.day(), this._editedActivity.id);
    this.editor.set(null);
  }

  removeActivity(activity: JournalActivity): void {
    this.journal.removeActivity(this.day(), activity.id);
  }

  createTask(activity: JournalActivity): void {
    this.journal.createTask(this.day(), activity);
  }

  saveJournal(): void {
    if (!this.dirty()) return;
    this.journal.saveJournal(this.day(), this.period(), this.text, this.plan);
    this.dirty.set(false);
  }

  editCategories(): void {
    this.categoryDraft = this.categories().map((category) => ({ ...category }));
  }

  addCategory(): void {
    this.categoryDraft?.push({ id: this.journal.newId(), name: '', color: '#92bd77' });
  }

  saveCategories(): void {
    if (!this.categoryDraft || this.categoryDraft.some((c) => !c.name.trim())) return;
    this.journal.saveCategories(
      this.categoryDraft.map((c) => ({ ...c, name: c.name.trim() })),
    );
    this.categoryDraft = null;
  }

  async exportMarkdown(): Promise<void> {
    this.saveJournal();
    const heading = this._translate.instant(this.periodLabels[this.period()]);
    const hours = this._translate.instant(T.F.JOURNAL.HOURS);
    let result = `# ${this.days()[0]} — ${this.days().at(-1)} ${heading}\n\n`;
    for (const category of this.distribution())
      result += `- ${category.name}: ${category.hours} ${hours}\n`;
    for (const day of this.days()) {
      result += `\n## ${day}\n\n`;
      const metric = this.journal.byDay()[day];
      for (const a of (this.journal.activitiesByDay()[day] ?? [])
        .slice()
        .sort((x, y) => x.start - y.start)) {
        const kind = this._translate.instant(
          a.kind === 'actual' ? T.F.JOURNAL.ACTUAL : T.F.JOURNAL.PLAN,
        );
        const category = this.categories().find((c) => c.id === a.categoryId)?.name ?? '';
        result += `- ${journalTime(a.start)}—${journalTime(a.end)} [${kind} / ${category}] ${a.title}\n${a.note ? `  ${a.note.replace(/\n/g, '\n  ')}\n` : ''}`;
      }
      if (this.period() !== 'day' && metric?.notes) result += `\n${metric.notes}\n`;
      if (metric?.reflections?.[0]?.text) result += `\n${metric.reflections[0].text}\n`;
    }
    result += `\n## ${this._translate.instant(T.F.JOURNAL.TASK_OVERVIEW)}\n\n`;
    for (const { task, hours: tracked } of this.periodTasks())
      result += `- [${task.isDone ? 'x' : ' '}] ${task.title} · ${tracked} ${hours}\n`;
    result += `\n## ${heading}\n\n${this.text}\n\n## ${this._translate.instant(this.planningLabels[this.period()])}\n\n${this.plan}\n`;
    await download(`journal-${this.period()}-${this.days()[0]}.md`, result);
  }
}
