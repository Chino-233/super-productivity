import { expect, test } from '../../fixtures/test.fixture';
import { waitForStatePersistence } from '../../utils/waits';

test('period buttons save all open editors including the current daily period', async ({
  page,
}) => {
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  await journal.locator('#journal-text').fill('Saved without pressing Save');
  await journal.locator('#journal-plan').fill('Tomorrow without pressing Save');
  await journal
    .getByRole('button', { name: 'Categories and colors', exact: true })
    .click();
  await journal
    .locator('.category-editor input:not([type="color"])')
    .first()
    .fill('Research');
  await journal.getByRole('button', { name: 'Customize', exact: true }).click();
  const template = journal.locator('.template-fields').first();
  await template.getByLabel('Template name', { exact: true }).fill('Reading preset');
  await template.locator('summary').click();
  await template.getByLabel('Notes / feelings', { exact: true }).fill('Preset notes');
  await journal.getByRole('button', { name: 'Record activity', exact: true }).click();
  await journal.locator('#journal-activity-title').fill('Close all session');
  await journal.locator('#journal-activity-note').fill('Activity notes');
  await journal
    .getByRole('button', { name: 'Save as common template', exact: true })
    .click();
  await expect(journal.getByRole('status')).toContainText('Template saved');
  await journal.getByRole('button', { name: 'Daily journal', exact: true }).click();
  await expect(journal.getByRole('dialog')).toHaveCount(0);
  await expect(journal.locator('.category-editor')).toHaveCount(0);
  await expect(journal.locator('.template-editor')).toHaveCount(0);
  await expect(journal.locator('.block-body')).toContainText('Close all session');
  // Switch immediately after typing to exercise the reflection debounce boundary.
  await journal.locator('reflection-note textarea').fill('Last reflection keystroke');
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await journal.locator('#journal-text').fill('Weekly text');
  await journal.locator('#journal-plan').fill('Weekly plan');
  await journal.getByRole('button', { name: 'Monthly journal', exact: true }).click();
  await journal.locator('#journal-text').fill('Monthly text');
  await journal.locator('#journal-plan').fill('Monthly plan');
  await journal.getByRole('button', { name: 'Monthly journal', exact: true }).click();
  await waitForStatePersistence(page);
  await page.reload();
  await expect(journal.locator('#journal-text')).toHaveValue(
    'Saved without pressing Save',
  );
  await expect(journal.locator('#journal-plan')).toHaveValue(
    'Tomorrow without pressing Save',
  );
  await expect(journal.locator('reflection-note textarea')).toHaveValue(
    'Last reflection keystroke',
  );
  await expect(journal.locator('.distribution').first()).toContainText('Research');
  await expect(
    journal
      .getByRole('complementary')
      .getByRole('button', { name: 'Close all session', exact: true }),
  ).toBeVisible();
  await journal.getByRole('button', { name: 'Customize', exact: true }).click();
  const persisted = journal.locator('.template-fields').first();
  await expect(persisted.getByLabel('Template name', { exact: true })).toHaveValue(
    'Reading preset',
  );
  await persisted.locator('summary').click();
  await expect(persisted.getByLabel('Notes / feelings', { exact: true })).toHaveValue(
    'Preset notes',
  );
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await expect(journal.locator('#journal-text')).toHaveValue('Weekly text');
  await expect(journal.locator('#journal-plan')).toHaveValue('Weekly plan');
  await journal.getByRole('button', { name: 'Monthly journal', exact: true }).click();
  await expect(journal.locator('#journal-text')).toHaveValue('Monthly text');
  await expect(journal.locator('#journal-plan')).toHaveValue('Monthly plan');
});

test('collapse, Close, Escape and leaving Journal persist filled content', async ({
  page,
}) => {
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  await journal.getByRole('button', { name: 'Customize', exact: true }).click();
  const template = journal.locator('.template-fields').first();
  await template.locator('summary').click();
  await template
    .getByLabel('Notes / feelings', { exact: true })
    .fill('Saved by collapsing');
  await template.locator('summary').click();
  await expect(template.locator('details')).not.toHaveAttribute('open');
  await journal
    .locator('.template-editor')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await journal.getByRole('button', { name: 'Record activity', exact: true }).click();
  await journal.locator('#journal-activity-title').fill('Saved with Escape');
  await journal.locator('#journal-activity-title').press('Escape');
  await expect(journal.getByRole('dialog')).toHaveCount(0);
  await expect(journal.locator('.block-body')).toContainText('Saved with Escape');
  await journal.getByRole('button', { name: 'Record activity', exact: true }).click();
  await journal.locator('#journal-activity-title').fill('Saved by leaving');
  await journal.locator('#journal-start').fill('10:00');
  await journal.locator('#journal-end').fill('10:15');
  await journal.locator('#journal-text').fill('Notes on leaving');
  await page.locator('magic-side-nav a').filter({ hasText: 'Settings' }).click();
  await expect(journal).toHaveCount(0);
  await waitForStatePersistence(page);
  await page.locator('magic-side-nav a[href="#/journal"]').click();
  await expect(journal.locator('#journal-text')).toHaveValue('Notes on leaving');
  await expect(journal.locator('.block-body')).toContainText([
    'Saved with Escape',
    'Saved by leaving',
  ]);
  await journal.getByRole('button', { name: 'Customize', exact: true }).click();
  await journal.locator('.template-fields').first().locator('summary').click();
  await expect(
    journal
      .locator('.template-fields')
      .first()
      .getByLabel('Notes / feelings', { exact: true }),
  ).toHaveValue('Saved by collapsing');
});

test('incomplete editors remain available until fixed when navigating away', async ({
  page,
}) => {
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  await journal.getByRole('button', { name: 'Customize', exact: true }).click();
  await journal
    .locator('.template-fields')
    .first()
    .getByLabel('Template name', { exact: true })
    .fill('');
  await journal.locator('.template-fields').first().locator('summary').click();
  await journal
    .locator('.template-fields')
    .first()
    .getByLabel('What did you do?', { exact: true })
    .fill('');
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await expect(journal.locator('.template-editor')).toBeVisible();
  await expect(journal.getByRole('alert')).toContainText('template');
  await page.locator('magic-side-nav a').filter({ hasText: 'Settings' }).click();
  await expect(journal).toBeVisible();
  await expect(page).toHaveURL(/#\/journal$/);
  await journal
    .locator('.template-fields')
    .first()
    .getByLabel('Template name', { exact: true })
    .fill('Recovered preset');
  await page.locator('magic-side-nav a').filter({ hasText: 'Settings' }).click();
  await expect(journal).toHaveCount(0);
});

test('mobile period navigation saves and closes the activity editor', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  await journal.getByRole('button', { name: 'Record activity', exact: true }).click();
  await journal.locator('#journal-activity-title').fill('Mobile activity');
  await journal.locator('#journal-activity-note').fill('Mobile notes');
  expect(
    await journal.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await expect(journal.getByRole('dialog')).toHaveCount(0);
  await journal.getByRole('button', { name: 'Daily journal', exact: true }).click();
  await expect(journal.locator('.block-body')).toContainText('Mobile activity');
});
