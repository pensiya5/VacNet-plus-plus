import { getMessage } from '../../shared/services/i18n.service';
import { storage } from 'wxt/utils/storage';
import {
  HISTORY_STATE_VERSION,
  HistoryStateSchema,
  type HistoryState,
} from '../../entities/history.entity';
import { addHistoryEntry, limitHistory, recordHistoryRepeat } from './history.utils';
import { migrateHistory } from './history.migration';
import type { HistoryMutation } from '../../shared/ports/storage-protocol.port';

const HISTORY_STORAGE_VERSION = HISTORY_STATE_VERSION;

const legacyEntries = storage.defineItem<unknown>('local:vacnetHistory', { fallback: null });
const legacyStats = storage.defineItem<unknown>('local:vacnetHistoryStats', { fallback: null });


const storedHistory = storage.defineItem<HistoryState | null>('local:history', {
  fallback: null,
  version: HISTORY_STORAGE_VERSION,
});

const getValue = async (): Promise<HistoryState> => {
  const value = await storedHistory.getValue();
  const current = HistoryStateSchema.safeParse(value);
  // Readers can preview old data; only the background mutation queue writes it.
  return current.success ? current.data
    : migrateHistory(value, { entries: legacyEntries, stats: legacyStats });
};

const cleanupLegacy = async (): Promise<void> => {
  await Promise.all([
    legacyEntries.removeValue(),
    legacyStats.removeValue(),
  ]);
};

const setValue = async (history: HistoryState): Promise<void> => {
  await storedHistory.setValue(HistoryStateSchema.parse(history));
  await storedHistory.setMeta({ v: HISTORY_STORAGE_VERSION });
};

const watch = (
  listener: (history: HistoryState) => void,
  onError: (error: unknown) => void,
): (() => void) =>
  storedHistory.watch((value) => {
    const result = HistoryStateSchema.safeParse(value);
    if (!result.success) {
       onError(new TypeError(getMessage('errHistoryInvalidStoredValue'), { cause: result.error }));
      return;
    }
    listener(result.data);
  });

const hydrateAndWatch = async (
  listener: (history: HistoryState) => void,
  onError: (error: unknown) => void,
): Promise<() => void> => {
  let revision = 0;
  const unwatch = watch((history) => {
    revision += 1;
    listener(history);
  }, onError);
  try {
    const history = await getValue();
    if (revision === 0) listener(history);
    return unwatch;
  } catch (error) {
    unwatch();
    throw error;
  }
};

const mutate = async (mutation: HistoryMutation): Promise<HistoryState> => {
  if (mutation.type === 'initialize') {
    // Avoid WXT's eager per-context migrations: a stale UI migration could
    // overwrite a newer verdict. Persist upgrades only in the background queue.
    const stored = await storedHistory.getValue();
    const parsed = HistoryStateSchema.safeParse(stored);
    const current = parsed.success ? parsed.data
      : await migrateHistory(stored, { entries: legacyEntries, stats: legacyStats });
    if (!parsed.success) await setValue(current);
    await cleanupLegacy();
    return current;
  }
  const current = await getValue();
  let next: HistoryState;
  switch (mutation.type) {
    case 'save-entry': next = addHistoryEntry(current, mutation.entry); break;
    case 'record-repeat': next = recordHistoryRepeat(current); break;
    case 'clear': next = { version: HISTORY_STATE_VERSION, entries: {}, stats: { repeats: 0 } }; break;
    case 'replace': next = limitHistory(HistoryStateSchema.parse(mutation.state)); break;
    default: throw new Error(getMessage("errUnhandledHistoryMutation", String(mutation)));
  }
  await setValue(next);
  return next;
};

export const historyStorage = { getValue, hydrateAndWatch, mutate };
