import { signal } from '@preact/signals';
import {
  createDefaultPreferences,
  PreferencesSchema,
  type Preferences,
  type PreferencesPatch,
} from '../../entities/preferences.entity';
import { preferencesStorage } from './preferences.storage';
import { sendMessage } from '../../shared/ports/extension-messaging.port';
import { STORAGE_COORDINATION_VERSION } from '../../shared/ports/storage-protocol.port';

export const preferencesSignal = signal<Preferences>(createDefaultPreferences());

let updateQueue: Promise<unknown> = Promise.resolve();

export const initializePreferencesStore = async (
  onError: (error: unknown) => void,
): Promise<() => void> => {
  return preferencesStorage.initialize((preferences) => {
    preferencesSignal.value = preferences;
  }, (error) => onError(error));
};

export const updatePreferences = (patch: PreferencesPatch): Promise<Preferences> => {
  const operation = updateQueue.then(() => sendMessage('mutatePreferences', { version: STORAGE_COORDINATION_VERSION, patch }))
    .then((value) => PreferencesSchema.parse(value))
    .then((preferences) => {
      preferencesSignal.value = preferences;
      return preferences;
    });
  updateQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
};
