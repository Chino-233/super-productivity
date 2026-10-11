import {
  JournalActivity,
  JournalCategory,
  JournalMonthPlan,
  JournalWeekPlan,
} from './journal.model';
import { isJournalDate, journalPeriodDays } from './journal.util';

export type JournalPlanningError =
  | 'TITLE_REQUIRED'
  | 'INVALID_CATEGORY'
  | 'PLAN_DATES_INVALID'
  | 'BUDGET_INVALID'
  | 'BUDGET_DAY_INVALID'
  | 'MONTH_SOURCE_INVALID'
  | 'DAY_BUDGET_EXCEEDED'
  | 'TASK_BUDGET_DUPLICATE';

export const validateMonthPlan = (
  plan: JournalMonthPlan,
  categories: readonly JournalCategory[],
): JournalPlanningError | null => {
  if (!plan.title.trim()) return 'TITLE_REQUIRED';
  if (!categories.some((c) => c.id === plan.categoryId)) return 'INVALID_CATEGORY';
  if (
    !isJournalDate(plan.fromDay) ||
    !isJournalDate(plan.toDay) ||
    plan.toDay < plan.fromDay
  )
    return 'PLAN_DATES_INVALID';
  return null;
};

export const validateWeekPlan = (
  anchor: string,
  plan: JournalWeekPlan,
  existing: readonly JournalWeekPlan[],
  months: readonly JournalMonthPlan[],
  categories: readonly JournalCategory[],
): JournalPlanningError | null => {
  if (!plan.title.trim()) return 'TITLE_REQUIRED';
  if (!categories.some((c) => c.id === plan.categoryId)) return 'INVALID_CATEGORY';
  if (!journalPeriodDays(anchor, 'week').includes(plan.day)) return 'BUDGET_DAY_INVALID';
  if (
    !Number.isFinite(plan.minutes) ||
    plan.minutes < 15 ||
    plan.minutes > 1440 ||
    plan.minutes % 15
  )
    return 'BUDGET_INVALID';
  if (plan.monthPlanId) {
    const month = months.find((m) => m.id === plan.monthPlanId);
    if (!month || plan.day < month.fromDay || plan.day > month.toDay)
      return 'MONTH_SOURCE_INVALID';
  }
  const other = existing.filter((p) => p.id !== plan.id && p.day === plan.day);
  if (other.reduce((sum, p) => sum + p.minutes, plan.minutes) > 1440)
    return 'DAY_BUDGET_EXCEEDED';
  if (plan.taskId && other.some((p) => p.taskId === plan.taskId))
    return 'TASK_BUDGET_DUPLICATE';
  return null;
};

export const activityBelongsToWeekPlan = (
  activity: JournalActivity,
  plan: JournalWeekPlan,
): boolean =>
  activity.weekPlanId
    ? activity.weekPlanId === plan.id
    : !!plan.taskId && activity.id === `task:${plan.taskId}`;

export const weekPlanProgress = (
  plan: JournalWeekPlan,
  activities: readonly JournalActivity[],
): { planned: number; actual: number; remaining: number } => {
  let planned = 0;
  let actual = 0;
  for (const activity of activities) {
    if (!activityBelongsToWeekPlan(activity, plan)) continue;
    if (activity.kind === 'plan') planned += activity.end - activity.start;
    else actual += activity.end - activity.start;
  }
  return { planned, actual, remaining: Math.max(0, plan.minutes - planned) };
};
