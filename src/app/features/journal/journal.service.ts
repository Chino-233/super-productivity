import { computed, inject, Injectable } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { nanoid } from 'nanoid';
import { from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Store } from '@ngrx/store';
import { TaskArchiveService } from '../archive/task-archive.service';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { Task } from '../tasks/task.model';
import { MetricService } from '../metric/metric.service';
import { GlobalConfigService } from '../config/global-config.service';
import { TaskService } from '../tasks/task.service';
import { Metric } from '../metric/metric.model';
import {
  DEFAULT_JOURNAL_CATEGORIES,
  DEFAULT_JOURNAL_TEMPLATES,
  JournalActivity,
  JournalActivityTemplate,
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
  private readonly _store = inject(Store);
  private readonly _archive = inject(TaskArchiveService);

  readonly metrics = toSignal(this._metrics.getAllMetrics$(), { initialValue: [] });
  readonly activeTasks = toSignal(this._tasks.allTasks$, { initialValue: [] });
  private readonly _activeTaskIds = computed(() =>
    this.activeTasks()
      .map((task) => task.id)
      .join(','),
  );
  private readonly _historicalTasks = toSignal(
    toObservable(this._activeTaskIds).pipe(
      switchMap(() => from(this._archive.load())),
      map((archive) =>
        archive.ids
          .map((id) => archive.entities[id])
          .filter((task): task is Task => !!task),
      ),
    ),
    { initialValue: [] },
  );
  readonly tasks = computed(() => {
    const active = new Map(this.activeTasks().map((task) => [task.id, task]));
    for (const task of this._historicalTasks())
      if (!active.has(task.id)) active.set(task.id, task);
    return [...active.values()];
  });
  readonly taskById = computed(() =>
    Object.fromEntries(this.tasks().map((task) => [task.id, task])),
  );
  readonly currentTask = toSignal(this._tasks.currentTask$, { initialValue: null });
  readonly byDay = computed(() =>
    Object.fromEntries(this.metrics().map((metric) => [metric.id, metric])),
  );
  readonly categories = computed(
    () => this._config.misc()?.journalCategories ?? DEFAULT_JOURNAL_CATEGORIES,
  );
  readonly templates = computed(
    () => this._config.misc()?.journalActivityTemplates ?? DEFAULT_JOURNAL_TEMPLATES,
  );
  readonly activitiesByDay = computed(() => {
    const result: Record<string, JournalActivity[]> = {};
    const linkedPlans = new Map<string, JournalActivity>();
    for (const metric of this.metrics()) {
      result[metric.id] = [];
      for (const activity of metric.journalActivities ?? []) {
        if (
          activity.kind === 'plan' &&
          activity.taskId &&
          this.taskById()[activity.taskId]
        )
          linkedPlans.set(activity.taskId, activity);
        else result[metric.id].push(activity);
      }
    }
    for (const task of this.activeTasks()) {
      if (!task.dueWithTime) continue;
      const date = new Date(task.dueWithTime);
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const hourMinutes = date.getHours() * 60;
      const start = hourMinutes + date.getMinutes();
      const previous = linkedPlans.get(task.id);
      (result[day] ??= []).push({
        id: `task:${task.id}`,
        taskId: task.id,
        title: task.title,
        start,
        end: Math.min(
          1440,
          start + Math.max(15, Math.ceil((task.timeEstimate || 900000) / 60000)),
        ),
        categoryId: task.journalCategoryId ?? previous?.categoryId ?? 'work',
        kind: 'plan',
        note: task.notes ?? '',
      });
    }
    for (const [taskId, activity] of linkedPlans) {
      const task = this.taskById()[taskId];
      if (task.dueWithTime || !task.dueDay) continue;
      (result[task.dueDay] ??= []).push({ ...activity, title: task.title });
    }
    return result;
  });

  saveActivity(day: string, activity: JournalActivity): JournalActivityError | null {
    const entries = this.byDay()[day]?.journalActivities ?? [];
    const error = validateJournalActivity(
      activity,
      this.activitiesByDay()[day] ?? [],
      this.categories(),
    );
    if (error) return error;
    if (activity.kind === 'plan' && activity.taskId) {
      const task = this.activeTasks().find((entry) => entry.id === activity.taskId);
      if (!task) return { code: 'TASK_UNAVAILABLE' };
      const dueWithTime = new Date(`${day}T${journalTime(activity.start)}:00`).getTime();
      this._tasks.update(task.id, {
        title: activity.title,
        timeEstimate: (activity.end - activity.start) * 60000,
        dueWithTime,
        ...(task.remindAt && task.dueWithTime
          ? { remindAt: task.remindAt + (dueWithTime - task.dueWithTime) }
          : {}),
        dueDay: null,
        hasPlannedTime: true,
        journalCategoryId: activity.categoryId,
        notes: activity.note ?? '',
      });
      return null;
    }
    this._metrics.updateMetric(day, {
      journalActivities: [
        ...entries.filter((entry) => entry.id !== activity.id),
        activity,
      ],
    });
    return null;
  }

  removeActivity(day: string, id: string): void {
    if (id.startsWith('task:')) {
      this._store.dispatch(TaskSharedActions.unscheduleTask({ id: id.slice(5) }));
      return;
    }
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

  saveTemplates(templates: JournalActivityTemplate[]): void {
    this._config.updateSection('misc', { journalActivityTemplates: templates }, true);
  }

  toggleTask(task: Task): void {
    this._tasks.update(task.id, { isDone: !task.isDone });
  }

  trackTask(task: Task): void {
    this._tasks.setCurrentId(this.currentTask()?.id === task.id ? null : task.id);
  }

  createTask(day: string, activity: JournalActivity): void {
    if (activity.taskId || activity.kind !== 'plan') return;
    this._tasks.add(
      activity.title,
      false,
      {
        dueWithTime: new Date(`${day}T${journalTime(activity.start)}:00`).getTime(),
        dueDay: null,
        hasPlannedTime: true,
        journalCategoryId: activity.categoryId,
        timeEstimate: (activity.end - activity.start) * 60000,
        notes: activity.note ?? '',
      },
      false,
      true,
    );
    // The task carries its own schedule/category; remove the old manual plan.
    this.removeActivity(day, activity.id);
  }

  newId(): string {
    return nanoid();
  }
}
