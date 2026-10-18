import type { ClipHistoryEntry } from '../../entities/history.entity';
import { verdictNames, type VerdictValue } from '../../entities/verdict.entity';

export interface HistoryFilters {
  query: string;
  verdict: 'all' | VerdictValue | 'bad-clip';
  repeat: 'all' | 'exact-duplicate';
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_HISTORY_FILTERS: Readonly<HistoryFilters> = {
  query: '', verdict: 'all', repeat: 'all', dateFrom: '', dateTo: '',
};

const localDay = (value: string): Date | null => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]) - 1;
  const day = Number(parts[3]);
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
};

export const isHistoryDateRangeValid = (dateFrom: string, dateTo: string): boolean => {
  const from = dateFrom ? localDay(dateFrom) : null;
  const to = dateTo ? localDay(dateTo) : null;
  if ((dateFrom && !from) || (dateTo && !to)) return false;
  return !from || !to || from.getTime() <= to.getTime();
};

export const filterHistoryEntries = (
  entries: readonly ClipHistoryEntry[], filters: Readonly<HistoryFilters>,
): ClipHistoryEntry[] => {
  if (!isHistoryDateRangeValid(filters.dateFrom, filters.dateTo)) return [];
  const query = filters.query.trim().toLowerCase();
  const from = filters.dateFrom ? localDay(filters.dateFrom) : null;
  const to = filters.dateTo ? localDay(filters.dateTo) : null;
  // Advance by a local calendar day, which can span 23 or 25 hours around DST.
  if (to) to.setDate(to.getDate() + 1);
  const start = from?.getTime() ?? -Infinity;
  const end = to?.getTime() ?? Infinity;

  return entries.filter((entry) => {
    if (query && !entry.taskId.toLowerCase().includes(query) && !entry.videoId.toLowerCase().includes(query)) return false;
    if (entry.timestamp < start || entry.timestamp >= end) return false;
    if (filters.repeat !== 'all' && entry.deduplication !== filters.repeat) return false;
    if (filters.verdict === 'all') return true;
    if (filters.verdict === 'bad-clip') return entry.badClip;
    if (entry.badClip) return false;
    return entry.reviewType === 'cheating'
      ? entry.cheating === filters.verdict
      : verdictNames.some((category) => entry[category] === filters.verdict);
  });
};
