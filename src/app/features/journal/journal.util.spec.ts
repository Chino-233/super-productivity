import { JournalActivity, DEFAULT_JOURNAL_CATEGORIES } from './journal.model';
import {
  isJournalDate,
  journalPeriodDays,
  parseJournalTime,
  summarizeJournalActivities,
  validateJournalActivity,
} from './journal.util';

const activity = (
  id: string,
  start: number,
  end: number,
  kind: 'actual' | 'plan' = 'actual',
): JournalActivity => ({
  id,
  title: id,
  start,
  end,
  kind,
  categoryId: 'work',
});

describe('Journal utilities', () => {
  it('accepts 24:00 only as a valid midnight endpoint', () => {
    expect(parseJournalTime('24:00')).toBe(1440);
    expect(parseJournalTime('09:05')).toBe(545);
    for (const value of ['24:01', '09:60', '9:30', ''])
      expect(Number.isNaN(parseJournalTime(value))).toBeTrue();
  });

  it('rejects overlaps but permits adjacent activities and editing the same entry', () => {
    const entries = [activity('a', 60, 120)];
    expect(
      validateJournalActivity(
        activity('b', 120, 180),
        entries,
        DEFAULT_JOURNAL_CATEGORIES,
      ),
    ).toBeNull();
    expect(
      validateJournalActivity(
        activity('a', 90, 180),
        entries,
        DEFAULT_JOURNAL_CATEGORIES,
      ),
    ).toBeNull();
    expect(
      validateJournalActivity(activity('b', 90, 180), entries, DEFAULT_JOURNAL_CATEGORIES)
        ?.code,
    ).toBe('OVERLAP');
  });

  it('permits plans and actual activities at the same time', () => {
    expect(
      validateJournalActivity(
        activity('plan', 0, 60, 'plan'),
        [activity('actual', 0, 60)],
        DEFAULT_JOURNAL_CATEGORIES,
      ),
    ).toBeNull();
  });

  it('rejects reversed, zero, fractional and out-of-day intervals', () => {
    for (const [start, end] of [
      [60, 30],
      [0, 0],
      [0.5, 60],
      [-1, 60],
      [0, 1441],
    ]) {
      expect(
        validateJournalActivity(activity('a', start, end), [], DEFAULT_JOURNAL_CATEGORIES)
          ?.code,
      ).toBe('INVALID_TIME');
    }
  });

  it('starts weeks on Monday across a year boundary', () => {
    expect(journalPeriodDays('2027-01-03', 'week')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('includes leap days and rejects impossible dates', () => {
    expect(journalPeriodDays('2028-02-15', 'month').length).toBe(29);
    expect(journalPeriodDays('2027-02-15', 'month').length).toBe(28);
    expect(isJournalDate('2028-02-29')).toBeTrue();
    expect(isJournalDate('2027-02-29')).toBeFalse();
  });

  it('keeps planned time separate from actual classification totals', () => {
    const entries = [
      activity('a', 0, 60),
      activity('b', 120, 210),
      activity('p', 0, 180, 'plan'),
    ];
    expect(summarizeJournalActivities(entries)).toEqual({
      total: 150,
      count: 2,
      byCategory: { work: 150 },
    });
    expect(summarizeJournalActivities(entries, 'plan').total).toBe(180);
  });
});
