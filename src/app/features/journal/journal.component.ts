import {
  afterRenderEffect,
  ElementRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  HostListener,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DateService } from '../../core/date/date.service';
import { T } from '../../t.const';
import { download } from '../../util/download';
import {
  JournalPeriodPlannerComponent,
  JournalPlanningEdit,
} from './journal-period-planner.component';
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
  JournalWeekPlanEntry,
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
  weekPlanId?: string;
  taskLinkMode?: 'reference';
}

@Component({
  selector: 'journal',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    TranslatePipe,
    JournalCalendarComponent,
    JournalPeriodPlannerComponent,
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
    const sourceTaskIds = new Set([
      ...this.journal
        .weekPlans()
        .filter((p) => days.has(p.day))
        .map((p) => p.taskId),
      ...this.journal
        .monthPlans()
        .filter((p) => p.fromDay <= this.days().at(-1)! && p.toDay >= this.days()[0])
        .map((p) => p.taskId),
      ...this.days().flatMap((day) =>
        (this.journal.activitiesByDay()[day] ?? []).map((a) => a.taskId),
      ),
    ]);
    return this.journal
      .tasks()
      .filter((task) => {
        if (task.subTaskIds.length) return false;
        const due = task.dueWithTime
          ? journalDate(new Date(task.dueWithTime))
          : task.dueDay;
        return (
          sourceTaskIds.has(task.id) ||
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
  readonly selectedWeekPlanId = signal<string | null>(null);
  readonly selectedWeekPlan = computed(
    () =>
      this.journal.weekPlans().find((p) => p.id === this.selectedWeekPlanId()) ?? null,
  );
  readonly dayWeekPlans = computed(() =>
    this.journal.weekPlans().filter((p) => p.day === this.day()),
  );
  readonly historyExpanded = signal(false);
  private readonly _periodPlanner = viewChild(JournalPeriodPlannerComponent);
  readonly editor = signal<ActivityDraft | null>(null);
  readonly error = signal('');
  readonly dirty = signal(false);
  categoryDraft: JournalCategory[] | null = null;
  templateDraft: JournalActivityTemplate[] | null = null;
  readonly templateError = signal('');
  readonly categoryError = signal('');
  readonly expandedTemplates = signal<string[]>([]);
  private readonly _reflection = viewChild(ReflectionNoteComponent);
  private readonly _activityTitle =
    viewChild<ElementRef<HTMLInputElement>>('activityTitle');
  private _initialEditor = '';
  private _initialTemplates = '';
  private _initialCategories = '';
  private _selectedRange: JournalCalendarSelection | null = null;
  private _editedActivity: JournalActivity | null = null;
  text = '';
  plan = '';
  private _draftKey = '';

  constructor() {
    afterRenderEffect(() => this._activityTitle()?.nativeElement.focus());
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
    this.closeExpandedViews();
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.closeExpandedViews()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('keydown.escape', ['$event'])
  onEscape(event: KeyboardEvent): void {
    this.closeExpandedViews();
    event.stopPropagation();
  }

  setPeriod(period: JournalPeriod): void {
    if (!this.closeExpandedViews()) return;
    this.period.set(period);
  }

  changeDay(day: string): void {
    if (!isJournalDate(day)) return;
    if (!this.closeExpandedViews()) return;
    this.day.set(day);
  }

  openDay(day: string): void {
    if (!isJournalDate(day) || !this.closeExpandedViews()) return;
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

  // All dismissal/navigation paths use the same persistence boundary.
  closeExpandedViews(forceActivity = false, forcePlanner = false): boolean {
    this.saveJournal();
    this._reflection()?.closeExpandedViews();
    const categoriesSaved = this._persistCategories();
    const templatesSaved = this._persistTemplates();
    const activitySaved = this._persistActivity(forceActivity);
    const plannerSaved =
      this._periodPlanner()?.persistPendingChanges(forcePlanner) ?? true;
    if (!categoriesSaved || !templatesSaved || !activitySaved || !plannerSaved)
      return false;
    this._periodPlanner()?.closeEditors();
    this.selectedWeekPlanId.set(null);
    this.historyExpanded.set(false);
    this.editor.set(null);
    this.categoryDraft = null;
    this.templateDraft = null;
    this.expandedTemplates.set([]);
    return true;
  }

  openPeriodEditor(request: JournalPlanningEdit): void {
    if (this.closeExpandedViews()) this._periodPlanner()?.openEditor(request);
  }

  openWeek(day: string): void {
    if (!this.closeExpandedViews()) return;
    this.day.set(day);
    this.period.set('week');
  }

  selectWeekPlan(plan: JournalWeekPlanEntry): void {
    if (!this.closeExpandedViews()) return;
    this.day.set(plan.day);
    this.period.set('day');
    this.kind.set('plan');
    this.view.set('timeline');
    this.selectedWeekPlanId.set(plan.id);
  }

  toggleHistory(): void {
    const open = !this.historyExpanded();
    if (this.closeExpandedViews()) this.historyExpanded.set(open);
  }

  linkWeekPlan(id: string): void {
    const draft = this.editor();
    if (!draft || draft.id.startsWith('task:')) return;
    const plan = this.dayWeekPlans().find((p) => p.id === id);
    this.editor.set({
      ...draft,
      weekPlanId: plan?.id,
      ...(plan
        ? {
            taskLinkMode: 'reference' as const,
            title: plan.title,
            categoryId: plan.categoryId,
            note: plan.note ?? '',
            taskId: this.journal.activeTasks().some((t) => t.id === plan.taskId)
              ? plan.taskId
              : undefined,
          }
        : {}),
    });
  }

  setView(view: 'timeline' | 'list' | 'compare'): void {
    if (this.closeExpandedViews()) this.view.set(view);
  }

  setKind(kind: JournalActivityKind): void {
    if (this.closeExpandedViews()) this.kind.set(kind);
  }

  toggleTemplateDetails(id: string): void {
    const expanded = this.expandedTemplates();
    if (expanded.includes(id)) {
      this.saveJournal();
      this._reflection()?.flushPendingChanges();
      if (!this._persistTemplates()) return;
      this.expandedTemplates.set(expanded.filter((entry) => entry !== id));
    } else this.expandedTemplates.set([...expanded, id]);
  }

  editActivity(activity?: JournalActivity, copy = false): boolean {
    if (this.editor() && !this.closeExpandedViews()) return false;
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
      ...(activity?.weekPlanId ? { weekPlanId: activity.weekPlanId } : {}),
      ...(activity?.taskLinkMode ? { taskLinkMode: activity.taskLinkMode } : {}),
    });
    this._initialEditor = JSON.stringify(this.editor());
    return true;
  }

  selectCalendar(range: JournalCalendarSelection): void {
    const budget = this.selectedWeekPlan();
    if (!this.editActivity()) return;
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
    this._initialEditor = JSON.stringify(this.editor());
    if (budget && range.kind === 'plan' && budget.day === this.day()) {
      this.linkWeekPlan(budget.id);
      if (range.end - range.start === 15) {
        const remaining = Math.max(15, this.journal.progress(budget).remaining);
        this.editor.update(
          (draft) =>
            draft && {
              ...draft,
              end: journalTime(Math.min(1440, range.start + remaining)),
            },
        );
      }
    }
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
    if (this.period() !== 'day') {
      const planner = this._periodPlanner();
      if (!planner) return;
      if (!planner.editor()) {
        if (!this.closeExpandedViews()) return;
        planner.openEditor({ scope: this.period() as 'month' | 'week' });
      }
      planner.applyTemplate(template);
      return;
    }
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
        activity.kind === 'plan' &&
        activity.taskId &&
        activity.taskLinkMode !== 'reference'
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
    if (this.templateDraft) {
      const previous = this.templateDraft;
      this.templateDraft = [...previous, template];
      if (!this._persistTemplates()) {
        this.templateDraft = previous;
        this.error.set(this.templateError());
        return;
      }
    } else this.journal.saveTemplates([...this.journal.templates(), template]);
    this.error.set('');
    this.templateSaved.set(true);
  }

  linkTask(taskId: string): void {
    const task = this.journal.taskById()[taskId];
    this.editor.update(
      (draft) =>
        draft && {
          ...draft,
          ...(task && draft.kind === 'plan' && draft.taskLinkMode !== 'reference'
            ? { id: `task:${task.id}` }
            : {}),
          taskId: task?.id,
          title: task?.title ?? draft.title,
          note: draft.kind === 'plan' ? (task?.notes ?? '') : draft.note,
          categoryId: task?.journalCategoryId ?? draft.categoryId,
        },
    );
  }

  editTemplates(): void {
    if (this.templateDraft) {
      this.closeExpandedViews();
      return;
    }
    this.templateError.set('');
    this.templateDraft = this.templates().map((template) => ({ ...template }));
    this._initialTemplates = JSON.stringify(this.templateDraft);
    this.expandedTemplates.set([]);
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

  saveTemplates(): boolean {
    return this.closeExpandedViews();
  }

  private _persistTemplates(): boolean {
    if (
      !this.templateDraft ||
      JSON.stringify(this.templateDraft) === this._initialTemplates
    )
      return true;
    if (
      this.templateDraft.some(
        (entry) =>
          !isValidJournalTemplate(entry) ||
          (!!entry.categoryId &&
            !this.categories().some((c) => c.id === entry.categoryId)),
      )
    ) {
      this.templateError.set(this._translate.instant(T.F.JOURNAL.TEMPLATE_INVALID));
      return false;
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
    this._initialTemplates = JSON.stringify(this.templateDraft);
    this.templateError.set('');
    return true;
  }

  saveActivity(): boolean {
    return this.closeExpandedViews(true);
  }

  private _persistActivity(force = false): boolean {
    const draft = this.editor();
    if (!draft) return true;
    // Untouched empty editors produce no record; unchanged existing entries produce no op.
    if (
      !force &&
      JSON.stringify(draft) === this._initialEditor &&
      (this._editedActivity ||
        (!draft.title.trim() && !draft.note.trim() && !draft.taskId))
    )
      return true;
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
      return false;
    }
    this.kind.set(activity.kind);
    if (
      this._editedActivity &&
      !this._editedActivity.id.startsWith('task:') &&
      this._editedActivity.id !== activity.id
    )
      this.journal.removeActivity(this.day(), this._editedActivity.id);
    this.editor.set({ ...draft, id: activity.id });
    this._editedActivity = activity;
    this._initialEditor = JSON.stringify(this.editor());
    this.error.set('');
    return true;
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
    if (this.categoryDraft) {
      this.closeExpandedViews();
      return;
    }
    this.categoryError.set('');
    this.categoryDraft = this.categories().map((category) => ({ ...category }));
    this._initialCategories = JSON.stringify(this.categoryDraft);
  }

  addCategory(): void {
    this.categoryDraft?.push({ id: this.journal.newId(), name: '', color: '#92bd77' });
  }

  saveCategories(): boolean {
    return this.closeExpandedViews();
  }

  private _persistCategories(): boolean {
    if (
      !this.categoryDraft ||
      JSON.stringify(this.categoryDraft) === this._initialCategories
    )
      return true;
    if (this.categoryDraft.some((c) => !c.name.trim())) {
      this.categoryError.set(this._translate.instant(T.F.JOURNAL.CATEGORY_NAME_REQUIRED));
      return false;
    }
    this.journal.saveCategories(
      this.categoryDraft.map((c) => ({ ...c, name: c.name.trim() })),
    );
    this._initialCategories = JSON.stringify(this.categoryDraft);
    this.categoryError.set('');
    return true;
  }

  async exportMarkdown(): Promise<void> {
    if (!this.closeExpandedViews()) return;
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
    const periodStart = this.days()[0];
    const periodEnd = this.days().at(-1)!;
    result += `\n## ${this._translate.instant(T.F.JOURNAL.MONTH_PLANNING)}\n\n`;
    for (const month of this.journal
      .monthPlans()
      .filter((p) => p.fromDay <= periodEnd && p.toDay >= periodStart))
      result += `- ${month.fromDay}—${month.toDay}: ${month.title}${month.note ? ` · ${month.note}` : ''}\n`;
    result += `\n## ${this._translate.instant(T.F.JOURNAL.WEEK_PLANNING)}\n\n`;
    for (const week of this.journal
      .weekPlans()
      .filter((p) => this.days().includes(p.day))) {
      const progress = this.journal.progress(week);
      const scheduled = this._translate.instant(T.F.JOURNAL.DAILY_SCHEDULED);
      result += `- ${week.day}: ${week.title} · ${week.minutes / 60} ${hours} · ${scheduled} ${progress.planned / 60} ${hours}\n`;
    }
    result += `\n## ${this._translate.instant(T.F.JOURNAL.TASK_OVERVIEW)}\n\n`;
    for (const { task, hours: tracked } of this.periodTasks())
      result += `- [${task.isDone ? 'x' : ' '}] ${task.title} · ${tracked} ${hours}\n`;
    result += `\n## ${heading}\n\n${this.text}\n\n## ${this._translate.instant(this.planningLabels[this.period()])}\n\n${this.plan}\n`;
    await download(`journal-${this.period()}-${this.days()[0]}.md`, result);
  }
}
