export const JOURNAL_SLOT_MINUTES = 15;
export const JOURNAL_DAY_MINUTES = 1440;

// Native scheduled tasks may overlap even though manual journal intervals do not.
export const layoutJournalCalendar = <
  T extends { id: string; start: number; end: number; kind: string },
>(
  activities: readonly T[],
): Map<string, { column: number; columns: number }> => {
  const layout = new Map<string, { column: number; columns: number }>();
  for (const kind of new Set(activities.map((entry) => entry.kind))) {
    const entries = activities
      .filter((entry) => entry.kind === kind)
      .slice()
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let active: { end: number; column: number }[] = [];
    let group: { id: string; column: number }[] = [];
    let columns = 0;
    const flush = (): void => {
      for (const entry of group) layout.set(entry.id, { column: entry.column, columns });
      group = [];
      columns = 0;
    };
    for (const entry of entries) {
      active = active.filter((other) => other.end > entry.start);
      if (!active.length && group.length) flush();
      let column = 0;
      while (active.some((other) => other.column === column)) column++;
      active.push({ end: entry.end, column });
      group.push({ id: entry.id, column });
      columns = Math.max(columns, column + 1);
    }
    flush();
  }
  return layout;
};

export const journalSlot = (minute: number): number =>
  Math.max(0, Math.min(1425, Math.floor(minute / 15) * 15));

export const journalSelection = (
  anchor: number,
  current: number,
): {
  start: number;
  end: number;
} => ({
  start: Math.min(journalSlot(anchor), journalSlot(current)),
  end: Math.max(journalSlot(anchor), journalSlot(current)) + 15,
});

export const journalDragRange = (
  original: { start: number; end: number },
  delta: number,
  mode: 'move' | 'start' | 'end',
): { start: number; end: number } => {
  const snap = (value: number): number => Math.round(value / 15) * 15;
  if (mode === 'start')
    return {
      start: Math.max(0, Math.min(snap(original.start + delta), original.end - 15)),
      end: original.end,
    };
  if (mode === 'end')
    return {
      start: original.start,
      end: Math.min(1440, Math.max(snap(original.end + delta), original.start + 15)),
    };
  const duration = original.end - original.start;
  const start = Math.max(0, Math.min(1440 - duration, snap(original.start + delta)));
  return { start, end: start + duration };
};
