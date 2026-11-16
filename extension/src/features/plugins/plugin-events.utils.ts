import { ClipDataSchema, type ClipData, type PageSnapshot } from '../../entities/clip.entity';
import { VerdictSelectionSchema, type VerdictSelection } from '../../entities/verdict.entity';
import { historyKey, type ClipHistoryEntry, type HistoryState } from '../../entities/history.entity';
import { PluginEventPayloadSchemas } from './plugin-wire.port';

/**
 * Pure derivations used by the plugin bridge to turn host state signals into
 * plugin events. Kept free of DOM and messaging so they are unit-testable.
 */

export interface ClipLoadedPayload {
  clip: ClipData;
  deduplication: PageSnapshot['deduplication'];
}

export interface VerdictSubmittedPayload {
  clip: ClipData;
  verdicts: VerdictSelection;
  badClip: boolean;
}

export const deriveClipTransition = (
  previousTaskId: string | null,
  snapshot: PageSnapshot,
): { nextTaskId: string | null; payload: ClipLoadedPayload | null } => {
  const clip = snapshot.clip;
  if (!clip) return { nextTaskId: previousTaskId, payload: null };
  if (previousTaskId === clip.taskId) return { nextTaskId: previousTaskId, payload: null };
  const parsed = PluginEventPayloadSchemas['clip-loaded'].safeParse({
    clip,
    deduplication: snapshot.deduplication ?? null,
  });
  return { nextTaskId: clip.taskId, payload: parsed.success ? parsed.data : null };
};

/** Prime the seen-key set without producing events (used on initial hydrate). */
export const collectHistoryKeys = (history: HistoryState): Set<string> =>
  new Set(Object.values(history.entries).map(historyKey));

/** Diff the history signal into per-save verdict events. */
export const deriveNewHistoryEntries = (
  seenKeys: Set<string>,
  history: HistoryState,
): { nextKeys: Set<string>; added: ClipHistoryEntry[] } => {
  const nextKeys = new Set(seenKeys);
  const added: ClipHistoryEntry[] = [];
  for (const entry of Object.values(history.entries)) {
    const key = historyKey(entry);
    if (nextKeys.has(key)) continue;
    nextKeys.add(key);
    added.push(entry);
  }
  return { nextKeys, added };
};

export const entryToVerdictSubmitted = (entry: ClipHistoryEntry): VerdictSubmittedPayload | null => {
  // History entries carry extra journal fields; extract the exact event shapes
  // so the strict payload schemas do not reject them.
  const clip = ClipDataSchema.safeParse({
    taskId: entry.taskId,
    sourceWebmUrl: entry.sourceWebmUrl,
    videoId: entry.videoId,
    range: entry.range,
    eventTime: entry.eventTime,
    reviewType: entry.reviewType,
    clipCount: entry.clipCount,
    app: entry.app,
    matchTimestamp: entry.matchTimestamp,
    webmDuration: entry.webmDuration,
  });
  const verdicts = VerdictSelectionSchema.safeParse({
    aimassist: entry.aimassist,
    wallhack: entry.wallhack,
    autobhop: entry.autobhop,
    bot: entry.bot,
    ...(entry.cheating === undefined ? {} : { cheating: entry.cheating }),
  });
  if (!clip.success || !verdicts.success) return null;
  return { clip: clip.data, verdicts: verdicts.data, badClip: entry.badClip };
};
