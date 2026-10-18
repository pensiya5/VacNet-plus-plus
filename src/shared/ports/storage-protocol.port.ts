import { z } from 'zod';
import { ClipHistoryEntrySchema, HistoryStateSchema, type ClipHistoryEntry, type HistoryState } from '../../entities/history.entity';
import { PreferencesPatchSchema, type PreferencesPatch } from '../../entities/preferences.entity';

export type { HistoryState } from '../../entities/history.entity';

export const STORAGE_COORDINATION_VERSION = 1 as const;

export type HistoryMutation =
  | { type: 'initialize' }
  | { type: 'save-entry'; entry: ClipHistoryEntry }
  | { type: 'record-repeat' }
  | { type: 'clear' }
  | { type: 'replace'; state: HistoryState };

export type VersionedHistoryMutation = { version: typeof STORAGE_COORDINATION_VERSION; mutation: HistoryMutation };
export type VersionedPreferencesMutation = { version: typeof STORAGE_COORDINATION_VERSION; patch: PreferencesPatch };

export const HistoryMutationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('initialize') }),
  z.strictObject({ type: z.literal('save-entry'), entry: ClipHistoryEntrySchema }),
  z.strictObject({ type: z.literal('record-repeat') }),
  z.strictObject({ type: z.literal('clear') }),
  z.strictObject({ type: z.literal('replace'), state: HistoryStateSchema }),
]);

export const VersionedHistoryMutationSchema = z.strictObject({
  version: z.literal(STORAGE_COORDINATION_VERSION),
  mutation: HistoryMutationSchema,
});

export const VersionedPreferencesMutationSchema = z.strictObject({
  version: z.literal(STORAGE_COORDINATION_VERSION),
  patch: PreferencesPatchSchema,
});
