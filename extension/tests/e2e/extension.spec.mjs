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

test('plugins tab installs the demo snippet, renders its card and removes it cleanly', async ({ extension }, testInfo) => {
  await openPortal(extension);
  const { page, worker } = extension;
  const footer = page.locator('.footer-buttons');
  await footer.getByRole('link', { name: 'Плагины', exact: true }).click();
  const plugins = page.getByRole('dialog', { name: 'Плагины', exact: true });
  await expect(plugins).toBeVisible();
  await captureDashboard(page, plugins, testInfo, 'plugins');
  // The sandbox must come up in Chromium; otherwise the UI shows a warning.
  await expect(plugins.getByText('Песочница плагинов недоступна')).toHaveCount(0);
  await plugins.getByRole('button', { name: 'Вставить пример', exact: true }).click();
  const code = plugins.locator('textarea');
  await expect(code).toHaveValue(/vacnet\.on\('clip-loaded'/u);
  await plugins.getByRole('button', { name: 'Сохранить и применить', exact: true }).click();
  await expect(plugins.getByText('Таймер проверки')).toBeVisible();
  await expect(plugins.getByText('Работает', { exact: true })).toBeVisible();
  const stored = await worker.evaluate(async () =>
    (await chrome.storage.local.get('plugins')).plugins.plugins['review-timer']);
  expect(stored).toMatchObject({ id: 'review-timer', enabled: true });
  // clip-loaded fires on the next clip transition; reload the portal so the
  // freshly installed plugin observes the first clip of a new session.
  await openPortal(extension);
  page.on('console', (message) => console.log('DBG >>>', message.text().slice(0, 160)));
  await footer.getByRole('link', { name: 'Плагины', exact: true }).click();
  await expect(plugins.getByText('Работает', { exact: true })).toBeVisible({ timeout: 10_000 });
  await plugins.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  await footer.getByRole('link', { name: 'Метрики разработчика', exact: true }).click();
  const metrics = page.getByRole('dialog', { name: 'Метрики разработчика', exact: true });
  await expect(metrics.getByText('Таймер проверки', { exact: true })).toBeVisible();
  await expect(metrics.getByText(/Текущий: \d\d:\d\d/)).toBeVisible();
  await metrics.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  // Disabling the plugin removes its card; deleting clears storage.
  await footer.getByRole('link', { name: 'Плагины', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Включить или выключить плагин Таймер проверки' }).click();
  await expect(page.getByText('Таймер проверки', { exact: true })).toHaveCount(0);
  await plugins.getByRole('button', { name: 'Удалить', exact: true }).click();
  const confirmDelete = plugins.getByRole('button', { name: 'Точно удалить?', exact: true });
  await expect(confirmDelete).toBeVisible();
  await confirmDelete.click();
  await expect(plugins.getByText('Плагинов пока нет')).toBeVisible();
  expect(await worker.evaluate(async () =>
    (await chrome.storage.local.get('plugins')).plugins.plugins)).toEqual({});
});

test('plugin settings render in the manager and settings-changed updates the review card', async ({ extension }) => {
  await openPortal(extension);
  const { page } = extension;
  page.on('crash', () => console.log('DBG-CRASH >>> renderer crashed'));
  page.on('pageerror', (error) => console.log('DBG-PAGEERROR >>>', error.message.slice(0, 300)));
  page.on('console', (message) => console.log('DBG-CONSOLE >>>', message.type(), message.text().slice(0, 200)));
  const footer = page.locator('.footer-buttons');
  await footer.getByRole('link', { name: 'Плагины', exact: true }).click();
  const plugins = page.getByRole('dialog', { name: 'Плагины', exact: true });
  await expect(plugins).toBeVisible();
  await plugins.getByRole('button', { name: 'Новый плагин', exact: true }).click();
  await plugins.getByLabel('Идентификатор (латиница, цифры, дефис)').fill('e2e-settings');
  await plugins.getByLabel('Название').fill('Настройки E2E');
  const settingsPluginCode = [
    "vacnet.settings.define([",
    "  { key: 'auto', type: 'toggle', label: 'Авто-анализ', default: false },",
    "  { key: 'place', type: 'choice', label: 'Место вывода', default: 'review', options: ['review', 'metrics'] },",
    "]);",
    "vacnet.ui.setCard({",
    "  title: 'ИИ-рекомендация',",
    "  text: 'старт',",
    "  slot: 'review',",
    "  bars: [{ label: 'wallhack', value: 0.73 }],",
    "  actions: [{ key: 'ping', label: 'Проверить' }],",
    "});",
    "vacnet.on('settings-changed', (event) => {",
    "  if (event.pluginId !== vacnet.plugin.id) return;",
    "  vacnet.ui.setCard({ title: 'ИИ-рекомендация', text: 'авто: ' + (event.values.auto ? 'вкл' : 'выкл'), slot: 'review' });",
    "});",
    "vacnet.on('card-action', (event) => {",
    "  if (event.pluginId !== vacnet.plugin.id || event.key !== 'ping') return;",
    "  vacnet.ui.setCard({ title: 'ИИ-рекомендация', text: 'пинг получен', slot: 'review', bars: [{ label: 'wallhack', value: 1 }] });",
    "});",
  ].join('\n');
  await plugins.getByLabel('Код плагина (JavaScript)').fill(settingsPluginCode);
  await plugins.getByRole('button', { name: 'Сохранить и применить', exact: true }).click();
  await expect(plugins.getByText('Работает', { exact: true })).toBeVisible();
  // The declared settings render under the plugin card.
  const autoToggle = plugins.getByLabel('Авто-анализ');
  await expect(autoToggle).toBeVisible();
  await expect(autoToggle).not.toBeChecked();
  await expect(plugins.getByLabel('Место вывода')).toHaveValue('review');
  // The review-slot card shows on the review page itself, under the panel,
  // with the probability bar and the action button.
  await expect(page.getByText('ИИ-рекомендация', { exact: true })).toBeVisible();
  await expect(page.getByText('старт', { exact: true })).toBeVisible();
  await expect(page.getByText('wallhack', { exact: true })).toBeVisible();
  // Close the dialog: the review card lives on the page behind it.
  await plugins.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Card buttons dispatch 'card-action' back to the plugin.
  const actionButton = page.getByRole('button', { name: 'Проверить', exact: true });
  await expect(actionButton).toBeVisible();
  await actionButton.click();
  await expect(page.getByText('пинг получен', { exact: true })).toBeVisible();
  // Toggling a setting persists it and reaches the plugin as an event.
  await footer.getByRole('link', { name: 'Плагины', exact: true }).click();
  await expect(plugins).toBeVisible();
  await autoToggle.click();
  await expect(autoToggle).toBeChecked();
  await expect(page.getByText('авто: вкл', { exact: true })).toBeVisible();
  await plugins.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  await expect(page.getByText('ИИ-рекомендация', { exact: true })).toBeVisible();
  const stored = await extension.worker.evaluate(async () =>
    (await chrome.storage.local.get('plugin-data'))['plugin-data']['e2e-settings']['__settings__']);
  expect(stored).toMatchObject({ auto: true, place: 'review' });
  await footer.getByRole('link', { name: 'Плагины', exact: true }).click();
  await expect(plugins).toBeVisible();
  await plugins.getByRole('button', { name: 'Удалить', exact: true }).click();
  const confirmDelete = plugins.getByRole('button', { name: 'Точно удалить?', exact: true });
  await expect(confirmDelete).toBeVisible();
  await confirmDelete.click();
  await expect(page.getByText('ИИ-рекомендация', { exact: true })).toHaveCount(0);
});

test('plugin import fills the editor from a picked .js file and installs it', async ({ extension }) => {
  await openPortal(extension);
  const { page } = extension;
  const footer = page.locator('.footer-buttons');
  await footer.getByRole('link', { name: 'Плагины', exact: true }).click();
  const plugins = page.getByRole('dialog', { name: 'Плагины', exact: true });
  await expect(plugins).toBeVisible();
  const code = [
    "vacnet.settings.define([{ key: 'loud', type: 'toggle', label: 'Громко', default: true }]);",
    "vacnet.ui.setCard({ title: 'Импортированный', text: 'из файла', slot: 'review' });",
  ].join('\n');
  await plugins.locator('input[type=file]').setInputFiles({
    name: 'my-imported-plugin.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from(code, 'utf8'),
  });
  // The editor opens pre-filled from the filename.
  await expect(plugins.getByLabel('Идентификатор (латиница, цифры, дефис)')).toHaveValue('my-imported-plugin');
  await expect(plugins.getByLabel('Название')).toHaveValue('my imported plugin');
  await expect(plugins.locator('textarea')).toHaveValue(/Импортированный/);
  await plugins.getByRole('button', { name: 'Сохранить и применить', exact: true }).click();
  await expect(plugins.getByText('Работает', { exact: true })).toBeVisible();
  // The imported plugin is immediately live: card on the review page, settings in the list.
  await expect(page.getByText('из файла', { exact: true })).toBeVisible();
  const settingToggle = plugins.getByLabel('Громко');
  await expect(settingToggle).toBeVisible();
  await expect(settingToggle).toBeChecked();
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
