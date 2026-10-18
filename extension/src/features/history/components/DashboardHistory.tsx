import { useId, useMemo, useState } from 'preact/hooks';
import { MetricSection } from '../../../shared/components/MetricSection';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import { HistoryMatchCard } from './HistoryMatchCard';
import { groupHistoryByMatch, matchHistoryKey } from '../history.utils';
import {
  DEFAULT_HISTORY_FILTERS, filterHistoryEntries, isHistoryDateRangeValid, type HistoryFilters,
} from '../history-filter.utils';
import type { HistoryState } from '../../../entities/history.entity';
import styles from './DashboardHistory.module.css';

interface DashboardHistoryProps {
  totalClipsViewed: string | number;
  history: HistoryState;
}

export const DashboardHistory = ({ totalClipsViewed, history }: DashboardHistoryProps) => {
  const t = useTranslation();
  const [filters, setFilters] = useState<HistoryFilters>({ ...DEFAULT_HISTORY_FILTERS });
  const dateErrorId = useId();
  const entries = useMemo(() => Object.values(history.entries)
    .sort((first, second) => second.timestamp - first.timestamp), [history.entries]);
  const filteredEntries = useMemo(() => filterHistoryEntries(entries, filters), [entries, filters]);
  const matches = useMemo(() => groupHistoryByMatch(filteredEntries), [filteredEntries]);
  const invalidDateRange = !isHistoryDateRangeValid(filters.dateFrom, filters.dateTo);
  const updateFilter = <Key extends keyof HistoryFilters>(key: Key, value: HistoryFilters[Key]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <>
      <MetricSection title={t('clipLogSummary')} entries={[
        { label: t('totalClipsViewed'), value: totalClipsViewed },
        { label: t('savedInLocalHistory'), value: entries.length },
        { label: t('clipRepeats'), value: history.stats.repeats },
      ]} />
      <section class={styles.section}>
        <h3>{t('recentClips')}</h3>
        <div class={styles.filters}>
          <label class={styles.search}>
            <span>{t('historySearchLabel')}</span>
            <input
              type="search"
              placeholder={t('historySearchPlaceholder')}
              value={filters.query}
              onInput={(event) => updateFilter('query', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>{t('historyVerdictFilter')}</span>
            <select value={filters.verdict} onChange={(event) => updateFilter('verdict', event.currentTarget.value as HistoryFilters['verdict'])}>
              <option value="all">{t('historyAllVerdicts')}</option>
              <option value="positive">{t('historyPositiveVerdict')}</option>
              <option value="negative">{t('historyNegativeVerdict')}</option>
              <option value="skip">{t('historySkipVerdict')}</option>
              <option value="bad-clip">{t('historyBadClipVerdict')}</option>
            </select>
          </label>
          <label>
            <span>{t('historyRepeatFilter')}</span>
            <select value={filters.repeat} onChange={(event) => updateFilter('repeat', event.currentTarget.value as HistoryFilters['repeat'])}>
              <option value="all">{t('historyAllRepeats')}</option>
              <option value="exact-duplicate">{t('historyExactRepeats')}</option>
            </select>
          </label>
          <label>
            <span>{t('historyDateFrom')}</span>
            <input
              type="date"
              value={filters.dateFrom}
              aria-invalid={invalidDateRange || undefined}
              aria-describedby={invalidDateRange ? dateErrorId : undefined}
              onInput={(event) => updateFilter('dateFrom', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>{t('historyDateTo')}</span>
            <input
              type="date"
              value={filters.dateTo}
              aria-invalid={invalidDateRange || undefined}
              aria-describedby={invalidDateRange ? dateErrorId : undefined}
              onInput={(event) => updateFilter('dateTo', event.currentTarget.value)}
            />
          </label>
        </div>
        {invalidDateRange && <p class={styles.dateError} id={dateErrorId} role="alert">{t('historyInvalidDateRange')}</p>}
        <div class={styles.filterSummary}>
          <p role="status">{t('historyFilterResultCount', [String(filteredEntries.length), String(entries.length)])}</p>
          <button type="button" onClick={() => setFilters({ ...DEFAULT_HISTORY_FILTERS })}>
            {t('historyResetFilters')}
          </button>
        </div>
        <div class={styles.list}>
          {matches.length === 0
            ? <p class={styles.empty}>{t(entries.length === 0 ? 'noClipHistory' : 'historyNoFilterResults')}</p>
            : matches.map((match, index) => (
              <HistoryMatchCard
                key={matchHistoryKey(match)}
                match={match}
                matchNumber={matches.length - index}
              />
            ))}
        </div>
      </section>
    </>
  );
};
