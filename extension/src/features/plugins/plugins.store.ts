import { signal } from '@preact/signals';
import { emptyPluginsState, type PluginRecord, type PluginsState } from '../../entities/plugin.entity';
import { pluginsStorage, readPluginData } from './plugins.storage';
import { sendMessage } from '../../shared/ports/extension-messaging.port';
import { STORAGE_COORDINATION_VERSION, type PluginMutation } from '../../shared/ports/storage-protocol.port';
import type { PluginCard, PluginSettingDefinition } from './plugin-wire.port';

export const pluginsSignal = signal<PluginsState>(emptyPluginsState());

/** UI cards rendered by plugins: one per slot (metrics tab / review page). */
export type PluginCardsBySlot = { metrics?: PluginCard; review?: PluginCard };
export const pluginCardsSignal = signal<Record<string, PluginCardsBySlot>>({});

/** Setting definitions declared by running plugins (sandbox reports them). */
export const pluginSettingsSchemasSignal = signal<Record<string, PluginSettingDefinition[] | undefined>>({});

/** Last reported sandbox execution status per plugin id. */
export type PluginRunStatus = 'running' | 'error';
export const pluginStatusSignal = signal<Record<string, { status: PluginRunStatus; message?: string }>>({});

/** Sandbox iframe lifecycle: pending → ready | unavailable (e.g. Firefox). */
export type SandboxState = 'pending' | 'ready' | 'unavailable';
export const sandboxStateSignal = signal<SandboxState>('pending');

/** Set by the bridge; card buttons dispatch clicks through it. */
export const pluginActionDispatchSignal = signal<((pluginId: string, key: string) => void) | null>(null);

export const resetPluginRuntimeState = (): void => {
  pluginCardsSignal.value = {};
  pluginSettingsSchemasSignal.value = {};
  pluginStatusSignal.value = {};
  sandboxStateSignal.value = 'pending';
};

let updateQueue: Promise<unknown> = Promise.resolve();

const updateAtomically = (mutation: PluginMutation): Promise<PluginsState> => {
  const operation = updateQueue.then(() => sendMessage('mutatePlugins', { version: STORAGE_COORDINATION_VERSION, mutation }))
    .then((state) => {
      pluginsSignal.value = state;
      return state;
    });
  updateQueue = operation.then(() => undefined, () => undefined);
  return operation;
};

export const initializePluginsStore = async (
  onError: (error: unknown) => void,
): Promise<() => void> => {
  await updateAtomically({ type: 'initialize' }).catch(onError);
  return pluginsStorage.hydrateAndWatch((state) => {
    pluginsSignal.value = state;
  }, (error) => onError(error));
};

export const savePlugin = (plugin: PluginRecord): Promise<PluginsState> =>
  updateAtomically({ type: 'save-plugin', plugin });

export const removePlugin = (id: string): Promise<PluginsState> =>
  updateAtomically({ type: 'remove-plugin', id });

export const setPluginEnabled = (id: string, enabled: boolean): Promise<PluginsState> =>
  updateAtomically({ type: 'set-enabled', id, enabled });

export const getPluginData = (pluginId: string): Promise<Record<string, unknown>> => readPluginData(pluginId);

/** Reserved key holding the values of the plugin's declared settings. */
export const PLUGIN_SETTINGS_KEY = '__settings__';

export const savePluginSettings = (pluginId: string, values: Record<string, unknown>): Promise<Record<string, unknown>> =>
  sendMessage('mutatePluginData', {
    version: STORAGE_COORDINATION_VERSION,
    mutation: { type: 'set', pluginId, key: PLUGIN_SETTINGS_KEY, value: values },
  });

