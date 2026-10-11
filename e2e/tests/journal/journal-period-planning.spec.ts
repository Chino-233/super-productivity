import { expect, test } from '../../fixtures/test.fixture';
import { waitForStatePersistence } from '../../utils/waits';

test('plans a monthly range, budgets a day, and splits its hours in the daily calendar', async ({
  page,
}) => {
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  const planner = journal.locator('journal-period-planner');
  await journal.locator('.date-navigation input').fill('2026-10-14');
  await journal.getByRole('button', { name: 'Monthly journal', exact: true }).click();
  await planner.getByRole('button', { name: 'Add date range', exact: true }).click();
  await planner.locator('#period-plan-title').fill('Write report');
  await planner.locator('#month-plan-from').fill('2026-10-12');
  await planner.locator('#month-plan-to').fill('2026-10-16');
  await planner.locator('#period-plan-note').fill('Monthly objective');
  await journal.locator('#journal-text').fill('Monthly notes stay separate');
  // Switching, rather than explicit saving, persists the date range and notes.
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  const column = planner.locator('.week-column[data-day="2026-10-14"]');
  await column.getByRole('button', { name: 'Allocate hours', exact: true }).click();
  await planner
    .locator('#week-month-source')
    .selectOption({ label: 'Write report · 2026-10-12—2026-10-16' });
  await planner.locator('#week-plan-hours').fill('2');
  await planner
    .locator('.planning-editor')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(column.locator('.plan-card')).toContainText('Scheduled 0 hours');
  await column.getByRole('button', { name: 'Choose calendar time', exact: true }).click();
  await expect(journal.locator('.calendar-block')).toHaveCount(0);
  await journal.locator('.calendar-slot[data-minute="540"][data-kind="plan"]').click();
  await expect(journal.locator('#journal-start')).toHaveValue('09:00');
  await expect(journal.locator('#journal-end')).toHaveValue('11:00');
  await expect(journal.locator('#journal-activity-title')).toHaveValue('Write report');
  await journal.locator('#journal-end').fill('10:00');
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await expect(column.locator('.plan-card')).toContainText('Scheduled 1 hours');
  await expect(column.locator('.plan-card')).toContainText('Still to schedule 1 hours');
  await column.getByRole('button', { name: 'Choose calendar time', exact: true }).click();
  await journal.locator('.calendar-slot[data-minute="840"][data-kind="plan"]').click();
  await expect(journal.locator('#journal-end')).toHaveValue('15:00');
  await journal
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(journal.locator('.calendar-block')).toHaveCount(2);
  await journal.getByRole('button', { name: 'Monthly journal', exact: true }).click();
  const monthCard = planner.locator('.month-plan-list .plan-card');
  await expect(monthCard).toContainText('Allocated 2 hours');
  await expect(monthCard).toContainText('Scheduled 2 hours');
  await expect(journal.locator('#journal-text')).toHaveValue(
    'Monthly notes stay separate',
  );
  await waitForStatePersistence(page);
  await page.reload();
  await journal.locator('.date-navigation input').fill('2026-10-14');
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await expect(column.locator('.plan-card')).toContainText('Scheduled 2 hours');
  await column.getByRole('button', { name: 'Delete', exact: true }).click();
  await journal.getByRole('button', { name: 'Daily journal', exact: true }).click();
  await journal.getByRole('button', { name: 'Planned activities', exact: true }).click();
  await expect(journal.locator('.calendar-block')).toHaveCount(2);
});

test('validates monthly and weekly editors on closing and uses presets as hourly budgets', async ({
  page,
}) => {
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  const planner = journal.locator('journal-period-planner');
  await journal.locator('.date-navigation input').fill('2026-10-14');
  await journal.getByRole('button', { name: 'Monthly journal', exact: true }).click();
  // Mouse range selection opens a date-range draft rather than a daily record.
  const from = planner.locator('.month-day-button[data-day="2026-10-12"]');
  const to = planner.locator('.month-day-button[data-day="2026-10-16"]');
  await from.scrollIntoViewIfNeeded();
  const first = (await from.boundingBox())!;
  const last = (await to.boundingBox())!;
  await page.mouse.move(
    first.x + Math.round(first.width / 2),
    first.y + Math.round(first.height / 2),
  );
  await page.mouse.down();
  await page.mouse.move(
    last.x + Math.round(last.width / 2),
    last.y + Math.round(last.height / 2),
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(planner.locator('#month-plan-from')).toHaveValue('2026-10-12');
  await expect(planner.locator('#month-plan-to')).toHaveValue('2026-10-16');
  await planner.locator('#period-plan-title').fill('Date range');
  await planner.locator('#month-plan-to').fill('2026-10-11');
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await expect(planner.getByRole('alert')).toContainText('Enter valid dates');
  await expect(planner.locator('#period-plan-title')).toHaveValue('Date range');
  await planner.locator('#month-plan-to').fill('2026-10-16');
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await planner
    .locator('.week-column[data-day="2026-10-14"]')
    .getByRole('button', { name: 'Allocate hours', exact: true })
    .click();
  await planner.locator('#period-plan-title').fill('Hourly budget');
  await planner.locator('#week-plan-hours').fill('0.3');
  await journal.getByRole('button', { name: 'Daily journal', exact: true }).click();
  await expect(planner.getByRole('alert')).toContainText('steps of 0.25');
  await planner.locator('#week-plan-hours').fill('0.5');
  await journal.getByRole('button', { name: 'Daily journal', exact: true }).click();
  await expect(planner.locator('.day-budgets')).toContainText(
    'Hourly budget · 0.5 hours',
  );
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  await journal
    .getByRole('complementary')
    .getByRole('button', { name: 'Study', exact: true })
    .click();
  await expect(planner.locator('#period-plan-title')).toHaveValue('Study');
  await expect(planner.locator('#week-plan-hours')).toHaveValue('1');
  await planner.locator('#period-plan-title').press('Escape');
  await expect(planner.locator('.planning-editor')).toHaveCount(0);
});

test('references a native task across two budget segments without replacing its schedule', async ({
  page,
  workViewPage,
  testPrefix,
}) => {
  await workViewPage.waitForTaskList();
  await workViewPage.addTask('Original task');
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  const planner = journal.locator('journal-period-planner');
  await journal.locator('.date-navigation input').fill('2026-10-14');
  await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  const column = planner.locator('.week-column[data-day="2026-10-14"]');
  await column.getByRole('button', { name: 'Allocate hours', exact: true }).click();
  await planner
    .locator('#period-plan-task')
    .selectOption({ label: `${testPrefix}-Original task` });
  await planner.locator('#period-plan-title').fill('Task work sessions');
  await planner.locator('#week-plan-hours').fill('2');
  await planner
    .locator('.planning-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  for (const [minute, end] of [
    ['540', '10:00'],
    ['840', '15:00'],
  ]) {
    await column
      .getByRole('button', { name: 'Choose calendar time', exact: true })
      .click();
    await journal
      .locator(`.calendar-slot[data-minute="${minute}"][data-kind="plan"]`)
      .click();
    await journal.locator('#journal-end').fill(end);
    await journal.getByRole('button', { name: 'Weekly journal', exact: true }).click();
  }
  await expect(column.locator('.plan-card')).toContainText('Scheduled 2 hours');
  await journal.getByRole('button', { name: 'Daily journal', exact: true }).click();
  await expect(journal.locator('.calendar-block')).toHaveCount(2);
  await expect(journal.locator('.task-overview')).toContainText('Original task');
  await waitForStatePersistence(page);
  await page.goto('/#/tag/TODAY/tasks');
  await expect(
    page.locator('task-title').filter({ hasText: 'Original task' }),
  ).toBeVisible();
  await expect(
    page.locator('task-title').filter({ hasText: 'Task work sessions' }),
  ).toHaveCount(0);
});
