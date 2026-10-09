export type JournalPeriod = 'day' | 'week' | 'month';
export type JournalActivityKind = 'actual' | 'plan';

export interface JournalCategory {
  id: string;
  name: string;
  color: string;
}

export interface JournalActivity {
  id: string;
  start: number;
  end: number;
  title: string;
  categoryId: string;
  kind: JournalActivityKind;
  note?: string;
  taskId?: string;
}

export interface JournalPeriodEntry {
  text: string;
  plan: string;
}

export const DEFAULT_JOURNAL_CATEGORIES: JournalCategory[] = [
  { id: 'study', name: 'F.JOURNAL.CATEGORY_STUDY', color: '#e8a75d' },
  { id: 'work', name: 'F.JOURNAL.CATEGORY_WORK', color: '#69aee3' },
  { id: 'life', name: 'F.JOURNAL.CATEGORY_LIFE', color: '#92bd77' },
  { id: 'leisure', name: 'F.JOURNAL.CATEGORY_LEISURE', color: '#eacb62' },
  { id: 'sleep', name: 'F.JOURNAL.CATEGORY_SLEEP', color: '#b0a3d2' },
  { id: 'travel', name: 'F.JOURNAL.CATEGORY_TRAVEL', color: '#96a7b5' },
  { id: 'other', name: 'F.JOURNAL.CATEGORY_OTHER', color: '#db9a99' },
];
