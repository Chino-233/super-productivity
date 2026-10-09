import {
  JournalActivity,
  JournalActivityKind,
  JournalCategory,
  JournalPeriod,
} from './journal.model';

export const journalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const isJournalDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  journalDate(new Date(`${value}T12:00:00`)) === value;

export const shiftJournalDay = (day: string, offset: number): string => {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return journalDate(date);
};

export const journalPeriodDays = (day: string, period: JournalPeriod): string[] => {
  const date = new Date(`${day}T12:00:00`);
  let start = day;
  let length = 1;
  if (period === 'week') {
    start = shiftJournalDay(day, -((date.getDay() + 6) % 7));
    length = 7;
  } else if (period === 'month') {
    start = `${day.slice(0, 7)}-01`;
    length = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }
  return Array.from({ length }, (_, index) => shiftJournalDay(start, index));
};

export const parseJournalTime = (value: string): number => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  const hourMinutes = hour * 60;
  return hourMinutes + minute;
};

export const journalTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export type JournalActivityError =
  | { code: 'TITLE_REQUIRED' | 'INVALID_TIME' | 'INVALID_CATEGORY' }
  | { code: 'OVERLAP'; title: string; start: string; end: string };

export const validateJournalActivity = (
  activity: JournalActivity,
  existing: readonly JournalActivity[],
  categories: readonly JournalCategory[],
): JournalActivityError | null => {
  if (!activity.title.trim()) return { code: 'TITLE_REQUIRED' };
  if (
    !Number.isInteger(activity.start) ||
    !Number.isInteger(activity.end) ||
    activity.start < 0 ||
    activity.end > 1440 ||
    activity.end <= activity.start
  ) {
    return { code: 'INVALID_TIME' };
  }
  if (
    !categories.some((category) => category.id === activity.categoryId) ||
    !['actual', 'plan'].includes(activity.kind)
  )
    return { code: 'INVALID_CATEGORY' };
  const overlap = existing.find(
    (entry) =>
      entry.id !== activity.id &&
      entry.kind === activity.kind &&
      activity.start < entry.end &&
      activity.end > entry.start,
  );
  return overlap
    ? {
        code: 'OVERLAP',
        title: overlap.title,
        start: journalTime(overlap.start),
        end: journalTime(overlap.end),
      }
    : null;
};

export const summarizeJournalActivities = (
  activities: readonly JournalActivity[],
  kind: JournalActivityKind = 'actual',
): { total: number; count: number; byCategory: Record<string, number> } => {
  const byCategory: Record<string, number> = {};
  let total = 0;
  let count = 0;
  for (const activity of activities) {
    if (activity.kind !== kind) continue;
    const minutes = activity.end - activity.start;
    total += minutes;
    count++;
    byCategory[activity.categoryId] = (byCategory[activity.categoryId] || 0) + minutes;
  }
  return { total, count, byCategory };
};
