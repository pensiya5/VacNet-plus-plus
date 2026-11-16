import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = { values: {} as Record<string, unknown> };
  const listeners = new Set<(changes: Record<string, { oldValue: unknown; newValue: unknown }>) => void>();
  const area = {
    async get(keys: string | string[] | null = null) {
      const names = keys === null ? Object.keys(state.values) : [keys].flat();
      return Object.fromEntries(names.filter((key) => key in state.values).map((key) => [key, structuredClone(state.values[key])]));
    },
    async set(patch: Record<string, unknown>) {
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
      for (const [key, value] of Object.entries(patch)) {
        changes[key] = { oldValue: state.values[key], newValue: value };
        state.values[key] = structuredClone(value);
      }
      for (const listener of listeners) listener(changes);
    },
    async remove(keys: string | string[]) {
      for (const key of [keys].flat()) delete state.values[key];
    },
    onChanged: {
      addListener: (listener: (changes: never) => void) => listeners.add(listener as never),
      removeListener: (listener: (changes: never) => void) => listeners.delete(listener as never),
    },
  };
  return { state, listeners, browser: { runtime: { id: 'plugins-storage-test' }, storage: { local: area } } };
});

vi.mock('../src/shared/ports/extension-messaging.port', () => ({
  sendMessage: async (method: string, request: { version: number; mutation?: unknown }) => {
    if (request?.version !== 1) throw new Error('unexpected storage request');
    const storageModule = await import('../src/features/plugins/plugins.storage');
    if (method === 'mutatePlugins' && request.mutation !== undefined) {
      return storageModule.pluginsStorage.mutate(request.mutation as Parameters<typeof storageModule.pluginsStorage.mutate>[0]);
    }
    if (method === 'mutatePluginData' && request.mutation !== undefined) {
      return storageModule.mutatePluginData(request.mutation as Parameters<typeof storageModule.mutatePluginData>[0]);
    }
    if (method === 'readPluginData') {
      return storageModule.readPluginData(request as unknown as string);
    }
    throw new Error(`unexpected storage request: ${method}`);
  },
}));

let unwatch: (() => void) | undefined;
beforeEach(() => {
  vi.resetModules();
  fake.state.values = {};
  vi.stubGlobal('browser', fake.browser);
});
afterEach(() => { unwatch?.(); unwatch = undefined; fake.listeners.clear(); vi.unstubAllGlobals(); });

const pluginRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'review-timer',
  name: 'Таймер проверки',
  version: '1.0.0',
  enabled: true,
  code: 'vacnet.log(1);',
  updatedAt: 100,
  ...overrides,
});

it('starts with an empty state and persists saved plugins', async () => {
  const { pluginsStorage } = await import('../src/features/plugins/plugins.storage');
  const initial = await pluginsStorage.mutate({ type: 'initialize' });
  expect(initial.plugins).toEqual({});
  const saved = await pluginsStorage.mutate({ type: 'save-plugin', plugin: pluginRecord() });
  expect(Object.keys(saved.plugins)).toEqual(['review-timer']);
  expect((await pluginsStorage.getValue()).plugins['review-timer']).toMatchObject({ enabled: true, version: '1.0.0' });
});

it('toggles plugins and removes them together with their data', async () => {
  const { pluginsStorage, mutatePluginData, readPluginData } = await import('../src/features/plugins/plugins.storage');
  await pluginsStorage.mutate({ type: 'initialize' });
  await pluginsStorage.mutate({ type: 'save-plugin', plugin: pluginRecord() });
  await mutatePluginData({ type: 'set', pluginId: 'review-timer', key: 'count', value: 3 });

  const toggled = await pluginsStorage.mutate({ type: 'set-enabled', id: 'review-timer', enabled: false });
  expect(toggled.plugins['review-timer']?.enabled).toBe(false);

  const removed = await pluginsStorage.mutate({ type: 'remove-plugin', id: 'review-timer' });
  expect(removed.plugins).toEqual({});
  expect(await readPluginData('review-timer')).toEqual({});
  expect(fake.state.values['plugin-data']).toEqual({ 'review-timer': {} });
});

it('enforces the plugin limit for new plugins but still allows updates', async () => {
  const { pluginsStorage } = await import('../src/features/plugins/plugins.storage');
  await pluginsStorage.mutate({ type: 'initialize' });
  for (let index = 0; index < 20; index++) {
    await pluginsStorage.mutate({ type: 'save-plugin', plugin: pluginRecord({ id: `plugin-${index}` }) });
  }
  await expect(pluginsStorage.mutate({ type: 'save-plugin', plugin: pluginRecord({ id: 'one-too-many' }) }))
    .rejects.toThrow('Plugin limit reached');
  await expect(pluginsStorage.mutate({ type: 'save-plugin', plugin: pluginRecord({ id: 'plugin-0', name: 'Renamed' }) }))
    .resolves.toMatchObject({ plugins: { 'plugin-0': { name: 'Renamed' } } });
});

it('validates plugin data mutations and keeps values JSON-serializable', async () => {
  const { mutatePluginData } = await import('../src/features/plugins/plugins.storage');
  await expect(mutatePluginData({ type: 'set', pluginId: 'review-timer', key: 'bad', value: () => 1 }))
    .rejects.toThrow();
  await expect(mutatePluginData({ type: 'set', pluginId: 'INVALID', key: 'k', value: 1 }))
    .rejects.toThrow();
  await expect(mutatePluginData({ type: 'set', pluginId: 'review-timer', key: '', value: 1 }))
    .rejects.toThrow();
  await mutatePluginData({ type: 'set', pluginId: 'review-timer', key: 'ok', value: { nested: [1, 'a'] } });
  const big = 'x'.repeat(70_000);
  await expect(mutatePluginData({ type: 'set', pluginId: 'review-timer', key: 'big', value: big }))
    .rejects.toThrow();
});

it('hydrates the store from storage and watches for background updates', async () => {
  const { initializePluginsStore, pluginsSignal, savePlugin } = await import('../src/features/plugins/plugins.store');
  unwatch = await initializePluginsStore((error) => { throw error; });
  expect(pluginsSignal.value.plugins).toEqual({});
  await savePlugin(pluginRecord());
  expect(Object.keys(pluginsSignal.value.plugins)).toEqual(['review-timer']);
  // A background-side write (other tab) arrives through the storage watch.
  fake.state.values['plugins'] = {
    version: 1,
    plugins: { 'review-timer': pluginRecord({ enabled: false }) },
  };
  for (const listener of [...fake.listeners]) {
    listener({ plugins: { oldValue: undefined, newValue: fake.state.values['plugins'] } });
  }
  expect(pluginsSignal.value.plugins['review-timer']?.enabled).toBe(false);
});
