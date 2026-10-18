import { expect, it } from 'vitest';
import { migrateHistory } from '../src/features/history/history.migration';

const entry = {
  aimassist: 'skip', wallhack: 'skip', autobhop: 'skip', bot: 'negative',
  taskId: 'old-task', sourceWebmUrl: 'https://replay-video.valve.net/cl_0123456789abcdef.webm',
  range: { start: 2, end: 12 }, eventTime: 7, timestamp: 100,
};
const noLegacy = { entries: { getValue: async () => null }, stats: { getValue: async () => null } };

it('preserves a legacy entry without clipKey and derives only supported identity fields', async () => {
  const history = await migrateHistory(null, {
    entries: { getValue: async () => ({ old: entry }) }, stats: { getValue: async () => ({ repeats: 7 }) },
  });
  expect(history.stats.repeats).toBe(7);
  expect(Object.values(history.entries)).toEqual([{
    ...entry, videoId: '0123456789abcdef', clipKey: 'video:0123456789abcdef|start:2000|end:12000',
    identityVersion: 1, reviewType: 'legacy', deduplication: 'new-match', badClip: false,
    app: '730', clipCount: null, verdictTick: null, matchTimestamp: null, webmDuration: null,
  }]);
});

it.each(['same-match-different-clip', 'shifted-duplicate'])('keeps legacy %s records with their clipKey', async (deduplication) => {
  const history = await migrateHistory({ version: 3, entries: {
    old: { ...entry, clipKey: 'old-format-key', deduplication, identityVersion: 2 },
  }, stats: { repeats: 2 } }, noLegacy);
  expect(Object.values(history.entries)).toHaveLength(1);
  expect(Object.values(history.entries)[0]).toMatchObject({ bot: 'negative', deduplication: 'new-clip', identityVersion: 2 });
});

it('refuses to silently discard malformed records during an upgrade', async () => {
  await expect(migrateHistory({ entries: { broken: { timestamp: 200 } } }, noLegacy)).rejects.toThrow();
});
