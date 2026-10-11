import { JournalActivity } from './journal.model';
import { applyJournalTemplate, isValidJournalTemplate } from './journal-template.util';

describe('journal activity templates', () => {
  const draft: JournalActivity = {
    id: 'entry',
    title: 'Current activity',
    categoryId: 'life',
    kind: 'actual',
    start: 600,
    end: 645,
    note: 'Current note',
    taskId: 'original-task',
  };

  it('allows a name-only template and keeps all omitted values without mutation', () => {
    expect(isValidJournalTemplate({ id: 'preset', name: 'Shortcut' })).toBeTrue();
    expect(
      applyJournalTemplate(
        Object.freeze(draft),
        { id: 'preset', name: 'Shortcut' },
        false,
      ),
    ).toEqual(draft);
  });

  it('uses the shortcut name when an activity has no title', () => {
    expect(
      applyJournalTemplate({ ...draft, title: '' }, { id: 'preset', name: 'Walk' }, false)
        .title,
    ).toBe('Walk');
  });

  it('applies every preset field including fixed midnight end and a task link', () => {
    expect(
      applyJournalTemplate(
        draft,
        {
          id: 'preset',
          name: 'Night',
          title: 'Reading',
          categoryId: 'study',
          kind: 'plan',
          start: '23:00',
          end: '24:00',
          duration: 15,
          note: 'Line one\nLine two',
          taskId: 'linked-task',
        },
        true,
      ),
    ).toEqual({
      ...draft,
      title: 'Reading',
      categoryId: 'study',
      kind: 'plan',
      start: 1380,
      end: 1440,
      note: 'Line one\nLine two',
      taskId: 'linked-task',
    });
  });

  it('keeps a dragged range, but uses duration for a single slot and caps at midnight', () => {
    const template = {
      id: 'preset',
      title: 'Legacy shortcut',
      categoryId: 'life',
      duration: 60,
    };
    expect(applyJournalTemplate(draft, template, true).end).toBe(645);
    expect(applyJournalTemplate(draft, template, false).end).toBe(660);
    expect(
      applyJournalTemplate({ ...draft, start: 1425, end: 1440 }, template, false).end,
    ).toBe(1440);
  });

  it('moves a fixed start while preserving the current duration when duration is omitted', () => {
    expect(
      applyJournalTemplate(draft, { id: 'preset', name: 'Morning', start: '00:00' }, true)
        .end,
    ).toBe(45);
  });

  it('distinguishes inheriting a task from explicitly clearing it', () => {
    expect(
      applyJournalTemplate(draft, { id: 'preset', name: 'Clear', taskId: null }, false)
        .taskId,
    ).toBeUndefined();
    expect(
      applyJournalTemplate(draft, { id: 'preset', name: 'Keep' }, false).taskId,
    ).toBe('original-task');
  });

  it('accepts omitted fields and legacy entries but rejects invalid preset times and durations', () => {
    expect(
      isValidJournalTemplate({
        id: 'old',
        title: 'Legacy',
        categoryId: 'life',
        duration: 30,
      }),
    ).toBeTrue();
    expect(
      isValidJournalTemplate({
        id: 'midnight',
        name: 'Late',
        start: '23:45',
        end: '24:00',
      }),
    ).toBeTrue();
    for (const fields of [
      { start: '24:00' },
      { start: '09:01' },
      { end: '00:00' },
      { start: '12:00', end: '11:00' },
      { duration: 0 },
      { duration: 16 },
    ]) {
      expect(
        isValidJournalTemplate({ id: 'invalid', name: 'Invalid', ...fields }),
      ).toBeFalse();
    }
    expect(isValidJournalTemplate({ id: 'empty' })).toBeFalse();
  });
});
