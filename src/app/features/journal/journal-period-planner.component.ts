import {
  afterRenderEffect,
  ElementRef,
  viewChild,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  HostListener,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { JournalService } from './journal.service';
import {
  JournalActivityTemplate,
  JournalMonthPlanEntry,
  JournalPeriod,
  JournalWeekPlanEntry,
} from './journal.model';
import { journalPeriodDays, parseJournalTime } from './journal.util';
import { T } from '../../t.const';

interface PlanDraftBase {
  id: string;
  anchor: string;
  title: string;
  categoryId: string;
  note: string;
  taskId?: string;
}
type PlanDraft =
  | (PlanDraftBase & { scope: 'month'; fromDay: string; toDay: string })
  | (PlanDraftBase & { scope: 'week'; day: string; hours: number; monthPlanId?: string });
type BudgetRow = JournalWeekPlanEntry & {
  planned: number;
  actual: number;
  remaining: number;
  source: string;
};
export interface JournalPlanningEdit {
  scope: 'month' | 'week';
  day?: string;
  toDay?: string;
  month?: JournalMonthPlanEntry;
  week?: JournalWeekPlanEntry;
}

@Component({
  selector: 'journal-period-planner',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './journal-period-planner.component.html',
  styleUrl: './journal-period-planner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalPeriodPlannerComponent {
  readonly T = T;
  readonly journal = inject(JournalService);
  private readonly _translate = inject(TranslateService);
  readonly day = input.required<string>();
  readonly period = input.required<JournalPeriod>();
  readonly selectedBudgetId = input<string | null>(null);
  readonly editRequested = output<JournalPlanningEdit>();
  readonly dismissRequested = output<boolean>();
  readonly arrangeRequested = output<JournalWeekPlanEntry>();
  readonly dayRequested = output<string>();
  readonly editor = signal<PlanDraft | null>(null);
  readonly error = signal('');
  readonly monthSelection = signal<{ from: string; to: string } | null>(null);
  private _initial = '';
  private _existing = false;
  private readonly _title = viewChild<ElementRef<HTMLInputElement>>('planningTitle');

  constructor() {
    afterRenderEffect(() => this._title()?.nativeElement.focus());
  }

  readonly monthDays = computed(() => journalPeriodDays(this.day(), 'month'));
  readonly monthPadding = computed(() =>
    Array.from({
      length: (new Date(`${this.monthDays()[0]}T12:00:00`).getDay() + 6) % 7,
    }),
  );
  readonly weekDays = computed(() => journalPeriodDays(this.day(), 'week'));
  readonly months = computed(() =>
    this.journal
      .monthPlans()
      .filter(
        (p) => p.fromDay <= this.monthDays().at(-1)! && p.toDay >= this.monthDays()[0],
      )
      .sort((a, b) => a.fromDay.localeCompare(b.fromDay)),
  );
  readonly week = computed(() =>
    this.weekDays().map((day) => {
      const entries = this.journal
        .weekPlans()
        .filter((p) => p.day === day)
        .map((p) => this.budgetRow(p));
      return { day, entries, minutes: entries.reduce((sum, p) => sum + p.minutes, 0) };
    }),
  );
  readonly dailyBudgets = computed(() =>
    this.journal
      .weekPlans()
      .filter((p) => p.day === this.day())
      .map((p) => this.budgetRow(p)),
  );
  readonly monthlyRows = computed(() =>
    this.months().map((month) => {
      const budgets = this.journal.weekPlans().filter((p) => p.monthPlanId === month.id);
      return {
        ...month,
        budgets: budgets.length,
        minutes: budgets.reduce((sum, p) => sum + p.minutes, 0),
        scheduled: budgets.reduce((sum, p) => sum + this.journal.progress(p).planned, 0),
      };
    }),
  );

  budgetRow(plan: JournalWeekPlanEntry): BudgetRow {
    return {
      ...plan,
      ...this.journal.progress(plan),
      source:
        this.journal.monthPlans().find((p) => p.id === plan.monthPlanId)?.title ?? '',
    };
  }
  hours(minutes: number): string {
    return String(Math.round((minutes / 60) * 100) / 100);
  }
  color(id: string): string {
    return (
      this.journal.categories().find((c) => c.id === id)?.color ?? 'var(--c-primary)'
    );
  }
  plansForDay(day: string): JournalMonthPlanEntry[] {
    return this.months().filter((p) => p.fromDay <= day && p.toDay >= day);
  }
  monthOptions(day: string): JournalMonthPlanEntry[] {
    return this.journal.monthPlans().filter((p) => p.fromDay <= day && p.toDay >= day);
  }

  beginMonthRange(day: string, event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    this.monthSelection.set({ from: day, to: day });
  }
  extendMonthRange(day: string): void {
    this.monthSelection.update((range) => range && { ...range, to: day });
  }
  isSelected(day: string): boolean {
    const range = this.monthSelection();
    return (
      !!range &&
      day >= [range.from, range.to].sort()[0] &&
      day <= [range.from, range.to].sort()[1]
    );
  }
  @HostListener('window:pointerup')
  finishMonthRange(): void {
    const range = this.monthSelection();
    if (!range) return;
    const [from, to] = [range.from, range.to].sort();
    this.monthSelection.set(null);
    this.editRequested.emit({ scope: 'month', day: from, toDay: to });
  }
  @HostListener('window:pointercancel')
  cancelMonthRange(): void {
    this.monthSelection.set(null);
  }

  openEditor(request: JournalPlanningEdit): void {
    this.error.set('');
    const existing = request.month ?? request.week;
    this._existing = !!existing;
    const base: PlanDraftBase = {
      id: existing?.id ?? this.journal.newId(),
      anchor: existing?.anchor ?? journalPeriodDays(this.day(), request.scope)[0],
      title: existing?.title ?? '',
      categoryId: existing?.categoryId ?? this.journal.categories()[0].id,
      note: existing?.note ?? '',
      ...(existing?.taskId ? { taskId: existing.taskId } : {}),
    };
    this.editor.set(
      request.scope === 'month'
        ? {
            ...base,
            scope: 'month',
            fromDay: request.month?.fromDay ?? request.day ?? this.day(),
            toDay: request.month?.toDay ?? request.toDay ?? request.day ?? this.day(),
          }
        : {
            ...base,
            scope: 'week',
            day: request.week?.day ?? request.day ?? this.day(),
            hours: (request.week?.minutes ?? 60) / 60,
            ...(request.week?.monthPlanId
              ? { monthPlanId: request.week.monthPlanId }
              : {}),
          },
    );
    this._initial = JSON.stringify(this.editor());
  }

  applyMonthSource(id: string): void {
    const draft = this.editor();
    if (!draft || draft.scope !== 'week') return;
    const source = this.journal.monthPlans().find((p) => p.id === id);
    this.editor.set({
      ...draft,
      monthPlanId: source?.id,
      ...(source
        ? {
            title: source.title,
            categoryId: source.categoryId,
            note: source.note ?? '',
            taskId: source.taskId,
          }
        : {}),
    });
  }

  linkTask(id: string): void {
    const draft = this.editor();
    if (!draft) return;
    const task = this.journal.taskById()[id];
    this.editor.set({
      ...draft,
      taskId: task?.id,
      ...(task && !draft.title.trim() ? { title: task.title } : {}),
    });
  }

  applyTemplate(template: JournalActivityTemplate): void {
    const draft = this.editor();
    if (!draft) return;
    const duration =
      template.duration ??
      (template.start && template.end
        ? parseJournalTime(template.end) - parseJournalTime(template.start)
        : undefined);
    this.editor.set({
      ...draft,
      title: template.title || draft.title || template.name || '',
      ...(template.categoryId ? { categoryId: template.categoryId } : {}),
      ...(template.note ? { note: template.note } : {}),
      ...(template.taskId !== undefined ? { taskId: template.taskId ?? undefined } : {}),
      ...(draft.scope === 'week' && duration && duration > 0
        ? { hours: duration / 60 }
        : {}),
    });
  }

  persistPendingChanges(force = false): boolean {
    const draft = this.editor();
    if (!draft) return true;
    if (
      !force &&
      JSON.stringify(draft) === this._initial &&
      (this._existing || !draft.title.trim())
    )
      return true;
    const common = {
      id: draft.id,
      title: draft.title,
      categoryId: draft.categoryId,
      ...(draft.note ? { note: draft.note } : {}),
      ...(draft.taskId ? { taskId: draft.taskId } : {}),
    };
    const error =
      draft.scope === 'month'
        ? this.journal.saveMonthPlan(draft.anchor, {
            ...common,
            fromDay: draft.fromDay,
            toDay: draft.toDay,
          })
        : this.journal.saveWeekPlan(draft.anchor, {
            ...common,
            day: draft.day,
            minutes: draft.hours * 60,
            ...(draft.monthPlanId ? { monthPlanId: draft.monthPlanId } : {}),
          });
    if (error) {
      this.error.set(this._translate.instant(T.F.JOURNAL[error]));
      return false;
    }
    this._initial = JSON.stringify(draft);
    this._existing = true;
    this.error.set('');
    return true;
  }
  closeEditors(): void {
    this.editor.set(null);
    this.monthSelection.set(null);
  }
  removeMonth(plan: JournalMonthPlanEntry): void {
    if (!this.persistPendingChanges()) return;
    this.journal.removeMonthPlan(plan);
    this.closeEditors();
    this.dismissRequested.emit(false);
  }
  removeWeek(plan: JournalWeekPlanEntry): void {
    if (!this.persistPendingChanges()) return;
    this.journal.removeWeekPlan(plan);
    this.closeEditors();
    this.dismissRequested.emit(false);
  }
}
