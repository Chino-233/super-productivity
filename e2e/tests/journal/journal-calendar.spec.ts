import { test, expect } from '../../fixtures/test.fixture';
import { waitForStatePersistence } from '../../utils/waits';

test('selects, moves and resizes quarter-hour activities and rejects collisions', async ({
  page,
}) => {
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  const slot = journal.locator('.calendar-slot[data-minute="555"][data-kind="actual"]');
  await slot.scrollIntoViewIfNeeded();
  await slot.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = (await slot.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 60, { steps: 5 });
  await page.mouse.up();
  const editor = journal.getByRole('dialog');
  await expect(journal.locator('#journal-start')).toHaveValue('09:15');
  await expect(journal.locator('#journal-end')).toHaveValue('10:00');
  await journal.locator('#journal-activity-title').fill('Quarter hour activity');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const body = journal
    .locator('.block-body')
    .filter({ hasText: 'Quarter hour activity' });
  await body.scrollIntoViewIfNeeded();
  const activityBox = (await body.boundingBox())!;
  await page.mouse.move(activityBox.x + 40, activityBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(activityBox.x + 40, activityBox.y + 44, { steps: 4 });
  await page.mouse.up();
  await expect(body).toHaveAttribute('title', '09:30—10:15 Quarter hour activity');
  const edge = journal.getByRole('button', {
    name: 'Adjust end time · Quarter hour activity',
  });
  const edgeBox = (await edge.boundingBox())!;
  await page.mouse.move(edgeBox.x + 40, edgeBox.y + 2);
  await page.mouse.down();
  await page.mouse.move(edgeBox.x + 40, edgeBox.y + 50, { steps: 4 });
  await page.mouse.up();
  await expect(body).toHaveAttribute('title', '09:30—10:45 Quarter hour activity');

  await journal.locator('.calendar-slot[data-minute="660"][data-kind="actual"]').click();
  await journal.locator('#journal-activity-title').fill('Second activity');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const second = journal.locator('.block-body').filter({ hasText: 'Second activity' });
  await second.scrollIntoViewIfNeeded();
  const secondBox = (await second.boundingBox())!;
  await page.mouse.move(secondBox.x + 40, secondBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + 40, secondBox.y - 108, { steps: 5 });
  await page.mouse.up();
  await expect(journal.getByRole('alert')).toContainText('Quarter hour activity');
  await expect(second).toHaveAttribute('title', '11:00—11:15 Second activity');
  await waitForStatePersistence(page);
  await page.reload();
  await expect(body).toHaveAttribute('title', '09:30—10:45 Quarter hour activity');

  // Keyboard activation and cancellation do not create another activity.
  const midnight = journal.locator(
    '.calendar-slot[data-minute="1425"][data-kind="actual"]',
  );
  await midnight.focus();
  await midnight.press('Enter');
  await expect(journal.locator('#journal-end')).toHaveValue('24:00');
  await journal.locator('#journal-activity-title').press('Escape');
  await expect(editor).not.toBeVisible();
  await expect(journal.locator('.calendar-block')).toHaveCount(2);
});

test('customizes common activities and applies a default duration or dragged range', async ({
  page,
}) => {
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  await journal.getByRole('button', { name: 'Customize', exact: true }).click();
  await journal.getByRole('button', { name: 'Add common activity', exact: true }).click();
  await expect(journal.locator('.template-fields')).toHaveCount(6);
  const entry = journal.locator('.template-fields').last();
  await entry.locator('input').first().fill('Walk my dog');
  await entry.locator('select').selectOption('life');
  await entry.locator('input[type="number"]').fill('45');
  await journal
    .locator('.template-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(journal.locator('.template-editor')).not.toBeVisible();
  await expect(
    journal.getByRole('button', { name: 'Walk my dog', exact: true }),
  ).toBeVisible();
  await waitForStatePersistence(page);
  await page.reload();
  await journal.getByRole('button', { name: 'Walk my dog', exact: true }).click();
  await expect(journal.locator('#journal-activity-title')).toHaveValue('Walk my dog');
  await expect(journal.locator('#journal-category')).toHaveValue('life');
  await expect(journal.locator('#journal-start')).toHaveValue('09:00');
  await expect(journal.locator('#journal-end')).toHaveValue('09:45');
  await journal
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();

  const slot = journal.locator('.calendar-slot[data-minute="720"][data-kind="actual"]');
  await slot.scrollIntoViewIfNeeded();
  const box = (await slot.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 36, { steps: 4 });
  await page.mouse.up();
  await journal
    .getByRole('dialog')
    .getByRole('button', { name: 'Walk my dog', exact: true })
    .click();
  await expect(journal.locator('#journal-start')).toHaveValue('12:00');
  await expect(journal.locator('#journal-end')).toHaveValue('12:30');
  await journal
    .getByRole('dialog')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await journal.getByRole('button', { name: 'Customize', exact: true }).click();
  await journal
    .locator('.template-fields')
    .last()
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await journal
    .locator('.template-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(
    journal.getByRole('button', { name: 'Walk my dog', exact: true }),
  ).toHaveCount(0);
  await expect(journal.locator('.block-body')).toContainText('Walk my dog');
});

test('links the calendar to original tasks and shares the original daily reflection', async ({
  page,
  workViewPage,
  taskPage,
  testPrefix,
}) => {
  await workViewPage.waitForTaskList();
  await workViewPage.addTask('Existing linked task');
  await waitForStatePersistence(page);
  await page.goto('/#/journal');
  const journal = page.locator('journal');
  await journal.getByRole('button', { name: 'Planned activities', exact: true }).click();
  await journal.locator('.calendar-slot[data-minute="780"][data-kind="plan"]').click();
  await journal
    .locator('#journal-task')
    .selectOption({ label: `${testPrefix}-Existing linked task` });
  await journal
    .getByRole('dialog')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const body = journal.locator('.block-body').filter({ hasText: 'Existing linked task' });
  await expect(body).toHaveAttribute(
    'title',
    `13:00—13:15 ${testPrefix}-Existing linked task`,
  );
  await page.goto('/#/tag/TODAY/tasks');
  const task = taskPage.getTaskByText('Existing linked task');
  await task.locator('task-title').click();
  await task.locator('textarea').fill(`${testPrefix}-Renamed original task`);
  await page.keyboard.press('Tab');
  await expect(taskPage.getTaskByText('Renamed original task')).toBeVisible();
  await waitForStatePersistence(page);
  await page.goto('/#/journal');
  await expect(page.locator('journal .activity-controls')).toHaveCount(1);
  await journal.getByRole('button', { name: 'Planned activities', exact: true }).click();
  await expect(journal.locator('.block-body')).toContainText('Renamed original task');
  await journal.locator('.task-overview input[type="checkbox"]').check();
  await journal.locator('reflection-note textarea').fill('One shared daily reflection');
  await waitForStatePersistence(page);
  await page.goto('/#/tag/TODAY/daily-summary');
  await expect(page.locator('reflection-note textarea')).toHaveValue(
    'One shared daily reflection',
  );
  await page.goto('/#/journal');
  await expect(page.locator('journal .activity-controls')).toHaveCount(1);
  await journal.getByRole('button', { name: 'Planned activities', exact: true }).click();
  await journal.getByRole('button', { name: 'List', exact: true }).click();
  await journal.getByRole('button', { name: 'Cancel schedule', exact: true }).click();
  await expect(journal.locator('.activity-row')).toHaveCount(0);
  await page.goto('/#/tag/TODAY/tasks');
  await expect(taskPage.getTaskByText('Renamed original task')).toBeVisible();
});
