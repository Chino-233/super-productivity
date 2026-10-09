import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { nanoid } from 'nanoid';
import { MetricService } from '../metric/metric.service';
import { GlobalConfigService } from '../config/global-config.service';
import { TaskService } from '../tasks/task.service';
import { Metric } from '../metric/metric.model';
import {
  DEFAULT_JOURNAL_CATEGORIES,
  JournalActivity,
  JournalCategory,
  JournalPeriod,
} from './journal.model';
import {
  JournalActivityError,
  journalPeriodDays,
  journalTime,
  validateJournalActivity,
} from './journal.util';

@Injectable({ providedIn: 'root' })
export class JournalService {
  private readonly _metrics = inject(MetricService);
  private readonly _config = inject(GlobalConfigService);
  private readonly _tasks = inject(TaskService);

  readonly metrics = toSignal(this._metrics.getAllMetrics$(), { initialValue: [] });
  readonly byDay = computed(() =>
    Object.fromEntries(this.metrics().map((metric) => [metric.id, metric])),
  );
  readonly categories = computed(
    () => this._config.misc()?.journalCategories ?? DEFAULT_JOURNAL_CATEGORIES,
  );

  saveActivity(day: string, activity: JournalActivity): JournalActivityError | null {
    const entries = this.byDay()[day]?.journalActivities ?? [];
    const error = validateJournalActivity(activity, entries, this.categories());
    if (error) return error;
    this._metrics.updateMetric(day, {
      journalActivities: [
        ...entries.filter((entry) => entry.id !== activity.id),
        activity,
      ],
    });
    return null;
  }

  removeActivity(day: string, id: string): void {
    const entries = this.byDay()[day]?.journalActivities ?? [];
    this._metrics.updateMetric(day, {
      journalActivities: entries.filter((entry) => entry.id !== id),
    });
  }

  saveJournal(day: string, period: JournalPeriod, text: string, plan: string): void {
    const anchor = journalPeriodDays(day, period)[0];
    const changes: Partial<Metric> =
      period === 'day'
        ? { notes: text, journalPlan: plan }
        : period === 'week'
          ? { journalWeekly: { text, plan } }
          : { journalMonthly: { text, plan } };
    this._metrics.updateMetric(anchor, changes);
  }

  saveCategories(categories: JournalCategory[]): void {
    this._config.updateSection('misc', { journalCategories: categories }, true);
  }

  createTask(day: string, activity: JournalActivity): void {
    if (activity.taskId || activity.kind !== 'plan') return;
    const taskId = this._tasks.add(
      activity.title,
      false,
      {
        dueDay: day,
        timeEstimate: (activity.end - activity.start) * 60000,
        notes: `${day} ${journalTime(activity.start)}—${journalTime(activity.end)}\n${activity.note ?? ''}`,
      },
      false,
      true,
    );
    this.saveActivity(day, { ...activity, taskId });
  }

  newId(): string {
    return nanoid();
  }
}
