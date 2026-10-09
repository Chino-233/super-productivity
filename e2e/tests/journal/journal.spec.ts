import { test, expect } from '../../fixtures/test.fixture';
import { waitForStatePersistence } from '../../utils/waits';

test('persists activities and period journals, rejects overlap and creates native tasks', async ({
  page,
}) => {
  await page.locator('magic-side-nav a[href="#/journal"]').click();
  const journal = page.locator('journal');
  await expect(journal).toBeVisible();
  const day = await journal.locator('input[type="date"]').inputValue();
  await journal.getByRole('button', { name: 'Record activity', exact: true }).click();
  await journal.locator('#journal-activity-title').fill('Journal study activity');
  await journal.locator('#journal-start').fill('09:00');
  await journal.locator('#journal-end').fill('10:30');
  await journal
    .locator('.activity-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(journal.locator('.summary')).toContainText('1.5 hours');

  await journal.getByRole('button', { name: 'Record activity', exact: true }).click();
  await journal.locator('#journal-activity-title').fill('Overlapping activity');
  await journal.locator('#journal-start').fill('10:00');
  await journal.locator('#journal-end').fill('11:00');
  await journal
    .locator('.activity-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(journal.getByRole('alert')).toContainText('Journal study activity');
  await journal
    .locator('.activity-editor')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();

  await journal.locator('#journal-text').fill('Daily reflection');
  await journal.locator('#journal-plan').fill('Tomorrow plan');
  // Changing period saves the dirty daily draft.
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await journal.locator('#journal-text').fill('Weekly reflection');
  await journal.locator('#journal-plan').fill('Weekly plan');
  await journal.getByRole('button', { name: 'Monthly journal', exact: true }).click();
  await journal.locator('#journal-text').fill('Monthly reflection');
  await journal.locator('#journal-plan').fill('Monthly plan');
  await journal
    .getByRole('button', { name: 'Save journal and plan', exact: true })
    .click();
  await waitForStatePersistence(page);
  await page.reload();
  await expect(journal.locator('#journal-text')).toHaveValue('Daily reflection');
  await expect(journal.locator('#journal-plan')).toHaveValue('Tomorrow plan');
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await expect(journal.locator('#journal-text')).toHaveValue('Weekly reflection');
  await journal.getByRole('button', { name: 'Monthly journal', exact: true }).click();
  await expect(journal.locator('#journal-text')).toHaveValue('Monthly reflection');
  await journal.getByRole('button', { name: 'Daily journal', exact: true }).click();

  await journal.getByRole('button', { name: 'Record activity', exact: true }).click();
  await journal.locator('#journal-activity-title').fill('Native journal task');
  await journal.locator('#journal-start').fill('09:00');
  await journal.locator('#journal-end').fill('10:00');
  await journal.locator('#journal-kind').selectOption('plan');
  await journal
    .locator('.activity-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await journal.getByRole('button', { name: 'List', exact: true }).click();
  await journal.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(
    journal.getByRole('button', { name: 'Task created', exact: true }),
  ).toBeDisabled();
  await journal.getByRole('button', { name: 'Record as actual', exact: true }).click();
  await journal.locator('#journal-start').fill('10:30');
  await journal.locator('#journal-end').fill('11:30');
  await journal
    .locator('.activity-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(journal.locator('.summary')).toContainText('2.5 hours');

  const downloadPromise = page.waitForEvent('download');
  await journal.getByRole('button', { name: 'Export Markdown', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`journal-day-${day}.md`);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const markdown = Buffer.concat(chunks).toString();
  expect(markdown).toContain('Daily reflection');
  expect(markdown).toContain('Journal study activity');
  await waitForStatePersistence(page);
  await page.goto('/#/tag/TODAY/tasks');
  await expect(
    page.locator('task-title').filter({ hasText: 'Native journal task' }),
  ).toBeVisible();
  await page.goto('/#/config');
  await page.getByRole('tab', { name: 'Sync & Backup', exact: true }).click();
  await page
    .locator('collapsible')
    .filter({ hasText: 'Import/Export' })
    .locator('.collapsible-header')
    .click();
  const backupPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Data', exact: true }).click();
  const backupStream = await (await backupPromise).createReadStream();
  const backupChunks: Buffer[] = [];
  for await (const chunk of backupStream!) backupChunks.push(chunk);
  const backup = Buffer.concat(backupChunks).toString();
  expect(backup).toContain('journalActivities');
  expect(backup).toContain('Weekly reflection');
  expect(backup).toContain('Monthly reflection');
  expect(backup).toContain('Daily reflection');
});

test('uses the original Chinese settings and persists custom journal categories', async ({
  page,
}) => {
  await page.locator('magic-side-nav a').filter({ hasText: 'Settings' }).click();
  await page.getByText('Localization', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: '中文(简体)', exact: true }).click();
  await page.locator('magic-side-nav a[href="#/journal"]').click();
  const journal = page.locator('journal');
  await expect(journal.locator('h1')).toContainText('日记');
  await expect(journal.locator('.distribution').first()).toContainText('学习');
  await journal.getByRole('button', { name: '分类与颜色', exact: true }).click();
  const names = journal.locator('.category-editor input:not([type="color"])');
  await names.first().fill('上课 / 科研');
  await journal
    .locator('.category-editor')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(journal.locator('.distribution').first()).toContainText('上课 / 科研');
  await waitForStatePersistence(page);
  await page.reload();
  await expect(journal.locator('.distribution').first()).toContainText('上课 / 科研');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await journal.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
