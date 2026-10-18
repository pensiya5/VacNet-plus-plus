import { z } from 'zod';
import {
  ClipRangeSchema,
  createClipIdentity,
  extractVideoId,
} from '../../entities/clip.entity';
import {
  ClipHistoryEntrySchema,
  emptyHistory,
  HISTORY_LIMIT,
  HISTORY_STATE_VERSION,
  HistoryStateSchema,
  historyKey,
  type ClipHistoryEntry,
  type HistoryState,
} from '../../entities/history.entity';
import { VerdictSelectionSchema } from '../../entities/verdict.entity';

const LegacyRangeSchema = z.object({
  start: z.number().finite().nonnegative().catch(0),
  end: z.number().finite().positive().catch(12),
}).catch({ start: 0, end: 12 }).transform(({ end, start }) => ({
  start,
  end: end > start ? end : start + 12,
}));

const LegacyEntrySchema = VerdictSelectionSchema.extend({
  identityVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  taskId: z.string().trim().min(1),
  sourceWebmUrl: z.string().trim().min(1),
  videoId: z.string().trim().optional(),
  clipCount: z.string().nullable().optional(),
  app: z.string().trim().optional(),
  range: LegacyRangeSchema,
  eventTime: z.union([z.number().finite().nonnegative(), z.literal(-1)]).optional(),
  reviewType: z.enum(['legacy', 'cheating']).optional(),
  verdictTick: z.number().finite().nonnegative().nullable().optional(),
  deduplication: z.enum(['new-match', 'new-clip', 'same-match-different-clip', 'exact-duplicate', 'shifted-duplicate']).optional(),
  timestamp: z.number().finite().nonnegative(),
  badClip: z.boolean().optional(),
  matchTimestamp: z.number().finite().nonnegative().optional().nullable(),
  webmDuration: z.number().finite().nonnegative().optional().nullable(),
}).strip();

const LegacyStateSchema = z.object({
  version: z.number().int().min(1).max(HISTORY_STATE_VERSION).optional(),
  entries: z.record(z.string(), z.unknown()).optional(),
  stats: z.object({ repeats: z.number().finite().nonnegative().optional() }).optional(),
});

const LegacyStatsSchema = z.object({ repeats: z.number().finite().nonnegative().optional() });

export interface LegacyHistorySources {
  entries: { getValue: () => Promise<unknown> };
  stats: { getValue: () => Promise<unknown> };
}

const migrateEntry = (value: unknown): ClipHistoryEntry => {
  const current = ClipHistoryEntrySchema.safeParse(value);
  if (current.success) return current.data;
  const source = LegacyEntrySchema.parse(value);
  const videoId = source.videoId || extractVideoId(source.sourceWebmUrl);
  const range = ClipRangeSchema.parse(source.range);
  return ClipHistoryEntrySchema.parse({
    ...source,
    identityVersion: source.identityVersion ?? 1,
    videoId,
    clipCount: source.clipCount ?? null,
    app: source.app || '730',
    range,
    eventTime: source.eventTime ?? range.start,
    clipKey: createClipIdentity({ taskId: source.taskId, videoId, range }).clipKey,
    reviewType: source.reviewType ?? (source.cheating ? 'cheating' : 'legacy'),
    deduplication: source.deduplication === 'same-match-different-clip' || source.deduplication === 'shifted-duplicate'
      ? 'new-clip' : source.deduplication ?? 'new-match',
    badClip: source.badClip ?? false,
    matchTimestamp: source.matchTimestamp ?? null,
    webmDuration: source.webmDuration ?? null,
  });
};

export const migrateHistory = async (stateValue: unknown, sources: LegacyHistorySources): Promise<HistoryState> => {
  const current = HistoryStateSchema.safeParse(stateValue);
  if (current.success) return current.data;
  const [entriesValue, statsValue] = await Promise.all([sources.entries.getValue(), sources.stats.getValue()]);
  const legacyState = stateValue == null ? {} : LegacyStateSchema.parse(stateValue);
  const entries = legacyState.entries ?? (entriesValue == null ? {} : z.record(z.string(), z.unknown()).parse(entriesValue));
  const history = emptyHistory();
  for (const value of Object.values(entries)) {
    const entry = migrateEntry(value);
    history.entries[historyKey(entry)] = entry;
  }
  const storedStats = LegacyStatsSchema.safeParse(statsValue);
  history.stats.repeats = Math.floor(legacyState.stats?.repeats ?? (storedStats.success ? storedStats.data.repeats ?? 0 : 0));
  history.entries = Object.fromEntries(Object.entries(history.entries)
    .sort(([, first], [, second]) => first.timestamp - second.timestamp)
    .slice(-HISTORY_LIMIT));
  return history;
};
