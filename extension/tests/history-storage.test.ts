import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = { values: {} as Record<string, unknown>, failWrites: false, cleanupBeforeSave: false };
  const listeners = new Set<(changes: Record<string, { oldValue: unknown; newValue: unknown }>) => void>();
  const area = {
    async get(keys: string | string[] | null = null) {
      const names = keys === null ? Object.keys(state.values) : [keys].flat();
      return Object.fromEntries(names.filter((key) => key in state.values).map((key) => [key, structuredClone(state.values[key])]));
    },
    async set(patch: Record<string, unknown>) {
      if (state.failWrites && 'history' in patch) throw new Error('history write failed');
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
      for (const [key, value] of Object.entries(patch)) {
        changes[key] = { oldValue: state.values[key], newValue: value };
        state.values[key] = structuredClone(value);
      }
      for (const listener of listeners) listener(changes);
    },
    async remove(keys: string | string[]) {
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
      for (const key of [keys].flat()) {
        if (key.startsWith('vacnetHistory') && !state.values.history) state.cleanupBeforeSave = true;
        changes[key] = { oldValue: state.values[key], newValue: undefined };
        delete state.values[key];
      }
      for (const listener of listeners) listener(changes);
    },
    onChanged: { addListener: (listener: (changes: never) => void) => listeners.add(listener as never),
      removeListener: (listener: (changes: never) => void) => listeners.delete(listener as never) },
  };
  return { state, listeners, browser: { runtime: { id: 'storage-test' }, storage: { local: area } } };
});
vi.mock('../src/shared/ports/extension-messaging.port', () => ({
  sendMessage: async (method: string, request: { version: number; mutation: import('../src/shared/ports/storage-protocol.port').HistoryMutation }) => {
    if (method !== 'mutateHistory' || request.version !== 1) throw new Error('unexpected storage request');
    const { historyStorage } = await import('../src/features/history/history.storage');
    return historyStorage.mutate(request.mutation);
  },
}));
const oldEntry = {
  aimassist: 'skip', wallhack: 'skip', autobhop: 'skip', bot: 'negative',
  taskId: 'old-task', sourceWebmUrl: 'https://replay-video.valve.net/test.webm',
  range: { start: 2, end: 12 }, eventTime: 7, timestamp: 100,
};
let unwatch: (() => void) | undefined;
beforeEach(() => {
  vi.resetModules();
  fake.state.values = { vacnetHistory: { old: structuredClone(oldEntry) }, vacnetHistoryStats: { repeats: 7 } };
  fake.state.failWrites = false;
  fake.state.cleanupBeforeSave = false;
  vi.stubGlobal('browser', fake.browser);
});
afterEach(() => { unwatch?.(); unwatch = undefined; fake.listeners.clear(); vi.unstubAllGlobals(); });

it('persists old-key history before deleting its sources and reloads the migrated result', async () => {
  const { initializeHistoryStore, historySignal } = await import('../src/features/history/history.store');
  unwatch = await initializeHistoryStore((error) => { throw error; });
  expect(Object.values(historySignal.value.entries)).toHaveLength(1);
  expect(Object.values(historySignal.value.entries)[0]).toMatchObject({ taskId: 'old-task', bot: 'negative' });
  expect(historySignal.value.stats.repeats).toBe(7);
  expect(fake.state.cleanupBeforeSave).toBe(false);
  expect(fake.state.values.vacnetHistory).toBeUndefined();
  expect(fake.state.values.history).toMatchObject({ version: 4, stats: { repeats: 7 } });
  const { historyStorage } = await import('../src/features/history/history.storage');
  expect(Object.keys((await historyStorage.getValue()).entries)).toHaveLength(1);
});

it('leaves original history intact when writing the migrated value fails', async () => {
  fake.state.failWrites = true;
  const { initializeHistoryStore } = await import('../src/features/history/history.store');
  await expect(initializeHistoryStore(() => {})).rejects.toThrow('history write failed');
  expect(fake.state.values.vacnetHistory).toEqual({ old: oldEntry });
  expect(fake.state.values.vacnetHistoryStats).toEqual({ repeats: 7 });
  expect(fake.state.values.history).toBeUndefined();
});

it('keeps original sources when any legacy record cannot be migrated', async () => {
  fake.state.values.vacnetHistory = { old: oldEntry, broken: { timestamp: 200 } };
  const { initializeHistoryStore } = await import('../src/features/history/history.store');
  await expect(initializeHistoryStore(() => {})).rejects.toThrow();
  expect(fake.state.values.vacnetHistory).toEqual({ old: oldEntry, broken: { timestamp: 200 } });
  expect(fake.state.values.history).toBeUndefined();
});

it('preserves legacy history when a new verdict is saved before UI initialization completes', async () => {
  const { historyStorage } = await import('../src/features/history/history.storage');
  await historyStorage.mutate({ type: 'save-entry', entry: {
    ...oldEntry, taskId: 'new-task', timestamp: 200, videoId: 'test',
    clipKey: 'video:test|start:2000|end:12000', identityVersion: 2, reviewType: 'legacy',
    deduplication: 'new-clip', badClip: false, app: '730', clipCount: null,
    matchTimestamp: null, webmDuration: null, verdictTick: null,
    aimassist: 'skip', wallhack: 'skip', autobhop: 'skip', bot: 'positive',
  } });
  const { initializeHistoryStore, historySignal } = await import('../src/features/history/history.store');
  unwatch = await initializeHistoryStore((error) => { throw error; });
  expect(Object.values(historySignal.value.entries).map((entry) => entry.taskId).sort()).toEqual(['new-task', 'old-task']);
  expect(historySignal.value.stats.repeats).toBe(7);
});

it('reads an old primary history without migration writes that could overwrite another tab', async () => {
  const original = { version: 3, entries: { old: {
    ...oldEntry, clipKey: 'old-key', deduplication: 'shifted-duplicate',
  } }, stats: { repeats: 7 } };
  fake.state.values = { history: structuredClone(original), 'history$': { v: 3 } };
  const { historyStorage } = await import('../src/features/history/history.storage');
  const preview = await historyStorage.getValue();
  expect(Object.values(preview.entries)).toHaveLength(1);
  expect(fake.state.values.history).toEqual(original);
  expect(fake.state.values['history$']).toEqual({ v: 3 });
  await historyStorage.mutate({ type: 'initialize' });
  expect(fake.state.values.history).toMatchObject({ version: 4, stats: { repeats: 7 } });
  expect(fake.state.values['history$']).toEqual({ v: 4 });
});
