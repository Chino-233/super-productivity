import { expect, test } from '../../fixtures/test.fixture';
import { waitForStatePersistence } from '../../utils/waits';

test('persists a complete linked plan template and preserves omitted fields', async ({
  page,
  workViewPage,
  testPrefix,
}) => {
  await workViewPage.waitForTaskList();
  await workViewPage.addTask('Template linked task');
  await waitForStatePersistence(page);
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  await journal.getByRole('button', { name: 'Customize', exact: true }).click();
  await journal.getByRole('button', { name: 'Add common activity', exact: true }).click();
  await expect(journal.locator('.template-fields')).toHaveCount(6);
  const full = journal.locator('.template-fields').last();
  await full.getByLabel('Template name', { exact: true }).fill('Evening reading');
  await full.locator('summary').click();
  await full.getByLabel('What did you do?', { exact: true }).fill('Read chapter');
  await full.getByLabel('Category', { exact: true }).selectOption('study');
  await full.getByLabel('Type', { exact: true }).selectOption('plan');
  await full.getByLabel('Start', { exact: true }).fill('18:15');
  await full.getByLabel('End', { exact: true }).fill('19:00');
  await full
    .getByLabel('Linked task', { exact: true })
    .selectOption({ label: `${testPrefix}-Template linked task` });
  await full
    .getByLabel('Notes / feelings', { exact: true })
    .fill('First line\nSecond line');
  await journal.getByRole('button', { name: 'Add common activity', exact: true }).click();
  await expect(journal.locator('.template-fields')).toHaveCount(7);
  await journal
    .locator('.template-fields')
    .last()
    .getByLabel('Template name', { exact: true })
    .fill('Keep my inputs');
  await journal
    .locator('.template-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(journal.locator('.template-editor')).not.toBeVisible();
  await waitForStatePersistence(page);
  await page.reload();
  await journal.getByRole('button', { name: 'Evening reading', exact: true }).click();
  await expect(journal.locator('#journal-activity-title')).toHaveValue('Read chapter');
  await expect(journal.locator('#journal-category')).toHaveValue('study');
  await expect(journal.locator('#journal-kind')).toHaveValue('plan');
  await expect(journal.locator('#journal-start')).toHaveValue('18:15');
  await expect(journal.locator('#journal-end')).toHaveValue('19:00');
  await expect(journal.locator('#journal-task')).not.toHaveValue('');
  await expect(journal.locator('#journal-activity-note')).toHaveValue(
    'First line\nSecond line',
  );
  await journal
    .getByRole('dialog')
    .getByRole('button', { name: 'Keep my inputs', exact: true })
    .click();
  await expect(journal.locator('#journal-activity-title')).toHaveValue('Read chapter');
  await expect(journal.locator('#journal-start')).toHaveValue('18:15');
  await expect(journal.locator('#journal-end')).toHaveValue('19:00');
  await expect(journal.locator('#journal-task')).not.toHaveValue('');
  await expect(journal.locator('#journal-activity-note')).toHaveValue(
    'First line\nSecond line',
  );
  await journal
    .getByRole('dialog')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await journal.getByRole('button', { name: 'Planned activities', exact: true }).click();
  await expect(journal.locator('.block-body')).toContainText('Read chapter');
  await page.goto('/#/tag/TODAY/tasks');
  await expect(page.locator('task')).toContainText('Read chapter');
});

test('saves all editor fields as a template without saving the activity', async ({
  page,
}) => {
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  await journal.getByRole('button', { name: 'Record activity', exact: true }).click();
  await journal.locator('#journal-activity-title').fill('Stretching');
  await journal.locator('#journal-category').selectOption('life');
  await journal.locator('#journal-start').fill('14:15');
  await journal.locator('#journal-end').fill('14:45');
  await journal.locator('#journal-activity-note').fill('Easy pace\nDrink water');
  await journal
    .getByRole('button', { name: 'Save as common template', exact: true })
    .click();
  await expect(journal.getByRole('status')).toHaveText(
    'Template saved. The activity has not been saved yet.',
  );
  await journal
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(journal.locator('.calendar-block')).toHaveCount(0);
  await waitForStatePersistence(page);
  await page.reload();
  await journal.getByRole('button', { name: 'Stretching', exact: true }).click();
  await expect(journal.locator('#journal-activity-title')).toHaveValue('Stretching');
  await expect(journal.locator('#journal-category')).toHaveValue('life');
  await expect(journal.locator('#journal-kind')).toHaveValue('actual');
  await expect(journal.locator('#journal-start')).toHaveValue('14:15');
  await expect(journal.locator('#journal-end')).toHaveValue('14:45');
  await expect(journal.locator('#journal-task')).toHaveValue('');
  await expect(journal.locator('#journal-activity-note')).toHaveValue(
    'Easy pace\nDrink water',
  );
});
