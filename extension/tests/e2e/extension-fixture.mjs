import { test as base, expect, chromium } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { portalHtml } from './portal-fixture.mjs';

const extensionPath = resolve('.output/chrome-mv3');
export const portalUrl = 'https://www.counter-strike.net/vacnet/clips?synthetic=1';
const latestApi = 'https://api.github.com/repos/pensiya5/vacnet-plus-plus/releases/latest';

// Attach CDP to the real worker for consistent network interception across
// Playwright versions, and replace only HTTP responses at the network layer;
// globalThis.fetch and the built UpdateChecker retain native Chromium semantics.
async function workerNetwork(context, worker, liveUpdates) {
  const cdp = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find(info => info.type === 'service_worker' && info.url === worker.url());
  if (!target) throw new Error('Built extension service-worker target was not found.');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let nextId = 0;
  const pending = new Map();
  const requests = [];
  const send = (method, params = {}) => new Promise((resolveResult, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolveResult, reject });
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
  });
  cdp.on('Target.receivedMessageFromTarget', ({ sessionId: receivedSession, message }) => {
    if (receivedSession !== sessionId) return;
    const event = JSON.parse(message);
    if (event.id) {
      const handler = pending.get(event.id);
      pending.delete(event.id);
      if (event.error) handler?.reject(new Error(event.error.message));
      else handler?.resolve(event.result);
    }
    if (event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    requests.push(request.url);
    const isRelease = request.url === latestApi;
    const operation = isRelease && liveUpdates
      ? send('Fetch.continueRequest', { requestId })
      : send('Fetch.fulfillRequest', {
        requestId,
        responseCode: isRelease ? 200 : 404,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(isRelease
          ? { tag_name: 'v99.0.0', draft: false, prerelease: false }
          : { message: 'Synthetic browser test blocks external worker traffic' })).toString('base64'),
      });
    operation.catch(() => {}); // Context teardown can cancel an optional metadata request.
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  return { requests, close: () => cdp.detach() };
}

async function createVideo(context) {
  const recorderPage = await context.newPage();
  const bytes = await recorderPage.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 90;
    const drawing = canvas.getContext('2d');
    const stream = canvas.captureStream(20);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise(resolveStop => { recorder.onstop = resolveStop; });
    let frame = 0;
    const draw = setInterval(() => {
      drawing.fillStyle = frame++ % 2 ? '#2b6ca3' : '#50ab88';
      drawing.fillRect(0, 0, 160, 90);
      drawing.fillStyle = 'white'; drawing.fillText(String(frame), 20, 40);
    }, 50);
    recorder.start();
    await new Promise(resolveWait => setTimeout(resolveWait, 1300));
    recorder.stop(); await stopped; clearInterval(draw);
    stream.getTracks().forEach(track => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  await recorderPage.close();
  return Buffer.from(bytes);
}

export const test = base.extend({
  extension: async ({}, use, testInfo) => {
    const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'));
    const profile = await mkdtemp(join(tmpdir(), 'vacnet-browser-test-'));
    let context;
    let network;
    const errors = [];
    const externalPageRequests = [];
    try {
      const chromeExecutable = process.env.VACNET_E2E_CHROME_EXECUTABLE;
      context = await chromium.launchPersistentContext(profile, {
        ...(chromeExecutable ? { executablePath: chromeExecutable, ignoreDefaultArgs: ['--disable-extensions'] } : { channel: 'chromium' }),
        headless: process.env.VACNET_E2E_HEADED !== '1',
        locale: 'ru-RU', viewport: { width: 1440, height: 1100 },
        args: [...(chromeExecutable ? ['--enable-unsafe-extension-debugging']
          : [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]),
          '--autoplay-policy=no-user-gesture-required'],
      });
      if (chromeExecutable) {
        const loader = await context.browser().newBrowserCDPSession();
        try { await loader.send('Extensions.loadUnpacked', { path: extensionPath }); }
        finally { await loader.detach(); }
      }
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      const liveUpdates = process.env.VACNET_E2E_LIVE_UPDATES === '1' && testInfo.title.includes('[live]');
      network = await workerNetwork(context, worker, liveUpdates);
      const media = await createVideo(context);
      await context.route('**/*', async route => {
        const url = route.request().url();
        if (url.startsWith('https://www.counter-strike.net/vacnet/clips')) {
          const task = new URL(url).searchParams.get('synthetic') === '2' ? 'browser-task-2' : 'browser-task-1';
          await route.fulfill({ contentType: 'text/html', body: portalHtml(task) });
        } else if (url.startsWith('https://replay-video.valve.net/synthetic/')) {
          await route.fulfill({ contentType: 'video/webm', body: media });
        } else if (liveUpdates && url === latestApi && route.request().method() === 'GET') {
          await route.continue();
        } else if (url.startsWith('https://')) {
          externalPageRequests.push(url);
          await route.abort('blockedbyclient');
        } else await route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const extensionId = new URL(worker.url()).host;
      // An extension-origin document supplies a real runtime messaging sender.
      const control = await context.newPage();
      await control.goto(`chrome-extension://${extensionId}/manifest.json`);
      const send = (type, data) => control.evaluate(async ({ type, data }) => {
        const response = await chrome.runtime.sendMessage({ id: Date.now(), type, data, timestamp: Date.now() });
        if (response?.err) throw new Error(response.err.message);
        return response?.res;
      }, { type, data });
      await use({ context, page, worker, control, send, manifest, requests: network.requests, errors });
      expect(externalPageRequests, 'The fixture must never submit a real VACNET verdict or load account data').toEqual([]);
      expect(errors, 'The actual extension must run without uncaught page exceptions').toEqual([]);
    } finally {
      if (context && testInfo.status !== testInfo.expectedStatus) {
        for (const page of context.pages()) {
          if (page.url().startsWith('https://www.counter-strike.net/')) {
            await testInfo.attach('portal.png', { body: await page.screenshot({ fullPage: true }).catch(() => Buffer.alloc(0)), contentType: 'image/png' });
          }
        }
      }
      await network?.close().catch(() => {});
      await context?.close();
      if (dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith('vacnet-browser-test-')) {
        throw new Error(`Refusing to remove a directory outside the generated test profiles: ${profile}`);
      }
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  },
});
export { expect };

export async function openPortal(extension) {
  await extension.page.goto(portalUrl);
  await expect(extension.page.locator('#vacnet-cheating-positive')).toBeEnabled();
  await expect(extension.page.locator('[data-vacnet-native-player]')).toHaveCount(1);
  await expect(extension.page.getByRole('alert')).toHaveCount(0);
}
