import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { UpdateChecker, UpdateCheckRequestSchema } from '../src/features/updates/update-checker.service';
import { extractWebmMetadata } from '../src/features/video-player/webm.parser';
import { onMessage } from '../src/shared/ports/extension-messaging.port';
import { historyStorage } from '../src/features/history/history.storage';
import { preferencesStorage } from '../src/features/preferences/preferences.storage';
import { mutatePluginData, pluginsStorage, readPluginData } from '../src/features/plugins/plugins.storage';
import { HistoryStateSchema } from '../src/entities/history.entity';
import { PreferencesSchema } from '../src/entities/preferences.entity';
import { PluginDataSchema, PluginsStateSchema } from '../src/entities/plugin.entity';
import { WebmMetadataSchema } from '../src/shared/ports/protocol.port';
import { VersionedHistoryMutationSchema, VersionedPluginDataMutationSchema, VersionedPluginMutationSchema, VersionedPreferencesMutationSchema } from '../src/shared/ports/storage-protocol.port';
import { getAllowedWebmUrl } from '../src/shared/utils/url.utils';
import { StorageMutationCoordinator } from '../src/shared/services/storage-mutation.service';

const requireSchema = <T>(result: { success: boolean; data?: T; error?: unknown }, label: string): T => {
  if (result.success && result.data !== undefined) return result.data;
  throw new TypeError(`Invalid ${label}: ${JSON.stringify(result.error)}`, { cause: result.error });
};

export default defineBackground(() => {
  const updateChecker = new UpdateChecker({
    currentVersion: browser.runtime.getManifest().version,
    storage: storage.defineItem<unknown>('local:update-check-cache', { fallback: null }),
  });
  onMessage('checkForUpdates', (message) => {
    const request = requireSchema(UpdateCheckRequestSchema.safeParse(message.data), 'update check request');
    return updateChecker.check(request.force);
  });
  const storageMutations = new StorageMutationCoordinator();
  onMessage('readWebmMetadata', async (message) => {
    const url = getAllowedWebmUrl(message.data);
    if (!url) return null;
    return requireSchema(WebmMetadataSchema.nullable().safeParse(await extractWebmMetadata(url.href)), 'WebM metadata response');
  });
  onMessage('mutateHistory', (message) => storageMutations.enqueue(async () => {
    const request = requireSchema(VersionedHistoryMutationSchema.safeParse(message.data), 'versioned history mutation');
    return requireSchema(HistoryStateSchema.safeParse(await historyStorage.mutate(request.mutation)), 'history response');
  }));
  onMessage('mutatePreferences', (message) => storageMutations.enqueue(async () => {
    const request = requireSchema(VersionedPreferencesMutationSchema.safeParse(message.data), 'versioned preferences mutation');
    return requireSchema(PreferencesSchema.safeParse(await preferencesStorage.mutate(request.patch)), 'preferences response');
  }));
  onMessage('mutatePlugins', (message) => storageMutations.enqueue(async () => {
    const request = requireSchema(VersionedPluginMutationSchema.safeParse(message.data), 'versioned plugins mutation');
    return requireSchema(PluginsStateSchema.safeParse(await pluginsStorage.mutate(request.mutation)), 'plugins response');
  }));
  onMessage('mutatePluginData', (message) => storageMutations.enqueue(async () => {
    const request = requireSchema(VersionedPluginDataMutationSchema.safeParse(message.data), 'versioned plugin data mutation');
    return requireSchema(PluginDataSchema.safeParse(await mutatePluginData(request.mutation)), 'plugin data response');
  }));
  onMessage('readPluginData', (message) => storageMutations.enqueue(async () =>
    requireSchema(PluginDataSchema.safeParse(await readPluginData(message.data)), 'plugin data response')));
});
