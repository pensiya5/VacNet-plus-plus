import { z } from 'zod';
import { ClipDataSchema, PageSnapshotSchema, type ClipData, type PageSnapshot } from '../../entities/clip.entity';
import { PluginIdSchema, PluginDataKeySchema, PluginDataValueSchema, PLUGIN_CODE_MAX_LENGTH } from '../../entities/plugin.entity';
import { PreferencesSchema, type Preferences } from '../../entities/preferences.entity';
import { VerdictSelectionSchema, type VerdictSelection } from '../../entities/verdict.entity';
import { PlayerCommandSchema, ReviewCommandSchema, type PlayerCommand, type ReviewCommand } from '../../shared/ports/protocol.port';

export const PLUGIN_WIRE_CHANNEL = 'vacnet:plugins:v1';
export const PLUGIN_RPC_TIMEOUT_MS = 5_000;
export const PLUGIN_SANDBOX_READY_TIMEOUT_MS = 5_000;
/** The sandbox iframe only accepts wire messages posted by the review portal page. */
export const PLUGIN_HOST_ORIGIN = 'https://www.counter-strike.net';

export const PluginWireRecordSchema = z.strictObject({
  id: PluginIdSchema,
  name: z.string().trim().min(1).max(64),
  version: z.string().trim().min(1).max(32),
  code: z.string().min(1).max(PLUGIN_CODE_MAX_LENGTH),
});

export type PluginWireRecord = z.infer<typeof PluginWireRecordSchema>;

/** Probability bar row: category name + fill ratio (0..1). */
export const PluginCardBarSchema = z.strictObject({
  label: z.string().trim().min(1).max(64),
  value: z.number().finite().min(0).max(1),
});

export type PluginCardBar = z.infer<typeof PluginCardBarSchema>;

/** Clickable button rendered inside the card. */
export const PluginCardActionSchema = z.strictObject({
  key: z.string().trim().min(1).max(32).regex(/^[a-z0-9-]+$/u, 'Action key must be lowercase letters, digits, hyphens.'),
  label: z.string().trim().min(1).max(32),
});

export type PluginCardAction = z.infer<typeof PluginCardActionSchema>;

/** Optional thin progress indicator for long-running work. */
export const PluginCardProgressSchema = z.strictObject({
  value: z.number().finite().min(0).max(1),
  label: z.string().max(128).optional(),
});

export type PluginCardProgress = z.infer<typeof PluginCardProgressSchema>;

export const PluginCardSchema = z.strictObject({
  title: z.string().trim().min(1).max(128),
  text: z.string().max(512),
  /** Where the card shows up: the metrics tab (default) or under the verdict panel. */
  slot: z.enum(['metrics', 'review']).default('metrics'),
  /** Probability bars (up to 8). */
  bars: z.array(PluginCardBarSchema).max(8).optional(),
  /** Buttons rendered inside the card; clicks arrive as 'card-action' events. */
  actions: z.array(PluginCardActionSchema).max(3).optional(),
  /** Thin staged progress bar (e.g. download → frames → inference). */
  progress: PluginCardProgressSchema.nullable().optional(),
});

export type PluginCard = z.infer<typeof PluginCardSchema>;

/** A user-editable plugin option rendered by the plugin manager. */
export const PluginSettingDefinitionSchema = z.strictObject({
  key: z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9_.-]*$/iu, 'Setting key must be lowercase letters, digits, dots, hyphens or underscores.'),
  label: z.string().trim().min(1).max(128),
  type: z.enum(['toggle', 'choice', 'number', 'text']),
  default: z.union([z.boolean(), z.number(), z.string()]),
  options: z.array(z.string().max(128)).min(1).max(24).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
}).superRefine((setting, ctx) => {
  if (setting.type === 'choice' && !setting.options?.length) {
    ctx.addIssue({ code: 'custom', message: 'Choice settings need options.' });
  }
  if (setting.type !== 'choice' && setting.options !== undefined) {
    ctx.addIssue({ code: 'custom', message: 'Only choice settings take options.' });
  }
  if (setting.type === 'toggle' && typeof setting.default !== 'boolean') {
    ctx.addIssue({ code: 'custom', message: 'Toggle default must be boolean.' });
  }
  if (setting.type === 'number' && typeof setting.default !== 'number') {
    ctx.addIssue({ code: 'custom', message: 'Number default must be a number.' });
  }
  if ((setting.type === 'choice' || setting.type === 'text') && typeof setting.default !== 'string') {
    ctx.addIssue({ code: 'custom', message: 'Choice/text default must be a string.' });
  }
});

export type PluginSettingDefinition = z.infer<typeof PluginSettingDefinitionSchema>;

export const PluginSettingsDefinitionsSchema = z.array(PluginSettingDefinitionSchema).max(12);

export const PluginEventNameSchema = z.enum([
  'clip-loaded',
  'snapshot-changed',
  'verdict-submitted',
  'history-changed',
  'preferences-changed',
  'settings-changed',
  'card-action',
]);

export type PluginEventName = z.infer<typeof PluginEventNameSchema>;

export type PluginEventPayload = {
  'clip-loaded': { clip: ClipData; deduplication: PageSnapshot['deduplication'] };
  'snapshot-changed': { snapshot: PageSnapshot };
  'verdict-submitted': { clip: ClipData; verdicts: VerdictSelection; badClip: boolean };
  'history-changed': { entryCount: number; repeats: number };
  'preferences-changed': { preferences: Preferences };
  'settings-changed': { pluginId: string; values: Record<string, unknown> };
  'card-action': { pluginId: string; key: string };
};

export const PluginRpcMethodSchema = z.enum([
  'review-command',
  'player-command',
  'storage.get',
  'storage.set',
  'storage.remove',
  'settings.define',
  'settings.get',
  'ui.card',
  'dom.css',
]);

export type PluginRpcMethod = z.infer<typeof PluginRpcMethodSchema>;

const rpcId = z.string().min(1).max(128);

const PluginRpcParamsSchema = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('review-command'), command: ReviewCommandSchema }),
  z.strictObject({ method: z.literal('player-command'), command: PlayerCommandSchema }),
  z.strictObject({ method: z.literal('storage.get') }),
  z.strictObject({ method: z.literal('storage.set'), key: PluginDataKeySchema, value: PluginDataValueSchema }),
  z.strictObject({ method: z.literal('storage.remove'), key: PluginDataKeySchema }),
  z.strictObject({ method: z.literal('settings.define'), settings: PluginSettingsDefinitionsSchema }),
  z.strictObject({ method: z.literal('settings.get') }),
  z.strictObject({ method: z.literal('ui.card'), card: PluginCardSchema.nullable(), slot: z.enum(['metrics', 'review']).optional() }),
  z.strictObject({ method: z.literal('dom.css'), css: z.string().max(65_536).nullable() }),
]);

export type PluginRpcRequest = z.infer<typeof PluginRpcParamsSchema> & { id: string };

const RpcResultSchema = z.strictObject({
  ok: z.boolean(),
  value: z.unknown().optional(),
  error: z.string().max(2_048).optional(),
});

/** Host → sandbox: replace the whole plugin set, deliver an event, answer an RPC. */
export const HostWireMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('load'), plugins: z.array(PluginWireRecordSchema).max(20) }),
  z.strictObject({
    kind: z.literal('event'),
    name: PluginEventNameSchema,
    payload: z.unknown(),
  }),
  z.strictObject({ kind: z.literal('rpc-response'), id: rpcId, result: RpcResultSchema }),
]);

/** Sandbox → host: announce readiness, request a host action, report plugin status. */
export const SandboxWireMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ready') }),
  z.strictObject({ kind: z.literal('rpc'), id: rpcId, pluginId: PluginIdSchema, request: PluginRpcParamsSchema }),
  z.strictObject({
    kind: z.literal('plugin-status'),
    id: PluginIdSchema,
    status: z.enum(['running', 'error']),
    message: z.string().max(2_048).optional(),
  }),
]);

export type HostWireMessage = z.infer<typeof HostWireMessageSchema>;
export type SandboxWireMessage = z.infer<typeof SandboxWireMessageSchema>;

/** Validate event payloads for the events the host can dispatch. */
export const PluginEventPayloadSchemas = {
  'clip-loaded': z.strictObject({ clip: ClipDataSchema, deduplication: PageSnapshotSchema.shape.deduplication }),
  'snapshot-changed': z.strictObject({ snapshot: PageSnapshotSchema }),
  'verdict-submitted': z.strictObject({ clip: ClipDataSchema, verdicts: VerdictSelectionSchema, badClip: z.boolean() }),
  'history-changed': z.strictObject({ entryCount: z.number().int().nonnegative(), repeats: z.number().int().nonnegative() }),
  'preferences-changed': z.strictObject({ preferences: PreferencesSchema }),
  'settings-changed': z.strictObject({ pluginId: PluginIdSchema, values: z.record(z.string(), z.unknown()) }),
  'card-action': z.strictObject({ pluginId: PluginIdSchema, key: z.string().min(1).max(32) }),
} as const satisfies Record<PluginEventName, z.ZodType>;

export type ReviewCommandWire = ReviewCommand;
export type PlayerCommandWire = PlayerCommand;
