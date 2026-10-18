import { storage } from 'wxt/utils/storage';
import {
  createDefaultPreferences,
  PreferencesSchema,
  type Preferences,
  type PreferencesPatch,
} from '../../entities/preferences.entity';
import { migrateStoredPreferences } from './preferences.migration';
import { getMessage } from '../../shared/services/i18n.service';

const legacyDashboardOpen = storage.defineItem<unknown>('local:dashboardOpen', { fallback: null });
const legacyStretchVideo = storage.defineItem<unknown>('local:stretchVideo', { fallback: null });

const migratePreferences = async (value: unknown): Promise<Preferences> => migrateStoredPreferences(value, {
  dashboardOpen: await legacyDashboardOpen.getValue(),
  stretchVideo: await legacyStretchVideo.getValue(),
});

const storedPreferences = storage.defineItem<unknown>('local:preferences', {
  fallback: createDefaultPreferences(),
});

const getValue = async (): Promise<Preferences> => migratePreferences(await storedPreferences.getValue());

const cleanupLegacy = async (): Promise<void> => {
  await Promise.all([
    legacyDashboardOpen.removeValue(),
    legacyStretchVideo.removeValue(),
  ]);
};

const filterPatch = (current: Preferences, patch: unknown): Preferences => {
  const parsedPatch = PreferencesSchema.partial().safeParse(patch);
  if (!parsedPatch.success) {
    throw new TypeError(getMessage('errPreferencesInvalidPatch'), { cause: parsedPatch.error });
  }
  return PreferencesSchema.parse({ ...current, ...parsedPatch.data });
};

const setValue = async (preferences: Preferences): Promise<void> => {
  await storedPreferences.setValue(PreferencesSchema.parse(preferences));
};

const watch = (
  listener: (preferences: Preferences) => void,
  onError: (error: TypeError) => void,
): (() => void) => storedPreferences.watch((value) => {
  migratePreferences(value)
    .then(listener)
    .catch((error) => {
      onError(new TypeError(getMessage('errPreferencesInvalidStoredValue'), { cause: error }));
    });
});

const hydrateAndWatch = async (
  listener: (preferences: Preferences) => void,
  onError: (error: TypeError) => void,
): Promise<() => void> => {
  let revision = 0;
  const unwatch = watch((preferences) => {
    revision += 1;
    listener(preferences);
  }, onError);
  try {
    const preferences = await getValue();
    if (revision === 0) listener(preferences);
    return unwatch;
  } catch (error) {
    unwatch();
    throw error;
  }
};

const initialize = async (
  listener: (preferences: Preferences) => void,
  onError: (error: TypeError) => void,
): Promise<() => void> => {
  const unwatch = await hydrateAndWatch(listener, onError);
  await cleanupLegacy();
  return unwatch;
};

const mutate = async (patch: PreferencesPatch): Promise<Preferences> => {
  const next = filterPatch(await getValue(), patch);
  await setValue(next);
  return next;
};

export const preferencesStorage = { getValue, initialize, mutate };
