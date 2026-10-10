import {
  journalDragRange,
  journalSelection,
  journalSlot,
  layoutJournalCalendar,
} from './journal-calendar.util';

describe('Journal calendar gestures', () => {
  it('shows overlapping native plans side by side and gives adjacent entries the full lane', () => {
    const result = layoutJournalCalendar([
      { id: 'a', start: 540, end: 600, kind: 'plan' },
      { id: 'b', start: 570, end: 630, kind: 'plan' },
      { id: 'c', start: 630, end: 660, kind: 'plan' },
      { id: 'actual', start: 540, end: 600, kind: 'actual' },
    ]);
    expect(result.get('a')).toEqual({ column: 0, columns: 2 });
    expect(result.get('b')).toEqual({ column: 1, columns: 2 });
    expect(result.get('c')).toEqual({ column: 0, columns: 1 });
    expect(result.get('actual')).toEqual({ column: 0, columns: 1 });
  });
  it('selects quarter-hour slots in either direction and includes the final slot', () => {
    expect(journalSelection(540, 585)).toEqual({ start: 540, end: 600 });
    expect(journalSelection(585, 540)).toEqual({ start: 540, end: 600 });
    expect(journalSelection(1425, 1440)).toEqual({ start: 1425, end: 1440 });
    expect(journalSlot(-30)).toBe(0);
  });

  it('moves an activity without changing duration or crossing midnight', () => {
    expect(journalDragRange({ start: 540, end: 600 }, 19, 'move')).toEqual({
      start: 555,
      end: 615,
    });
    expect(journalDragRange({ start: 540, end: 600 }, -900, 'move')).toEqual({
      start: 0,
      end: 60,
    });
    expect(journalDragRange({ start: 540, end: 600 }, 900, 'move')).toEqual({
      start: 1380,
      end: 1440,
    });
  });

  it('resizes either edge with a minimum 15-minute duration', () => {
    expect(journalDragRange({ start: 540, end: 600 }, 500, 'start')).toEqual({
      start: 585,
      end: 600,
    });
    expect(journalDragRange({ start: 540, end: 600 }, -500, 'end')).toEqual({
      start: 540,
      end: 555,
    });
    expect(journalDragRange({ start: 1380, end: 1410 }, 100, 'end')).toEqual({
      start: 1380,
      end: 1440,
    });
  });
});
