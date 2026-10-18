import { useEffect, useState } from 'preact/hooks';
import { HISTORY_LIMIT, type HistoryState } from '../../../entities/history.entity';
import { verdictNames } from '../../../entities/verdict.entity';
import { MetricSection } from '../../../shared/components/MetricSection';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import type { Translate } from '../../../shared/services/i18n.service';
import type { SessionStatistics } from '../session-playback-tracker';
import { aggregateHistoryStatistics } from '../statistics.utils';
import styles from './DashboardStatistics.module.css';

export interface DashboardStatisticsProps {
  history: HistoryState;
  session: SessionStatistics;
}

const formatWatchedTime = (value: number, t: Translate): string => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor(seconds % 3_600 / 60);
  return [
    ...(hours ? [t('statisticsHours', String(hours))] : []),
    ...(minutes ? [t('statisticsMinutes', String(minutes))] : []),
    t('statisticsSeconds', String(seconds % 60)),
  ].join(' ');
};

export const DashboardStatistics = ({ history, session }: DashboardStatisticsProps) => {
  const t = useTranslation();
  const [dayRevision, setDayRevision] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => setDayRevision((revision) => revision + 1), midnight.getTime() - now + 1);
    return () => clearTimeout(timer);
  }, [dayRevision]);
  const today = aggregateHistoryStatistics(history);
  const categoryLabels = {
    aimassist: t('labelAimAssist'), wallhack: t('labelWallHack'),
    autobhop: t('labelAutoBhop'), bot: t('labelBot'),
  };

  return (
    <div class={styles.panel}>
      <MetricSection title={t('statisticsSession')} entries={[
        { label: t('statisticsWatchedTime'), value: formatWatchedTime(session.watchedSeconds, t) },
      ]} />
      <p class={styles.note}>{t('statisticsSessionNote')}</p>
      <MetricSection title={t('statisticsToday')} entries={[
        { label: t('statisticsSavedToday'), value: today.total },
        { label: t('statisticsNativeCount'), value: today.nativeCount },
        { label: t('statisticsLegacyCount'), value: today.legacyCount },
        { label: t('statisticsBadClips'), value: today.badClips },
        { label: t('statisticsRepeats'), value: today.repeats },
      ]} />
      <p class={styles.note}>{t('statisticsHistoryNote', String(HISTORY_LIMIT))}</p>
      <MetricSection title={t('statisticsNativeAnswers')} entries={[
        { label: t('cheatingYes'), value: today.nativeAnswers.positive },
        { label: t('btnUncertain'), value: today.nativeAnswers.skip },
        { label: t('cheatingNo'), value: today.nativeAnswers.negative },
        ...(today.nativeAnswers.missing ? [{ label: t('metricsNoVerdict'), value: today.nativeAnswers.missing }] : []),
      ]} />
      <table class={styles.distribution}>
        <caption>{t('statisticsLegacyAnswers')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('statisticsCategory')}</th>
            <th scope="col">{t('btnYes')}</th>
            <th scope="col">{t('btnUncertain')}</th>
            <th scope="col">{t('btnNo')}</th>
          </tr>
        </thead>
        <tbody>
          {verdictNames.map((name) => (
            <tr key={name}>
              <th scope="row">{categoryLabels[name]}</th>
              <td>{today.legacyAnswers[name].positive}</td>
              <td>{today.legacyAnswers[name].skip}</td>
              <td>{today.legacyAnswers[name].negative}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class={styles.note}>{t('statisticsAnswersNote')}</p>
    </div>
  );
};
