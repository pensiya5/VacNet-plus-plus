import { z } from 'zod';

export const PLUGINS_STATE_VERSION = 1 as const;
export const PLUGIN_LIMIT = 20;
export const PLUGIN_CODE_MAX_LENGTH = 262_144;
export const PLUGIN_DATA_MAX_LENGTH = 65_536;
export const PLUGIN_NAME_MAX_LENGTH = 64;
export const PLUGIN_ID_MAX_LENGTH = 64;

const pluginIdPattern = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u;

export const PluginIdSchema = z.string().regex(
  pluginIdPattern,
  'Plugin id must be 3-64 characters: lowercase letters, digits and hyphens.',
);

export const PluginRecordSchema = z.strictObject({
  id: PluginIdSchema,
  name: z.string().trim().min(1).max(PLUGIN_NAME_MAX_LENGTH),
  version: z.string().trim().min(1).max(32),
  enabled: z.boolean(),
  code: z.string().min(1).max(PLUGIN_CODE_MAX_LENGTH),
  updatedAt: z.number().finite().nonnegative(),
});

export const PluginsStateSchema = z.strictObject({
  version: z.literal(PLUGINS_STATE_VERSION),
  plugins: z.record(z.string(), PluginRecordSchema),
});

export type PluginRecord = z.infer<typeof PluginRecordSchema>;
export type PluginsState = z.infer<typeof PluginsStateSchema>;

export const emptyPluginsState = (): PluginsState => ({
  version: PLUGINS_STATE_VERSION,
  plugins: {},
});

/** Plugin data values cross the wire and storage; keep them small JSON values. */
export const PluginDataValueSchema = z.unknown().superRefine((value, ctx) => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Plugin data must be JSON-serializable.' });
    return;
  }
  if (serialized === undefined) {
    ctx.addIssue({ code: 'custom', message: 'Plugin data must be JSON-serializable.' });
    return;
  }
  if (serialized.length > PLUGIN_DATA_MAX_LENGTH) {
    ctx.addIssue({ code: 'custom', message: 'Plugin data value is too large.' });
  }
});

export const PluginDataKeySchema = z.string().trim().min(1).max(512);

export const PluginDataSchema = z.record(z.string(), z.unknown());

export type PluginData = z.infer<typeof PluginDataSchema>;
