import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { JournalService } from './journal.service';
import { MetricService } from '../metric/metric.service';
import { GlobalConfigService } from '../config/global-config.service';
import { TaskService } from '../tasks/task.service';
import { Metric } from '../metric/metric.model';
import { JournalActivity } from './journal.model';
import { Task } from '../tasks/task.model';
import { TaskArchiveService } from '../archive/task-archive.service';
import { Store } from '@ngrx/store';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';

describe('JournalService', () => {
  let service: JournalService;
  let updateMetric: jasmine.Spy;
  let tasks: jasmine.Spy;
  let taskChanges: jasmine.Spy;
  let activeTasks: BehaviorSubject<Task[]>;
  let dispatch: jasmine.Spy;
  const initialActivity: JournalActivity = {
    id: 'a',
    title: 'Work',
    start: 540,
    end: 600,
    categoryId: 'work',
    kind: 'actual',
  };

  beforeEach(() => {
    updateMetric = jasmine.createSpy('updateMetric');
    tasks = jasmine.createSpy('add').and.returnValue('task-created');
    taskChanges = jasmine.createSpy('update');
    dispatch = jasmine.createSpy('dispatch');
    activeTasks = new BehaviorSubject<Task[]>([]);
    TestBed.configureTestingModule({
      providers: [
        JournalService,
        {
          provide: MetricService,
          useValue: {
            getAllMetrics$: () =>
              new BehaviorSubject<Metric[]>([
                {
                  id: '2026-10-09',
                  focusSessions: [1000],
                  journalActivities: [initialActivity],
                },
              ]),
            updateMetric,
          },
        },
        {
          provide: GlobalConfigService,
          useValue: {
            misc: () => ({}),
            updateSection: jasmine.createSpy('updateSection'),
          },
        },
        {
          provide: TaskService,
          useValue: {
            add: tasks,
            update: taskChanges,
            allTasks$: activeTasks,
            currentTask$: new BehaviorSubject(null),
            setCurrentId: jasmine.createSpy('setCurrentId'),
          },
        },
        {
          provide: TaskArchiveService,
          useValue: { load: () => Promise.resolve({ ids: [], entities: {} }) },
        },
        { provide: Store, useValue: { dispatch } },
      ],
    });
    service = TestBed.inject(JournalService);
  });

  it('defaults old metrics and configuration without adding required persisted fields', () => {
    expect(service.categories().length).toBe(7);
    expect(service.byDay()['2026-10-09'].journalWeekly).toBeUndefined();
  });

  it('validates before dispatching a day-scoped activity patch', () => {
    expect(
      service.saveActivity('2026-10-09', {
        ...initialActivity,
        id: 'b',
        start: 570,
        end: 630,
      })?.code,
    ).toBe('OVERLAP');
    expect(updateMetric).not.toHaveBeenCalled();
    expect(
      service.saveActivity('2026-10-09', {
        ...initialActivity,
        id: 'b',
        start: 600,
        end: 660,
      }),
    ).toBeNull();
    const [day, patch] = updateMetric.calls.mostRecent().args;
    expect(day).toBe('2026-10-09');
    expect(patch.journalActivities.length).toBe(2);
    expect(patch.focusSessions).toBeUndefined();
  });

  it('writes week and month reflections to calendar-day anchors without replacing daily notes', () => {
    service.saveJournal('2026-10-09', 'week', 'Week reflection', 'Next week');
    expect(updateMetric).toHaveBeenCalledWith('2026-10-05', {
      journalWeekly: { text: 'Week reflection', plan: 'Next week' },
    });
    service.saveJournal('2026-10-09', 'month', 'Month reflection', 'Next month');
    expect(updateMetric).toHaveBeenCalledWith('2026-10-01', {
      journalMonthly: { text: 'Month reflection', plan: 'Next month' },
    });
  });

  it('converts a manual plan to a native timed task without keeping a duplicate plan', () => {
    service.createTask('2026-10-09', { ...initialActivity, id: 'plan', kind: 'plan' });
    expect(tasks).toHaveBeenCalledWith(
      'Work',
      false,
      jasmine.objectContaining({
        dueDay: null,
        dueWithTime: new Date('2026-10-09T09:00:00').getTime(),
        timeEstimate: 3600000,
        journalCategoryId: 'work',
      }),
      false,
      true,
    );
    expect(updateMetric.calls.mostRecent().args[1].journalActivities).toEqual([
      initialActivity,
    ]);
    tasks.calls.reset();
    service.createTask('2026-10-09', {
      ...initialActivity,
      kind: 'plan',
      taskId: 'existing',
    });
    expect(tasks).not.toHaveBeenCalled();
  });

  it('derives a calendar plan from the current task rather than copying its name or schedule', () => {
    const task = {
      id: 'native',
      title: 'Original',
      dueWithTime: new Date('2026-10-09T12:00:00').getTime(),
      timeEstimate: 1800000,
      journalCategoryId: 'study',
      timeSpentOnDay: {},
      subTaskIds: [],
    } as unknown as Task;
    activeTasks.next([task]);
    expect(service.activitiesByDay()['2026-10-09'][1]).toEqual(
      jasmine.objectContaining({
        id: 'task:native',
        title: 'Original',
        start: 720,
        end: 750,
      }),
    );
    activeTasks.next([
      {
        ...task,
        title: 'Renamed',
        dueWithTime: new Date('2026-10-10T13:15:00').getTime(),
      },
    ]);
    expect(service.activitiesByDay()['2026-10-09']).toEqual([initialActivity]);
    expect(service.activitiesByDay()['2026-10-10'][0]).toEqual(
      jasmine.objectContaining({ title: 'Renamed', start: 795, end: 825 }),
    );
  });

  it('updates the original task in one task patch and does not write a duplicate metric activity', () => {
    activeTasks.next([
      {
        id: 'native',
        title: 'Task',
        dueWithTime: new Date('2026-10-09T12:00:00').getTime(),
        timeEstimate: 1800000,
        timeSpentOnDay: {},
      } as unknown as Task,
    ]);
    const plan = service.activitiesByDay()['2026-10-09'][1];
    expect(
      service.saveActivity('2026-10-09', {
        ...plan,
        start: 750,
        end: 795,
        title: 'Updated',
      }),
    ).toBeNull();
    expect(taskChanges).toHaveBeenCalledWith(
      'native',
      jasmine.objectContaining({
        title: 'Updated',
        timeEstimate: 2700000,
        dueWithTime: new Date('2026-10-09T12:30:00').getTime(),
        dueDay: null,
      }),
    );
    expect(updateMetric).not.toHaveBeenCalled();
  });

  it('cancels a calendar task schedule through the original unschedule action without deleting the task', () => {
    service.removeActivity('2026-10-09', 'task:native');
    expect(dispatch).toHaveBeenCalledWith(
      TaskSharedActions.unscheduleTask({ id: 'native' }),
    );
    expect(updateMetric).not.toHaveBeenCalled();
  });

  it('stores customized common activities in the existing configuration section, including an empty list', () => {
    const config = TestBed.inject(GlobalConfigService);
    service.saveTemplates([
      { id: 'dog', title: 'Walk the dog', duration: 45, categoryId: 'life' },
    ]);
    expect(config.updateSection).toHaveBeenCalledWith(
      'misc',
      {
        journalActivityTemplates: [
          { id: 'dog', title: 'Walk the dog', duration: 45, categoryId: 'life' },
        ],
      },
      true,
    );
    service.saveTemplates([]);
    expect(config.updateSection).toHaveBeenCalledWith(
      'misc',
      { journalActivityTemplates: [] },
      true,
    );
  });
});
