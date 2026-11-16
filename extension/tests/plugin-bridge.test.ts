import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals';
import {
  collectHistoryKeys,
  deriveClipTransition,
  deriveNewHistoryEntries,
  entryToVerdictSubmitted,
} from '../src/features/plugins/plugin-events.utils';
import { emptyHistory, type ClipHistoryEntry, type HistoryState } from '../src/entities/history.entity';
import type { PageSnapshot } from '../src/entities/clip.entity';
import { emptyVerdicts } from '../src/entities/verdict.entity';

const entry = (overrides: Partial<ClipHistoryEntry> = {}): ClipHistoryEntry => ({
  ...emptyVerdicts(),
  taskId: 'task-1', videoId: 'video-1', sourceWebmUrl: 'https://replay-video.valve.net/a.webm',
  range: { start: 0, end: 60 }, eventTime: 10, reviewType: 'cheating',
  clipCount: null, app: '730', matchTimestamp: null, webmDuration: null, verdictTick: null,
  identityVersion: 2, clipKey: 'video:video-1|start:0|end:60000',
  timestamp: 1000, badClip: false, deduplication: 'new-clip', ...overrides,
});

const clip = (overrides: Partial<PageSnapshot['clip']> = {}): PageSnapshot['clip'] => ({
  taskId: 'task-1', videoId: 'video-1', sourceWebmUrl: 'https://replay-video.valve.net/a.webm',
  range: { start: 0, end: 60 }, eventTime: 10, reviewType: 'cheating', clipCount: null,
  app: '730', matchTimestamp: null, webmDuration: null, ...overrides,
});

describe('plugin event derivations', () => {
  it('emits clip-loaded once per task transition', () => {
    const snapshot = { clip: clip(), deduplication: 'new-match' } as PageSnapshot;
    const first = deriveClipTransition(null, snapshot);
    expect(first.nextTaskId).toBe('task-1');
    expect(first.payload?.clip.taskId).toBe('task-1');
    const repeat = deriveClipTransition(first.nextTaskId, { ...snapshot, verdicts: emptyVerdicts() });
    expect(repeat.payload).toBeNull();
    const cleared = deriveClipTransition(first.nextTaskId, { clip: null } as PageSnapshot);
    expect(cleared.nextTaskId).toBe('task-1');
    expect(cleared.payload).toBeNull();
    const next = deriveClipTransition(first.nextTaskId, { clip: clip({ taskId: 'task-2' }) } as PageSnapshot);
    expect(next.payload?.clip.taskId).toBe('task-2');
  });

  it('detects newly saved history entries as verdict-submitted events', () => {
    const first: HistoryState = emptyHistory();
    first.entries.a = entry({ taskId: 'a', timestamp: 1 });
    const seen = collectHistoryKeys(first); // primed on hydrate, no events
    expect(seen.size).toBe(1);
    expect(deriveNewHistoryEntries(seen, first).added).toHaveLength(0);

    const second: HistoryState = emptyHistory();
    second.entries.a = entry({ taskId: 'a', timestamp: 1 });
    second.entries.b = entry({ taskId: 'b', timestamp: 2, badClip: true });
    const { nextKeys, added } = deriveNewHistoryEntries(seen, second);
    expect(added).toHaveLength(1);
    expect(added[0]?.taskId).toBe('b');
    expect(nextKeys.size).toBe(2);
    const payload = entryToVerdictSubmitted(added[0]!);
    expect(payload?.clip.taskId).toBe('b');
    expect(payload?.badClip).toBe(true);
    // Verdicts must not leak clip fields: they pass a strict verdict schema.
    expect(payload?.verdicts).toEqual(emptyVerdicts());
  });

  it('derives a live signal snapshot of history for the bridge', () => {
    const state = signal<HistoryState>(emptyHistory());
    const seen = collectHistoryKeys(state.value);
    state.value = { ...emptyHistory(), entries: { a: entry() } };
    const { added } = deriveNewHistoryEntries(seen, state.value);
    expect(added).toHaveLength(1);
  });
});
