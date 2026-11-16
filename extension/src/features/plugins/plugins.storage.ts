import { z } from 'zod';
import { storage } from 'wxt/utils/storage';
import {
  emptyPluginsState,
  PLUGIN_LIMIT,
  PluginsStateSchema,
  type PluginsState,
} from '../../entities/plugin.entity';
import { PluginDataMutationSchema, type PluginDataMutation, type PluginMutation } from '../../shared/ports/storage-protocol.port';

const PluginDataMapSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

const storedPlugins = storage.defineItem<PluginsState | null>('local:plugins', {
  fallback: null,
  version: 1,
});

const storedPluginData = storage.defineItem<Record<string, Record<string, unknown>>>('local:plugin-data', {
  fallback: {},
});

const readPluginsState = (value: unknown): PluginsState => {
  const parsed = PluginsStateSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyPluginsState();
};

const readScopedData = (pluginId: string, data: Record<string, Record<string, unknown>>): Record<string, unknown> => {
  const parsed = z.record(z.string(), z.unknown()).safeParse(data[pluginId]);
  return parsed.success ? parsed.data : {};
};

const getValue = async (): Promise<PluginsState> => readPluginsState(await storedPlugins.getValue());

const setValue = async (state: PluginsState): Promise<void> => {
  await storedPlugins.setValue(PluginsStateSchema.parse(state));
  await storedPlugins.setMeta({ v: 1 });
};

const watch = (
  listener: (state: PluginsState) => void,
  onError: (error: unknown) => void,
): (() => void) => storedPlugins.watch((value) => {
  const parsed = PluginsStateSchema.safeParse(value);
  if (!parsed.success) {
    onError(new TypeError('Invalid stored plugins state', { cause: parsed.error }));
    return;
  }
  listener(parsed.data);
});

const hydrateAndWatch = async (
  listener: (state: PluginsState) => void,
  onError: (error: unknown) => void,
): Promise<() => void> => {
  let revision = 0;
  const unwatch = watch((state) => {
    revision += 1;
    listener(state);
  }, onError);
  try {
    const state = await getValue();
    if (revision === 0) listener(state);
    return unwatch;
  } catch (error) {
    unwatch();
    throw error;
  }
};

const mutate = async (mutation: PluginMutation): Promise<PluginsState> => {
  if (mutation.type === 'initialize') {
    const stored = await storedPlugins.getValue();
    const parsed = PluginsStateSchema.safeParse(stored);
    const current = parsed.success ? parsed.data : emptyPluginsState();
    if (!parsed.success) await setValue(current);
    return current;
  }
  const current = await getValue();
  let next: PluginsState;
  switch (mutation.type) {
    case 'save-plugin': {
      const existing = current.plugins[mutation.plugin.id];
      if (!existing && Object.keys(current.plugins).length >= PLUGIN_LIMIT) {
        throw new RangeError(`Plugin limit reached (${PLUGIN_LIMIT}).`);
      }
      next = { ...current, plugins: { ...current.plugins, [mutation.plugin.id]: mutation.plugin } };
      break;
    }
    case 'remove-plugin': {
      if (!(mutation.id in current.plugins)) return current;
      const plugins = { ...current.plugins };
      delete plugins[mutation.id];
      next = { ...current, plugins };
      await mutatePluginData({ type: 'clear', pluginId: mutation.id });
      break;
    }
    case 'set-enabled': {
      const existing = current.plugins[mutation.id];
      if (!existing) return current;
      next = { ...current, plugins: { ...current.plugins, [mutation.id]: { ...existing, enabled: mutation.enabled } } };
      break;
    }
    default:
      throw new Error(`Unhandled plugin mutation: ${String((mutation as { type: string }).type)}`);
  }
  await setValue(next);
  return next;
};

export const readPluginData = async (pluginId: string): Promise<Record<string, unknown>> =>
  readScopedData(pluginId, PluginDataMapSchema.parse(await storedPluginData.getValue()));

/** Fires whenever any plugin writes data (settings, cache…). Best-effort. */
export const watchPluginData = (
  listener: (data: Record<string, Record<string, unknown>>) => void,
): (() => void) => storedPluginData.watch((value) => {
  const parsed = PluginDataMapSchema.safeParse(value);
  if (parsed.success) listener(parsed.data);
});

export const mutatePluginData = async (mutation: PluginDataMutation): Promise<Record<string, unknown>> => {
  const request = PluginDataMutationSchema.parse(mutation);
  const data = PluginDataMapSchema.parse(await storedPluginData.getValue());
  const scoped = { ...readScopedData(request.pluginId, data) };
  switch (request.type) {
    case 'set':
      scoped[request.key] = request.value;
      break;
    case 'remove':
      delete scoped[request.key];
      break;
    case 'clear':
      await storedPluginData.setValue({ ...data, [request.pluginId]: {} });
      return {};
  }
  await storedPluginData.setValue({ ...data, [request.pluginId]: scoped });
  return scoped;
};

export const pluginsStorage = { getValue, hydrateAndWatch, mutate };
