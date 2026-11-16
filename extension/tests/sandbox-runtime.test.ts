import { describe, expect, it, vi } from 'vitest';
import { PluginSandboxRuntime, type VacnetPluginApi } from '../src/features/plugins/sandbox-runtime.service';
import { DEMO_PLUGIN_CODE } from '../src/features/plugins/demo-plugin';
import type { HostWireMessage, SandboxWireMessage } from '../src/features/plugins/plugin-wire.port';

interface Harness {
  posted: SandboxWireMessage[];
  runtime: PluginSandboxRuntime;
  respond: (id: string, value: unknown) => void;
}

const harness = (): Harness => {
  const posted: SandboxWireMessage[] = [];
  const responders = new Map<string, (value: unknown) => void>();
  const runtime = new PluginSandboxRuntime({
    post: (message) => {
      posted.push(message);
      if (message.kind === 'rpc') responders.set(message.id, (value) => {
        runtime.handleHostMessage({ kind: 'rpc-response', id: message.id, result: { ok: true, value } });
      });
    },
  });
  return {
    posted,
    runtime,
    respond: (id, value) => responders.get(id)?.(value),
  };
};

const load = (h: Harness, code: string, id = 'test-plugin'): void => {
  h.runtime.handleHostMessage({ kind: 'load', plugins: [{ id, name: 'Test', version: '1.0.0', code }] });
};

const apiEvents = (h: Harness, id = 'test-plugin'): string[] =>
  h.posted.flatMap((message) => message.kind === 'plugin-status' && message.id === id ? [message.status] : []);

describe('PluginSandboxRuntime', () => {
  it('executes plugin code and reports the running status', () => {
    const h = harness();
    load(h, 'vacnet.log("hello");');
    expect(apiEvents(h)).toEqual(['running']);
    h.runtime.dispose();
  });

  it('registers settings definitions and resolves merged current values', async () => {
    const h = harness();
    (globalThis as { __settings?: unknown }).__settings = null;
    load(h, `
      vacnet.settings.define([
        { key: 'auto', type: 'toggle', label: 'Авто', default: true },
        { key: 'model', type: 'choice', label: 'Модель', default: 'a', options: ['a', 'b'] },
      ]).then((values) => { globalThis.__settings = values; });
    `);
    const define = h.posted.find((m) => m.kind === 'rpc' && m.request.method === 'settings.define');
    expect(define).toBeDefined();
    if (define?.kind !== 'rpc' || define.request.method !== 'settings.define') throw new Error('unreachable');
    expect(define.request.settings).toHaveLength(2);
    // The host answers with stored values merged over defaults.
    h.respond(define.id, { auto: false, model: 'b' });
    await vi.waitFor(() => expect((globalThis as { __settings?: unknown }).__settings).toEqual({ auto: false, model: 'b' }));
    h.runtime.dispose();
    delete (globalThis as { __settings?: unknown }).__settings;
  });

  it('rejects invalid settings definitions without contacting the host', async () => {    const h = harness();
    (globalThis as { __defineError?: string }).__defineError = '';
    load(h, `
      vacnet.settings.define([{ key: 'bad', type: 'choice', label: 'x', default: 'x' }])
        .catch((error) => { globalThis.__defineError = String(error.message); });
    `);
    await vi.waitFor(() => expect((globalThis as { __defineError?: string }).__defineError).toContain('invalid definitions'));
    // No rpc reached the host and the plugin kept running.
    expect(h.posted.some((m) => m.kind === 'rpc')).toBe(false);
    expect(apiEvents(h)).toEqual(['running']);
    h.runtime.dispose();
    delete (globalThis as { __defineError?: unknown }).__defineError;
  });

  it('delivers card-action events to the owning plugin', () => {
    const h = harness();
    (globalThis as { __actions?: unknown[] }).__actions = [];
    load(h, 'vacnet.on("card-action", (event) => globalThis.__actions.push(event));');
    h.runtime.handleHostMessage({
      kind: 'event',
      name: 'card-action',
      payload: { pluginId: 'test-plugin', key: 'analyze' },
    });
    // Another plugin's action must not reach this handler.
    h.runtime.handleHostMessage({
      kind: 'event',
      name: 'card-action',
      payload: { pluginId: 'other', key: 'analyze' },
    });
    const captured = (globalThis as { __actions?: Array<{ pluginId: string; key: string }> }).__actions;
    expect(captured).toHaveLength(1);
    expect(captured?.[0]).toEqual({ pluginId: 'test-plugin', key: 'analyze' });
    h.runtime.dispose();
    delete (globalThis as { __actions?: unknown }).__actions;
  });

  it('restricts net.fetch to loopback http(s) URLs', async () => {
    const h = harness();
    const fetchSpy = vi.fn(() => Promise.reject(new Error('fetch must not be called')));
    vi.stubGlobal('fetch', fetchSpy);
    (globalThis as { __netError?: string }).__netError = '';
    load(h, `
      const attempts = [
        'https://example.com/data',
        'ftp://127.0.0.1/file',
        'not a url',
        'https://replay-video.valve.net/clip.webm',
      ];
      Promise.all(attempts.map((url) => vacnet.net.fetch(url).catch((error) => error.message)))
        .then((messages) => { globalThis.__netError = messages.join('|'); });
    `);
    await vi.waitFor(() => {
      const messages = String((globalThis as { __netError?: string }).__netError);
      expect(messages.split('|')).toHaveLength(4);
      for (const message of messages.split('|')) expect(message).toContain('net.fetch');
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    h.runtime.dispose();
    vi.unstubAllGlobals();
    delete (globalThis as { __netError?: unknown }).__netError;
  });

  it('passes localhost fetches through with status, ok and capped text', async () => {
    const h = harness();
    const body = JSON.stringify({ labels: { aimassist: 0.42 } });
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(body, { status: 200 })));
    vi.stubGlobal('fetch', fetchSpy);
    (globalThis as { __response?: { status: number; ok: boolean; text: string } }).__response = undefined;
    load(h, `
      vacnet.net.fetch('http://127.0.0.1:8770/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://replay-video.valve.net/a.webm' }),
        timeoutMs: 60000,
      }).then((response) => { globalThis.__response = response; });
    `);
    await vi.waitFor(() => expect((globalThis as { __response?: { status: number; ok: boolean; text: string } }).__response).toBeDefined());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8770/analyze');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ url: 'https://replay-video.valve.net/a.webm' });
    const response = (globalThis as unknown as { __response: { status: number; ok: boolean; text: string } }).__response;
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(JSON.parse(response.text)).toEqual({ labels: { aimassist: 0.42 } });
    h.runtime.dispose();
    vi.unstubAllGlobals();
    delete (globalThis as { __response?: unknown }).__response;
  });

  it('delivers clip-loaded events to subscribed handlers', () => {
    const h = harness();
    // Plugin code runs in its own Function scope; pass data via globals.
    (globalThis as { __captured?: unknown[] }).__captured = [];
    load(h, 'vacnet.on("clip-loaded", (event) => globalThis.__captured.push(event));');
    h.runtime.handleHostMessage({
      kind: 'event',
      name: 'clip-loaded',
      payload: {
        clip: {
          taskId: 'task-1', sourceWebmUrl: 'https://replay-video.valve.net/a.webm', videoId: 'v1',
          range: { start: 0, end: 60 }, eventTime: 10, reviewType: 'cheating', clipCount: null,
          app: '730', matchTimestamp: null, webmDuration: null,
        },
        deduplication: 'new-match',
      },
    });
    expect((globalThis as { __captured?: unknown[] }).__captured).toHaveLength(1);
    h.runtime.dispose();
    delete (globalThis as { __captured?: unknown }).__captured;
  });

  it('isolates failing plugins and keeps neighbours running', () => {
    const h = harness();
    h.runtime.handleHostMessage({
      kind: 'load',
      plugins: [
        { id: 'broken', name: 'Broken', version: '1.0.0', code: 'throw new Error("boom")' },
        { id: 'healthy', name: 'Healthy', version: '1.0.0', code: 'vacnet.on("clip-loaded", () => {});' },
      ],
    });
    const statuses = h.posted.filter((m) => m.kind === 'plugin-status');
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toMatchObject({ kind: 'plugin-status', id: 'broken', status: 'error' });
    expect(statuses[1]).toMatchObject({ kind: 'plugin-status', id: 'healthy', status: 'running' });
    // A throwing event handler marks the plugin as error without crashing.
    h.runtime.handleHostMessage({
      kind: 'event',
      name: 'clip-loaded',
      payload: {
        clip: {
          taskId: 't', sourceWebmUrl: 'https://replay-video.valve.net/a.webm', videoId: 'v',
          range: { start: 0, end: 1 }, eventTime: 0, reviewType: 'cheating', clipCount: null,
          app: '730', matchTimestamp: null, webmDuration: null,
        },
        deduplication: null,
      },
    });
    h.runtime.dispose();
  });

  it('runs the demo timer plugin against a fake API and cleans up on unload', async () => {
    vi.useFakeTimers();
    const h = harness();
    const cards: Record<string, { title: string; text: string }> = {};
    const storage: Record<string, unknown> = {};
    const fakeApi: VacnetPluginApi = {
      plugin: { id: 'review-timer', name: 'Таймер проверки', version: '1.0.0' },
      on: (_name, handler) => {
        handlers.push(handler);
        return () => undefined;
      },
      emitReviewCommand: async () => undefined,
      emitPlayerCommand: async () => undefined,
      storage: {
        get: async () => storage,
        set: async (key, value) => { storage[key] = value; },
        remove: async (key) => { delete storage[key]; },
      },
      settings: {
        define: async () => ({}),
        get: async () => ({}),
      },
      net: {
        fetch: async () => ({ status: 200, ok: true, text: '{}' }),
      },
      ui: {
        setCard: async (card) => { cards.demo = card; },
        clearCard: async () => { delete cards.demo; },
      },
      dom: { addCss: async () => undefined },
      log: () => undefined,
    };
    const handlers: ((payload: unknown) => void)[] = [];
    // Execute the demo code exactly like the sandbox does.
    const cleanup = new Function('vacnet', DEMO_PLUGIN_CODE)(fakeApi) as (() => void) | undefined;
    expect(typeof cleanup).toBe('function');
    const onClipLoaded = handlers[0]!;
    const onVerdictSubmitted = handlers[1]!;
    onClipLoaded({ clip: { taskId: 't1' } }); // clip-loaded
    expect(cards.demo?.title).toBe('Таймер проверки');
    await vi.advanceTimersByTimeAsync(1500);
    expect(cards.demo?.text).toContain('Текущий');
    onVerdictSubmitted({ clip: { taskId: 't1' }, verdicts: {}, badClip: false }); // verdict-submitted
    await vi.advanceTimersByTimeAsync(0); // flush the async storage round-trips
    expect(storage.count).toBe(1);
    cleanup?.();
    expect(cards.demo).toBeUndefined();
    vi.useRealTimers();
  });

  it('rejects rpc promises after the timeout instead of hanging', async () => {
    vi.useFakeTimers();
    const h = harness();
    load(h, 'vacnet.storage.get().then(() => { done = true; });');
    const statusBefore = h.posted.filter((m) => m.kind === 'plugin-status');
    expect(statusBefore.some((m) => m.kind === 'plugin-status' && m.status === 'error')).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000); // timeout + flush guard microtasks
    const statusAfter = h.posted.filter((m) => m.kind === 'plugin-status');
    expect(statusAfter.some((m) => m.kind === 'plugin-status' && m.status === 'error')).toBe(true);
    h.runtime.dispose();
    vi.useRealTimers();
  });
});
