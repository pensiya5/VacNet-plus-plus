import { z } from 'zod';
import { ClipHistoryEntrySchema, HistoryStateSchema, type ClipHistoryEntry, type HistoryState } from '../../entities/history.entity';
import { PluginDataKeySchema, PluginDataValueSchema, PluginIdSchema, PluginRecordSchema, PluginsStateSchema, type PluginRecord, type PluginsState } from '../../entities/plugin.entity';
import { PreferencesPatchSchema, type PreferencesPatch } from '../../entities/preferences.entity';

export type { HistoryState } from '../../entities/history.entity';
export type { PluginData, PluginsState } from '../../entities/plugin.entity';

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

export type PluginMutation =
  | { type: 'initialize' }
  | { type: 'save-plugin'; plugin: PluginRecord }
  | { type: 'remove-plugin'; id: string }
  | { type: 'set-enabled'; id: string; enabled: boolean };

export type VersionedPluginMutation = { version: typeof STORAGE_COORDINATION_VERSION; mutation: PluginMutation };

export const PluginMutationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('initialize') }),
  z.strictObject({ type: z.literal('save-plugin'), plugin: PluginRecordSchema }),
  z.strictObject({ type: z.literal('remove-plugin'), id: PluginIdSchema }),
  z.strictObject({ type: z.literal('set-enabled'), id: PluginIdSchema, enabled: z.boolean() }),
]);

export const VersionedPluginMutationSchema = z.strictObject({
  version: z.literal(STORAGE_COORDINATION_VERSION),
  mutation: PluginMutationSchema,
});

export type PluginDataMutation =
  | { type: 'set'; pluginId: string; key: string; value: unknown }
  | { type: 'remove'; pluginId: string; key: string }
  | { type: 'clear'; pluginId: string };

export type VersionedPluginDataMutation = { version: typeof STORAGE_COORDINATION_VERSION; mutation: PluginDataMutation };

export const PluginDataMutationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('set'), pluginId: PluginIdSchema, key: PluginDataKeySchema, value: PluginDataValueSchema }),
  z.strictObject({ type: z.literal('remove'), pluginId: PluginIdSchema, key: PluginDataKeySchema }),
  z.strictObject({ type: z.literal('clear'), pluginId: PluginIdSchema }),
]);

export const VersionedPluginDataMutationSchema = z.strictObject({
  version: z.literal(STORAGE_COORDINATION_VERSION),
  mutation: PluginDataMutationSchema,
});

export const PluginsStateResponseSchema = PluginsStateSchema;
