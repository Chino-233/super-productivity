import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { JournalService } from './journal.service';
import { MetricService } from '../metric/metric.service';
import { GlobalConfigService } from '../config/global-config.service';
import { TaskService } from '../tasks/task.service';
import { Metric } from '../metric/metric.model';
import { JournalActivity } from './journal.model';

describe('JournalService', () => {
  let service: JournalService;
  let updateMetric: jasmine.Spy;
  let tasks: jasmine.Spy;
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
        { provide: TaskService, useValue: { add: tasks } },
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

  it('creates a normal application task for a plan and retains the activity link', () => {
    service.createTask('2026-10-09', { ...initialActivity, id: 'plan', kind: 'plan' });
    expect(tasks).toHaveBeenCalledWith(
      'Work',
      false,
      jasmine.objectContaining({ dueDay: '2026-10-09', timeEstimate: 3600000 }),
      false,
      true,
    );
    expect(updateMetric.calls.mostRecent().args[1].journalActivities[1].taskId).toBe(
      'task-created',
    );
    tasks.calls.reset();
    service.createTask('2026-10-09', {
      ...initialActivity,
      kind: 'plan',
      taskId: 'existing',
    });
    expect(tasks).not.toHaveBeenCalled();
  });
});
