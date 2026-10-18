import { test, expect, openPortal } from './extension-fixture.mjs';

async function captureDashboard(page, dialog, testInfo, name) {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1100 });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width, 'Dashboard must fit the viewport at desktop and phone widths').toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
}

test('built extension checks releases through native worker fetch and caches the result', async ({ extension }) => {
  const first = await extension.send('checkForUpdates', { force: true });
  const installedVersion = await extension.worker.evaluate(() => chrome.runtime.getManifest().version);
  expect(first).toMatchObject({ currentVersion: installedVersion, latestVersion: '99.0.0', available: true, error: false,
    releaseUrl: 'https://github.com/pensiya5/vacnet-plus-plus/releases/tag/v99.0.0' });
  expect(first.checkedAt).toBeGreaterThan(0);
  const second = await extension.send('checkForUpdates', { force: true });
  expect(second).toEqual(first);
  expect(extension.requests.filter(url => url.includes('/releases/latest'))).toEqual([
    'https://api.github.com/repos/pensiya5/vacnet-plus-plus/releases/latest',
  ]);
  const cache = await extension.worker.evaluate(async () => (await chrome.storage.local.get('update-check-cache'))['update-check-cache']);
  expect(cache).toMatchObject({ latestTag: 'v99.0.0', error: false });
  // Also verify the background result crosses the isolated/UI boundary.
  await openPortal(extension);
  await extension.page.getByRole('button', { name: 'Доступна версия 99.0.0', exact: true }).hover();
  await expect(extension.page.getByText('Доступна версия 99.0.0', { exact: true })).toBeVisible();
  await expect(extension.page.getByRole('link', { name: 'Открыть релиз' })).toHaveAttribute('href',
    'https://github.com/pensiya5/vacnet-plus-plus/releases/tag/v99.0.0');
});

test('selected native verdict allows real video playback to resume with Space and the player button', async ({ extension }) => {
  await openPortal(extension);
  const { page } = extension;
  const video = page.locator('#video_html5_api');
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
  await page.locator('label[for=vacnet-cheating-positive]').click();
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
  // Native radio inputs are disabled during confirmation. The replacement UI
  // must keep player commands working without cancelling the selected verdict.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  const before = await video.evaluate(element => element.currentTime);
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(before + 0.15);
  await expect(page.locator('#vacnet-cheating-positive')).toBeChecked();
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
  await page.locator('.plyr__controls [data-plyr="play"]').click();
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
  await expect(page.locator('#vacnet-cheating-positive')).toBeChecked();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
  await page.locator('.plyr__video-wrapper').click();
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
  await expect(page.locator('#vacnet-cheating-positive')).toBeChecked();
});

test('changing verdict re-arms confirmation and records history only after the next clip loads', async ({ extension }) => {
  await openPortal(extension);
  const { page, worker } = extension;
  const confirm = page.getByRole('button', { name: 'Подтвердить', exact: true });
  await page.locator('label[for=vacnet-cheating-positive]').click();
  await expect(confirm).toBeDisabled();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.fixture.submissions)).toEqual([]);
  await expect(confirm).toBeEnabled();
  await page.locator('label[for=vacnet-cheating-negative]').click();
  await expect(page.locator('#vacnet-cheating-negative')).toBeChecked();
  await expect(confirm).toBeDisabled();
  expect(await page.evaluate(() => window.fixture.cancelled)).toBe(1);
  expect(await page.evaluate(() => window.fixture.selections)).toEqual(['positive', 'negative']);
  const savedBefore = await worker.evaluate(async () => (await chrome.storage.local.get('history')).history);
  expect(Object.values(savedBefore.entries)).toHaveLength(0);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page).toHaveURL(/synthetic=2/u);
  await expect(page.locator('#vacnet-cheating-positive')).toBeEnabled();
  await expect(page.locator('#vacnet-cheating-negative')).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await expect(page.getByText('browser-task-2', { exact: true })).toBeVisible();
  await expect.poll(async () => worker.evaluate(async () => Object.values((await chrome.storage.local.get('history')).history.entries).length)).toBe(1);
  const entries = await worker.evaluate(async () => Object.values((await chrome.storage.local.get('history')).history.entries));
  expect(entries[0]).toMatchObject({ taskId: 'browser-task-1', cheating: 'negative', reviewType: 'cheating', badClip: false });
  const submission = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fixture:last-submission')));
  expect(submission).toMatchObject({ verdict_task: 'browser-task-1', 'verdict_labels[]': 'innocent_cheating' });
});

test('footer history search and statistics share stored data and close cleanly', async ({ extension }, testInfo) => {
  const entry = (taskId, videoId, cheating, timestamp, deduplication = 'new-match') => ({
    taskId, videoId, sourceWebmUrl: `https://replay-video.valve.net/synthetic/${videoId}.webm`,
    range: { start: 0, end: 20 }, eventTime: -1, reviewType: 'cheating', app: '730', clipCount: null,
    matchTimestamp: null, webmDuration: 20, identityVersion: 2, clipKey: `video:${videoId}|0:20`,
    deduplication, timestamp, badClip: false, verdictTick: null,
    aimassist: 'skip', wallhack: 'skip', autobhop: 'skip', bot: 'skip', cheating,
  });
  await extension.worker.evaluate(async history => { await chrome.storage.local.set({ history, 'history:meta': { v: 4 } }); }, {
    version: 4, stats: { repeats: 1 }, entries: {
      first: entry('search-target-731', 'csow_aaaaaaaaaaaaaaaa', 'positive', Date.now()),
      second: entry('other-task-882', 'csow_bbbbbbbbbbbbbbbb', 'negative', Date.now(), 'exact-duplicate'),
    },
  });
  await openPortal(extension);
  const { page } = extension;
  const footer = page.locator('.footer-buttons');
  await footer.getByRole('link', { name: 'Журнал клипов', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Журнал клипов', exact: true });
  await expect(history).toBeVisible();
  await captureDashboard(page, history, testInfo, 'history');
  const search = history.getByRole('searchbox', { name: 'Поиск по ID задания или видео' });
  await search.fill('search-target-731');
  await expect(history.locator('details')).toHaveCount(1);
  await expect(history.locator('details')).toContainText('search-target-731');
  await expect(history.locator('details')).not.toContainText('other-task-882');
  await search.fill('csow_bbbbbbbbbbbbbbbb');
  await expect(history.locator('details')).toHaveCount(1);
  await expect(history.locator('details')).toContainText('other-task-882');
  await expect(history.locator('details')).not.toContainText('search-target-731');
  await history.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(history.locator('details')).toHaveCount(2);
  await history.getByRole('combobox', { name: 'Вердикт', exact: true }).selectOption('positive');
  await expect(history.locator('details')).toHaveCount(1);
  await expect(history.locator('details')).toContainText('search-target-731');
  await history.getByRole('combobox', { name: 'Повторы', exact: true }).selectOption('exact-duplicate');
  await expect(history.locator('details')).toHaveCount(0);
  await history.getByRole('combobox', { name: 'Вердикт', exact: true }).selectOption('all');
  await expect(history.locator('details')).toHaveCount(1);
  await expect(history.locator('details')).toContainText('other-task-882');
  await history.getByLabel('Дата от', { exact: true }).fill('2099-01-01');
  await expect(history.locator('details')).toHaveCount(0);
  await history.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(history.locator('details')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect.poll(() => page.locator('video#video_html5_api').evaluate(video => video.paused)).toBe(false);
  await footer.getByRole('link', { name: 'Статистика', exact: true }).click();
  const statistics = page.getByRole('dialog', { name: 'Статистика', exact: true });
  await expect(statistics).toBeVisible();
  await expect(statistics.locator('dl > div').filter({ has: page.getByText('Сохранено сегодня', { exact: true }) }).locator('dd')).toHaveText('2');
  await expect(statistics.locator('dl > div').filter({ has: page.getByText('Точные повторы', { exact: true }) }).locator('dd')).toHaveText('1');
  const watchedTime = statistics.locator('dl > div').filter({ has: page.getByText('Время просмотра', { exact: true }) }).locator('dd');
  await expect(watchedTime).not.toHaveText('0 с');
  await captureDashboard(page, statistics, testInfo, 'statistics');
  await statistics.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect.poll(() => page.locator('video#video_html5_api').evaluate(video => video.paused)).toBe(true);
  await footer.getByRole('link', { name: 'Статистика', exact: true }).click();
  const pausedTime = await watchedTime.textContent();
  // Observe more than one whole displayed second with real media paused.
  await page.waitForTimeout(1200);
  await expect(watchedTime).toHaveText(pausedTime);
  await footer.getByRole('link', { name: 'Статистика', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test.describe('Public network smoke', () => {
  test.skip(process.env.VACNET_E2E_LIVE_UPDATES !== '1', 'Opt in with VACNET_E2E_LIVE_UPDATES=1; depends on public GitHub availability.');
  test('[live] public GitHub release check uses the installed worker and native fetch', async ({ extension }) => {
  const result = await extension.send('checkForUpdates', { force: true });
  expect(result.error, 'Public GitHub API must return a stable release (404/rate limits are a live smoke failure)').toBe(false);
  expect(result.currentVersion).toBe('4.5.0');
  expect(result.latestVersion).toMatch(/^\d+(?:\.\d+){0,3}$/u);
  expect(result.checkedAt).toBeGreaterThan(0);
  expect(result.releaseUrl).toMatch(/^https:\/\/github\.com\/pensiya5\/vacnet-plus-plus\/releases\/tag\//u);
  expect(await extension.send('checkForUpdates', { force: false })).toEqual(result);
  });
});
