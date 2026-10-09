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
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DateService } from '../../core/date/date.service';
import { T } from '../../t.const';
import { download } from '../../util/download';
import { JournalService } from './journal.service';
import {
  JournalActivity,
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
  imports: [FormsModule, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalComponent implements OnDestroy {
  readonly T = T;
  readonly journal = inject(JournalService);
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
  readonly allActivities = computed(() =>
    this.days().flatMap((day) => this.journal.byDay()[day]?.journalActivities ?? []),
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
    (this.journal.byDay()[this.day()]?.journalActivities ?? [])
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
      const activities = metric?.journalActivities ?? [];
      return {
        day,
        hours: (summarizeJournalActivities(activities).total / 60).toFixed(1),
        notes: metric?.notes ?? '',
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
    this.error.set('');
    this.editor.set({
      id: copy || !activity ? this.journal.newId() : activity.id,
      title: activity?.title ?? '',
      start: journalTime(activity?.start ?? 540),
      end: journalTime(activity?.end ?? 570),
      categoryId: activity?.categoryId ?? this.categories()[0].id,
      kind: copy ? 'actual' : (activity?.kind ?? this.kind()),
      note: activity?.note ?? '',
      ...(activity?.taskId && !copy ? { taskId: activity.taskId } : {}),
    });
  }

  saveActivity(): void {
    const draft = this.editor();
    if (!draft) return;
    const activity: JournalActivity = {
      ...draft,
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
      for (const a of (metric?.journalActivities ?? [])
        .slice()
        .sort((x, y) => x.start - y.start)) {
        const kind = this._translate.instant(
          a.kind === 'actual' ? T.F.JOURNAL.ACTUAL : T.F.JOURNAL.PLAN,
        );
        const category = this.categories().find((c) => c.id === a.categoryId)?.name ?? '';
        result += `- ${journalTime(a.start)}—${journalTime(a.end)} [${kind} / ${category}] ${a.title}\n${a.note ? `  ${a.note.replace(/\n/g, '\n  ')}\n` : ''}`;
      }
      if (this.period() !== 'day' && metric?.notes) result += `\n${metric.notes}\n`;
    }
    result += `\n## ${heading}\n\n${this.text}\n\n## ${this._translate.instant(this.planningLabels[this.period()])}\n\n${this.plan}\n`;
    await download(`journal-${this.period()}-${this.days()[0]}.md`, result);
  }
}
