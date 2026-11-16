import { effect } from '@preact/signals';
import { browser } from 'wxt/browser';
import type { PageSnapshot } from '../../entities/clip.entity';
import type { HistoryState } from '../../entities/history.entity';
import type { Preferences } from '../../entities/preferences.entity';
import { PlayerCommandSchema, ReviewCommandSchema } from '../../shared/ports/protocol.port';
import type { IsolatedMessageBus } from '../../shared/message-bus.adapter';
import { sendMessage } from '../../shared/ports/extension-messaging.port';
import { STORAGE_COORDINATION_VERSION } from '../../shared/ports/storage-protocol.port';
import { preferencesSignal } from '../preferences/preferences.store';
import { historySignal } from '../history/history.store';
import { snapshotSignal } from '../video-player/player/player.store';
import { readPluginData, watchPluginData } from './plugins.storage';
import {
  PLUGIN_SETTINGS_KEY,
  pluginActionDispatchSignal,
  pluginCardsSignal,
  pluginSettingsSchemasSignal,
  pluginStatusSignal,
  pluginsSignal,
  resetPluginRuntimeState,
  sandboxStateSignal,
  type PluginCardsBySlot,
} from './plugins.store';
import {
  PLUGIN_SANDBOX_READY_TIMEOUT_MS,
  PLUGIN_WIRE_CHANNEL,
  HostWireMessageSchema,
  SandboxWireMessageSchema,
  type HostWireMessage,
  type PluginCard,
  type PluginSettingDefinition,
  type PluginWireRecord,
  type SandboxWireMessage,
} from './plugin-wire.port';
import {
  collectHistoryKeys,
  deriveClipTransition,
  deriveNewHistoryEntries,
  entryToVerdictSubmitted,
} from './plugin-events.utils';

interface PluginBridgeOptions {
  bus: IsolatedMessageBus;
  /** Defaults to the WXT-provided runtime URL helper. */
  getSandboxUrl?: () => string;
}

/**
 * Host side of the plugin system: owns the hidden sandbox iframe, forwards
 * validated wire messages in both directions, fans host state signals out as
 * plugin events, and applies plugin UI effects (cards, css) after validation.
 */
export interface PluginBridge {
  start: () => void;
  stop: () => void;
}

export const createPluginBridge = (options: PluginBridgeOptions): PluginBridge => {
  const { bus } = options;
  const getSandboxUrl = options.getSandboxUrl ?? (() => browser.runtime.getURL('/sandbox.html'));

  let isDisposed = true;
  let iframe: HTMLIFrameElement | null = null;
  let readyTimeoutId: number | null = null;
  let sandboxReady = false;
  let stopEffects: (() => void) | null = null;
  let stopDataWatch: (() => void) | null = null;
  let previousTaskId: string | null = null;
  let seenHistoryKeys = new Set<string>();
  // Ids currently loaded in the sandbox. Kept outside signals so status/card
  // updates never re-trigger the plugins effect (it would reload in a loop).
  let loadedIds = new Set<string>();
  // Events observed before the sandbox page reports ready must not be lost:
  // the first clip usually loads while the sandbox iframe is still booting.
  let pendingEvents: HostWireMessage[] = [];
  const styleElements = new Map<string, HTMLStyleElement>();
  const seenSettings = new Map<string, string>();

  /** Current settings values for a plugin: stored values over declared defaults. */
  const readSettingsValues = async (
    pluginId: string,
    schema: readonly PluginSettingDefinition[],
  ): Promise<Record<string, unknown>> => {
    const stored = await readPluginData(pluginId);
    const saved = stored[PLUGIN_SETTINGS_KEY];
    const savedValues = typeof saved === 'object' && saved !== null && !Array.isArray(saved)
      ? saved as Record<string, unknown>
      : {};
    const values: Record<string, unknown> = {};
    for (const definition of schema) {
      values[definition.key] = savedValues[definition.key] !== undefined
        ? savedValues[definition.key]
        : definition.default;
    }
    return values;
  };

  const isWireEnvelope = (data: unknown): data is { channel: string; message: unknown } => {
    if (typeof data !== 'object' || data === null) return false;
    return (data as Record<string, unknown>).channel === PLUGIN_WIRE_CHANNEL;
  };

  const postToSandbox = (message: HostWireMessage): void => {
    if (!iframe?.contentWindow) return;
    // The sandbox has an opaque origin, so '*' is the only valid target origin.
    iframe.contentWindow.postMessage({ channel: PLUGIN_WIRE_CHANNEL, message }, '*');
  };

  const sendLoad = (): void => {
    if (!sandboxReady) return;
    const state = pluginsSignal.value;
    const plugins: PluginWireRecord[] = Object.values(state.plugins)
      .filter((plugin) => plugin.enabled)
      .map(({ id, name, version, code }) => ({ id, name, version, code }));
    postToSandbox(HostWireMessageSchema.parse({ kind: 'load', plugins }));
  };

  const forgetPluginEffects = (id: string): void => {
    const cardNext = { ...pluginCardsSignal.value };
    if (id in cardNext) {
      delete cardNext[id];
      pluginCardsSignal.value = cardNext;
    }
    const schemaNext = { ...pluginSettingsSchemasSignal.value };
    if (id in schemaNext) {
      delete schemaNext[id];
      pluginSettingsSchemasSignal.value = schemaNext;
    }
    const statusNext = { ...pluginStatusSignal.value };
    if (id in statusNext) {
      delete statusNext[id];
      pluginStatusSignal.value = statusNext;
    }
    styleElements.get(id)?.remove();
    styleElements.delete(id);
  };

  const syncLoadedEffects = (): void => {
    const enabled = new Set(
      Object.values(pluginsSignal.value.plugins).filter((plugin) => plugin.enabled).map((plugin) => plugin.id),
    );
    for (const id of [...loadedIds]) {
      if (!enabled.has(id)) forgetPluginEffects(id);
    }
    loadedIds = enabled;
  };

  /** Queue events until the sandbox is ready; coalesce snapshot updates. */
  const postEvent = (name: Extract<HostWireMessage, { kind: 'event' }>['name'], payload: unknown): void => {
    const message = HostWireMessageSchema.parse({ kind: 'event', name, payload });
    if (sandboxReady) {
      postToSandbox(message);
      return;
    }
    const last = pendingEvents[pendingEvents.length - 1];
    if (name === 'snapshot-changed' && last?.kind === 'event' && last.name === 'snapshot-changed') {
      pendingEvents[pendingEvents.length - 1] = message;
      return;
    }
    if (pendingEvents.length >= 200) pendingEvents.shift();
    pendingEvents.push(message);
  };

  const respond = (id: string, pluginId: string, action: () => Promise<unknown> | unknown): void => {
    void Promise.resolve()
      .then(action)
      .then((value) => {
        postToSandbox(HostWireMessageSchema.parse({ kind: 'rpc-response', id, result: { ok: true, value } }));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        postToSandbox(HostWireMessageSchema.parse({ kind: 'rpc-response', id, result: { ok: false, error: message } }));
        recordPluginError(pluginId, message);
      });
  };

  const recordPluginError = (pluginId: string, message: string): void => {
    pluginStatusSignal.value = { ...pluginStatusSignal.value, [pluginId]: { status: 'error', message } };
  };

  type RpcRequest = Extract<SandboxWireMessage, { kind: 'rpc' }>['request'];

  const handleRpc = (id: string, pluginId: string, request: RpcRequest): void => {
    switch (request.method) {
      case 'review-command':
        respond(id, pluginId, () => {
          const parsed = ReviewCommandSchema.safeParse(request.command);
          if (!parsed.success) throw new TypeError('Invalid review command');
          bus.emit({ type: 'review-command', command: parsed.data });
          return null;
        });
        return;
      case 'player-command':
        respond(id, pluginId, () => {
          const parsed = PlayerCommandSchema.safeParse(request.command);
          if (!parsed.success) throw new TypeError('Invalid player command');
          bus.emit({ type: 'player-command', command: parsed.data });
          return null;
        });
        return;
      case 'storage.get':
        respond(id, pluginId, async () => sendMessage('readPluginData', pluginId));
        return;
      case 'storage.set':
        respond(id, pluginId, async () => {
          await sendMessage('mutatePluginData', {
            version: STORAGE_COORDINATION_VERSION,
            mutation: { type: 'set', pluginId, key: request.key, value: request.value },
          });
          return null;
        });
        return;
      case 'storage.remove':
        respond(id, pluginId, async () => {
          await sendMessage('mutatePluginData', {
            version: STORAGE_COORDINATION_VERSION,
            mutation: { type: 'remove', pluginId, key: request.key },
          });
          return null;
        });
        return;
      case 'settings.define':
        respond(id, pluginId, async () => {
          pluginSettingsSchemasSignal.value = {
            ...pluginSettingsSchemasSignal.value,
            [pluginId]: request.settings,
          };
          return readSettingsValues(pluginId, request.settings);
        });
        return;
      case 'settings.get':
        respond(id, pluginId, async () => {
          const schema = pluginSettingsSchemasSignal.value[pluginId] ?? [];
          return readSettingsValues(pluginId, schema);
        });
        return;
      case 'ui.card':
        respond(id, pluginId, () => {
          const slot = request.slot ?? request.card?.slot ?? 'metrics';
          const current = { ...pluginCardsSignal.value };
          if (request.card === null) {
            const scoped = current[pluginId];
            if (scoped && scoped[slot]) {
              const next: PluginCardsBySlot = { ...scoped };
              delete next[slot];
              if (next.metrics || next.review) current[pluginId] = next;
              else delete current[pluginId];
              pluginCardsSignal.value = current;
            }
          } else {
            const card: PluginCard = { ...request.card, slot };
            current[pluginId] = { ...current[pluginId], [slot]: card };
            pluginCardsSignal.value = current;
          }
          return null;
        });
        return;
      case 'dom.css':
        respond(id, pluginId, () => {
          const existing = styleElements.get(pluginId);
          if (request.css === null) {
            existing?.remove();
            styleElements.delete(pluginId);
          } else {
            const style = existing ?? document.createElement('style');
            style.setAttribute('data-vacnet-plugin-css', pluginId);
            style.textContent = request.css;
            if (!existing) {
              (document.head ?? document.documentElement).append(style);
              styleElements.set(pluginId, style);
            }
          }
          return null;
        });
        return;
    }
  };

  const receive = (event: MessageEvent): void => {
    if (isDisposed || event.source !== iframe?.contentWindow) return;
    const data = event.data as unknown;
    if (!isWireEnvelope(data)) return;
    const parsed = SandboxWireMessageSchema.safeParse(data.message);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.kind === 'ready') {
      sandboxReady = true;
      if (readyTimeoutId !== null) window.clearTimeout(readyTimeoutId);
      readyTimeoutId = null;
      sandboxStateSignal.value = 'ready';
      sendLoad();
      // Replay the events queued while the sandbox was booting.
      for (const queued of pendingEvents) postToSandbox(queued);
      pendingEvents = [];
      return;
    }
    if (message.kind === 'plugin-status') {
      pluginStatusSignal.value = {
        ...pluginStatusSignal.value,
        [message.id]: { status: message.status, message: message.message },
      };
      return;
    }
    handleRpc(message.id, message.pluginId, message.request);
  };

  const markSandboxUnavailable = (): void => {
    if (sandboxReady || isDisposed) return;
    sandboxStateSignal.value = 'unavailable';
  };

  const ensureIframe = (): void => {
    iframe = document.createElement('iframe');
    iframe.src = getSandboxUrl();
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.display = 'none';
    document.body.append(iframe);
    readyTimeoutId = window.setTimeout(markSandboxUnavailable, PLUGIN_SANDBOX_READY_TIMEOUT_MS);
  };

  const startEffects = (): void => {
    const stopSnapshot = effect(() => {
      const snapshot: PageSnapshot = snapshotSignal.value;
      const transition = deriveClipTransition(previousTaskId, snapshot);
      previousTaskId = transition.nextTaskId;
      if (transition.payload) {
        postEvent('clip-loaded', transition.payload);
      }
      postEvent('snapshot-changed', { snapshot });
    });

    const stopHistory = effect(() => {
      const history: HistoryState = historySignal.value;
      const { nextKeys, added } = deriveNewHistoryEntries(seenHistoryKeys, history);
      seenHistoryKeys = nextKeys;
      postEvent('history-changed', { entryCount: Object.keys(history.entries).length, repeats: history.stats.repeats });
      for (const entry of added) {
        const payload = entryToVerdictSubmitted(entry);
        if (payload) postEvent('verdict-submitted', payload);
      }
    });

    const stopPreferences = effect(() => {
      const preferences: Preferences = preferencesSignal.value;
      postEvent('preferences-changed', { preferences });
    });

    // Settings edited in the plugin manager reach the sandbox as events.
    // The first sighting emits too: a plugin enabled with stored settings
    // already received the same values through define(), so a duplicate is
    // harmless and keeps every writer in sync.
    stopDataWatch = watchPluginData((data) => {
      for (const [pluginId, scoped] of Object.entries(data)) {
        const raw = scoped[PLUGIN_SETTINGS_KEY];
        if (raw === undefined) continue;
        const serialized = JSON.stringify(raw);
        if (seenSettings.get(pluginId) === serialized) continue;
        seenSettings.set(pluginId, serialized);
        const values = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
          ? raw as Record<string, unknown>
          : {};
        postEvent('settings-changed', { pluginId, values });
      }
    });

    const stopPlugins = effect(() => {
      syncLoadedEffects();
      sendLoad();
    });

    stopEffects = () => {
      stopSnapshot();
      stopHistory();
      stopPreferences();
      stopPlugins();
    };
  };

  const start = (): void => {
    if (!isDisposed) return;
    isDisposed = false;
    seenHistoryKeys = collectHistoryKeys(historySignal.value);
    window.addEventListener('message', receive);
    ensureIframe();
    startEffects();
    // Card buttons dispatch here; the sandbox receives 'card-action' events.
    pluginActionDispatchSignal.value = (pluginId: string, key: string): void => {
      postEvent('card-action', { pluginId, key });
    };
  };

  const stop = (): void => {
    if (isDisposed) return;
    isDisposed = true;
    pluginActionDispatchSignal.value = null;
    stopEffects?.();
    stopEffects = null;
    stopDataWatch?.();
    stopDataWatch = null;
    seenSettings.clear();
    window.removeEventListener('message', receive);
    if (readyTimeoutId !== null) window.clearTimeout(readyTimeoutId);
    readyTimeoutId = null;
    sandboxReady = false;
    iframe?.remove();
    iframe = null;
    for (const id of [...loadedIds, ...styleElements.keys()]) forgetPluginEffects(id);
    loadedIds = new Set();
    pendingEvents = [];
    resetPluginRuntimeState();
  };

  return { start, stop };
};
