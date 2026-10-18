import { defineExtensionMessaging } from '@webext-core/messaging';
import type { WebmMetadata } from '../ports/protocol.port';
import type { HistoryState, VersionedHistoryMutation, VersionedPreferencesMutation } from '../ports/storage-protocol.port';
import type { Preferences } from '../../entities/preferences.entity';
import type { UpdateCheckResult } from '../../features/updates/update-checker.service';

export interface ExtensionProtocolMap {
  checkForUpdates: (request: { force: boolean }) => UpdateCheckResult;
  readWebmMetadata: (url: string) => WebmMetadata | null;
  mutateHistory: (mutation: VersionedHistoryMutation) => HistoryState;
  mutatePreferences: (patch: VersionedPreferencesMutation) => Preferences;
}

export const { onMessage, sendMessage } = defineExtensionMessaging<ExtensionProtocolMap>();
