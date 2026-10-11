import {
  validateMonthPlan,
  validateWeekPlan,
  weekPlanProgress,
  JournalPlanningError,
} from './journal-planning.util';
import { JournalActivity, JournalMonthPlan, JournalWeekPlan } from './journal.model';

describe('Journal planning hierarchy', () => {
  const categories = [{ id: 'work', name: 'Work', color: '#123456' }];
  const month: JournalMonthPlan = {
    id: 'month',
    title: 'Report',
    fromDay: '2026-10-12',
    toDay: '2026-11-03',
    categoryId: 'work',
  };
  const week: JournalWeekPlan = {
    id: 'week',
    title: 'Report session',
    day: '2026-10-14',
    minutes: 120,
    categoryId: 'work',
    monthPlanId: 'month',
    taskId: 'task',
  };
  const segment: JournalActivity = {
    id: 'segment',
    title: 'Report session',
    start: 540,
    end: 600,
    categoryId: 'work',
    kind: 'plan',
    weekPlanId: 'week',
    taskId: 'task',
    taskLinkMode: 'reference',
  };

  it('supports inclusive and cross-month ranges and rejects reversed or impossible dates', () => {
    expect(validateMonthPlan(month, categories)).toBeNull();
    expect(validateMonthPlan({ ...month, toDay: month.fromDay }, categories)).toBeNull();
    expect(validateMonthPlan({ ...month, toDay: '2026-10-11' }, categories)).toBe(
      'PLAN_DATES_INVALID',
    );
    expect(validateMonthPlan({ ...month, fromDay: '2026-02-30' }, categories)).toBe(
      'PLAN_DATES_INVALID',
    );
  });

  it('validates day, quarter-hours and monthly source before allocating a budget', () => {
    const validate = (changes: Partial<JournalWeekPlan>): JournalPlanningError | null =>
      validateWeekPlan('2026-10-12', { ...week, ...changes }, [], [month], categories);
    expect(validate({ minutes: 15 })).toBeNull();
    expect(validate({ minutes: 18 })).toBe('BUDGET_INVALID');
    expect(validate({ minutes: Number.NaN })).toBe('BUDGET_INVALID');
    expect(validate({ day: '2026-10-19' })).toBe('BUDGET_DAY_INVALID');
    expect(validate({ day: '2026-10-11' })).toBe('BUDGET_DAY_INVALID');
    expect(validate({ monthPlanId: 'removed' })).toBe('MONTH_SOURCE_INVALID');
    expect(validate({ monthPlanId: undefined })).toBeNull();
  });

  it('limits each day to 24 hours and avoids counting a task in two budgets on that day', () => {
    const other = { ...week, id: 'other', taskId: 'other-task', minutes: 1320 };
    expect(validateWeekPlan('2026-10-12', week, [other], [month], categories)).toBeNull();
    expect(
      validateWeekPlan(
        '2026-10-12',
        { ...week, minutes: 135 },
        [other],
        [month],
        categories,
      ),
    ).toBe('DAY_BUDGET_EXCEEDED');
    expect(
      validateWeekPlan(
        '2026-10-12',
        week,
        [{ ...other, taskId: 'task', minutes: 15 }],
        [month],
        categories,
      ),
    ).toBe('TASK_BUDGET_DUPLICATE');
    expect(validateWeekPlan('2026-10-12', week, [week], [month], categories)).toBeNull();
  });

  it('derives split placement and actual totals without treating plans as actual', () => {
    expect(
      weekPlanProgress(week, [
        segment,
        { ...segment, id: 'second', start: 840, end: 870 },
        { ...segment, id: 'actual', kind: 'actual', start: 540, end: 585 },
        { ...segment, id: 'unrelated', weekPlanId: 'other' },
      ]),
    ).toEqual({ planned: 90, actual: 45, remaining: 30 });
  });

  it('counts native task placement but respects an explicit source on a manual segment', () => {
    expect(
      weekPlanProgress(week, [
        { ...segment, id: 'task:task', weekPlanId: undefined },
        { ...segment, id: 'task:task', weekPlanId: 'another-budget' },
      ]),
    ).toEqual({ planned: 60, actual: 0, remaining: 60 });
    expect(weekPlanProgress(week, [{ ...segment, end: 690 }]).remaining).toBe(0);
  });
});
