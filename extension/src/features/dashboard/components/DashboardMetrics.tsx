import { createClipIdentity } from '../../../entities/clip.entity';
import type { PageSnapshot } from '../../../entities/clip.entity';
import { MetricSection } from '../../../shared/components/MetricSection';
import { formatClipRange, formatMatchDate, formatVideoTime } from '../../../shared/utils/formatters.utils';
import { useTranslation } from '../../../shared/components/TranslationProvider';

const describeDeduplication = (
  status: PageSnapshot['deduplication'],
  t: ReturnType<typeof useTranslation>,
): string => {
  if (status === null) return t('clipSummaryChecking');
  if (status === 'exact-duplicate') return t('clipStatusExactDuplicate');
  if (status === 'new-clip') return t('clipStatusNewClip');
  return t('clipStatusNewMatch');
};

export const DashboardMetrics = ({ snapshot }: { snapshot: PageSnapshot }) => {
  const t = useTranslation();
  const nativeReview = snapshot.clip?.reviewType === 'cheating';
  const controls = nativeReview ? snapshot.reviewControls : null;
  const answer = snapshot.verdicts.cheating;
  const selectedAnswer = answer === 'positive' ? t('cheatingYes')
    : answer === 'negative' ? t('cheatingNo')
    : answer === 'skip' ? t('btnUncertain') : t('metricsNoVerdict');
  const availability = (available: boolean | undefined): string => available === undefined ? '—'
    : t(available ? 'metricsAvailable' : 'metricsUnavailable');
  const phase = !snapshot.clip ? t('statusLoadingNextClip')
    : snapshot.submitting ? t('statusSubmitting')
    : nativeReview && !controls ? '—'
    : controls?.confirming ? t(controls.confirmAvailable ? 'metricsReadyToConfirm' : 'metricsAwaitingConfirmation')
    : t('metricsAwaitingChoice');
  return (
    <>
      <MetricSection title={t('clipDataTitle')} entries={[
         { key: 'task-id', label: t('taskId'), value: snapshot.clip?.taskId ?? t('statusLoadingNextClip') },
         { key: 'webm-url', label: t('webmUrl'), value: snapshot.clip?.sourceWebmUrl ?? t('statusLoadingNextClip'), href: snapshot.clip?.sourceWebmUrl ?? null },
         { key: 'video-id', label: t('videoId'), value: snapshot.clip?.videoId ?? t('statusLoadingNextClip') },
         { key: 'app', label: t('app'), value: snapshot.clip?.app ?? t('statusLoadingNextClip') },
         { key: 'review-type', label: t('metricsReviewType'), value: snapshot.clip
           ? t(nativeReview ? 'metricsReviewTypeNative' : 'metricsReviewTypeLegacy') : '—' },
         { key: 'clip-format', label: t('metricsClipFormat'), value: snapshot.clip
           ? t(snapshot.clip.eventTime === -1 ? 'metricsFullMatch' : 'metricsMarkedMoment') : '—' },
          { key: 'clip-range', label: t('clipRange'), value: snapshot.clip ? formatClipRange(snapshot.clip.range.start, snapshot.clip.range.end, t) : t('statusLoadingNextClip') },
          { key: 'event-time', label: t('eventTime'), value: snapshot.clip ? (snapshot.clip.eventTime >= 0 ? t('timeSeconds', snapshot.clip.eventTime.toFixed(3)) : t('none')) : t('statusLoadingNextClip') },
          { key: 'match-timestamp', label: t('matchDate'), value: snapshot.clip ? formatMatchDate(snapshot.clip.matchTimestamp, t) : t('statusLoadingNextClip') },
         { key: 'clip-key', label: t('clipKey'), value: snapshot.clip ? createClipIdentity(snapshot.clip).clipKey : t('statusLoadingNextClip') },
         { key: 'identity-status', label: t('clipIdentityStatus'), value: describeDeduplication(snapshot.deduplication, t) },
      ]} />
      <MetricSection title={t('metricsReviewTitle')} entries={[
        { key: 'review-phase', label: t('metricsReviewPhase'), value: phase },
        ...(nativeReview ? [
          { key: 'selected-verdict', label: t('metricsSelectedVerdict'), value: selectedAnswer },
          { key: 'decision-tick', label: t('verdictTick'), value: controls?.decisionTick == null ? '—' : String(controls.decisionTick) },
          { key: 'decision-time', label: t('verdictDecisionTime'), value: formatVideoTime(controls?.decisionTime ?? null) },
          { key: 'positive-available', label: t('metricsPositiveAvailable'), value: availability(controls?.positiveAvailable) },
          { key: 'skip-available', label: t('metricsSkipAvailable'), value: availability(controls?.skipAvailable) },
          { key: 'negative-available', label: t('metricsNegativeAvailable'), value: availability(controls?.negativeAvailable) },
          { key: 'confirm-available', label: t('metricsConfirmAvailable'), value: availability(controls?.confirmAvailable) },
        ] : []),
        { key: 'submission-state', label: t('metricsSubmitting'),
          value: snapshot.submitting ? t('statusSubmitting') : t('metricsNotSubmitting') },
      ]} />
      <MetricSection title={t('plyrRuntime')} entries={[
         { key: 'player-id', label: t('playerId'), value: snapshot.player?.id ?? t('notFound') },
         { key: 'player-version', label: t('version'), value: snapshot.player?.version ?? t('notFound') },
         { key: 'player-language', label: t('language'), value: snapshot.player?.language ?? t('notFound') },
         { key: 'debug', label: t('debug'), value: snapshot.player ? (snapshot.player.debugEnabled ? t('enabled') : t('disabled')) : t('notFound') },
      ]} />
    </>
  );
};
