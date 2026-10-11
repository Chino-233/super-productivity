import { JournalActivity, JournalActivityTemplate } from './journal.model';
import { parseJournalTime } from './journal.util';

export const isValidJournalTemplate = (template: JournalActivityTemplate): boolean => {
  if (!(template.name?.trim() || template.title?.trim())) return false;
  if (
    template.duration != null &&
    (!Number.isInteger(template.duration) ||
      template.duration < 15 ||
      template.duration > 1440 ||
      template.duration % 15 !== 0)
  )
    return false;
  const start = template.start ? parseJournalTime(template.start) : undefined;
  const end = template.end ? parseJournalTime(template.end) : undefined;
  if (start !== undefined && (!Number.isInteger(start) || start >= 1440 || start % 15))
    return false;
  if (end !== undefined && (!Number.isInteger(end) || end <= 0 || end % 15)) return false;
  return start === undefined || end === undefined || end > start;
};

export const applyJournalTemplate = (
  draft: JournalActivity,
  template: JournalActivityTemplate,
  keepSelectedRange: boolean,
): JournalActivity => {
  const start = template.start ? parseJournalTime(template.start) : draft.start;
  const end = template.end
    ? parseJournalTime(template.end)
    : template.duration && (!keepSelectedRange || template.start)
      ? Math.min(1440, start + template.duration)
      : template.start
        ? Math.min(1440, start + (draft.end - draft.start))
        : draft.end;
  const { taskId: previousTaskId, ...previous } = draft;
  const taskId = template.taskId === undefined ? previousTaskId : template.taskId;
  return {
    ...previous,
    start,
    end,
    title: template.title?.trim() || draft.title || template.name?.trim() || '',
    categoryId: template.categoryId || draft.categoryId,
    kind: template.kind || draft.kind,
    note: template.note || draft.note,
    ...(taskId ? { taskId } : {}),
  };
};
