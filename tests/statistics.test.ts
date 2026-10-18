import { describe, expect, it } from 'vitest';
import { emptyHistory, type ClipHistoryEntry } from '../src/entities/history.entity';
import { emptyVerdicts } from '../src/entities/verdict.entity';
import { aggregateHistoryStatistics } from '../src/features/statistics/statistics.utils';
import { SessionPlaybackTracker, type PlaybackObservation } from '../src/features/statistics/session-playback-tracker';

const today = new Date(2026, 9, 18, 12).getTime();
const entry = (overrides: Partial<ClipHistoryEntry> = {}): ClipHistoryEntry => ({
  ...emptyVerdicts(), taskId: 'task', videoId: 'video', sourceWebmUrl: 'https://example.com/video.webm',
  range: { start: 0, end: 60 }, eventTime: 10, reviewType: 'cheating',
  clipCount: null, app: '730', matchTimestamp: null, webmDuration: null, verdictTick: null,
  identityVersion: 2, clipKey: 'video:video|start:0|end:60000',
  timestamp: today, badClip: false, deduplication: 'new-clip', ...overrides,
});
const observation = (overrides: Partial<PlaybackObservation> = {}): PlaybackObservation => ({
  clipIdentity: 'task:video:0:60', currentTime: 0, playbackRate: 1,
  paused: false, seeking: false, readyState: 4, ended: false, ...overrides,
});

describe('today statistics', () => {
  it('uses the local save date including midnight and excluding adjacent days', () => {
    const history = emptyHistory();
    history.entries = {
      before: entry({ timestamp: new Date(2026, 9, 17, 23, 59, 59, 999).getTime() }),
      midnight: entry({ timestamp: new Date(2026, 9, 18).getTime(), cheating: 'positive' }),
      last: entry({ timestamp: new Date(2026, 9, 18, 23, 59, 59, 999).getTime(), cheating: 'negative' }),
      after: entry({ timestamp: new Date(2026, 9, 19).getTime() }),
    };
    expect(aggregateHistoryStatistics(history, today)).toMatchObject({
      total: 2, nativeCount: 2, legacyCount: 0,
      nativeAnswers: { positive: 1, skip: 0, negative: 1, missing: 0 },
    });
  });

  it('counts bad clips separately, excludes their answers, and preserves missing native answers', () => {
    const history = emptyHistory();
    history.entries = {
      yes: entry({ cheating: 'positive' }), uncertain: entry({ cheating: 'skip' }),
      no: entry({ cheating: 'negative' }), missing: entry(),
      bad: entry({ cheating: 'positive', badClip: true }),
      legacyBad: entry({ reviewType: 'legacy', aimassist: 'positive', badClip: true }),
    };
    expect(aggregateHistoryStatistics(history, today)).toMatchObject({
      total: 6, nativeCount: 5, legacyCount: 1, badClips: 2,
      nativeAnswers: { positive: 1, skip: 1, negative: 1, missing: 1 },
      legacyAnswers: { aimassist: { positive: 0, skip: 0, negative: 0 } },
    });
  });

  it('keeps all four legacy category distributions independent of the native answer', () => {
    const history = emptyHistory();
    history.entries = {
      one: entry({ reviewType: 'legacy', aimassist: 'positive', wallhack: 'negative', autobhop: 'skip', bot: 'negative', cheating: 'positive' }),
      two: entry({ reviewType: 'legacy', aimassist: 'skip', wallhack: 'positive', autobhop: 'negative', bot: 'positive' }),
    };
    expect(aggregateHistoryStatistics(history, today)).toMatchObject({
      nativeCount: 0, legacyCount: 2,
      nativeAnswers: { positive: 0, skip: 0, negative: 0, missing: 0 },
      legacyAnswers: {
        aimassist: { positive: 1, skip: 1, negative: 0 },
        wallhack: { positive: 1, skip: 0, negative: 1 },
        autobhop: { positive: 0, skip: 1, negative: 1 },
        bot: { positive: 1, skip: 0, negative: 1 },
      },
    });
  });

  it('counts only saved exact repeats today rather than the lifetime repeat counter', () => {
    const history = emptyHistory();
    history.stats.repeats = 700;
    history.entries = {
      today: entry({ deduplication: 'exact-duplicate' }),
      yesterday: entry({ timestamp: new Date(2026, 9, 17, 12).getTime(), deduplication: 'exact-duplicate' }),
      other: entry({ deduplication: 'new-clip' }),
    };
    expect(aggregateHistoryStatistics(history, today).repeats).toBe(1);
    expect(aggregateHistoryStatistics(emptyHistory(), today).total).toBe(0);
  });
});

describe('session playback time', () => {
  it('starts empty and adds playing wall time instead of video duration or media seconds', () => {
    const tracker = new SessionPlaybackTracker(today);
    expect(tracker.stats).toEqual({ startedAt: today, watchedSeconds: 0 });
    tracker.observe(observation({ playbackRate: 2 }), 0);
    tracker.observe(observation({ currentTime: 2, playbackRate: 2 }), 1_000);
    tracker.observe(observation({ currentTime: 4, playbackRate: 2 }), 2_000);
    expect(tracker.stats.watchedSeconds).toBe(2);
  });

  it('counts slow playback and partial progress while excluding stalled time', () => {
    const tracker = new SessionPlaybackTracker(today);
    tracker.observe(observation({ playbackRate: 0.5 }), 0);
    tracker.observe(observation({ currentTime: 0.5, playbackRate: 0.5 }), 1_000);
    tracker.observe(observation({ currentTime: 0.5, playbackRate: 0.5 }), 2_000);
    tracker.observe(observation({ currentTime: 0.75, playbackRate: 0.5 }), 3_000);
    expect(tracker.stats.watchedSeconds).toBe(1.5);
  });

  it('never counts pauses, seeking or low readiness as playing time', () => {
    const tracker = new SessionPlaybackTracker(today);
    tracker.observe(observation({ paused: true }), 0);
    tracker.observe(observation({ paused: true }), 1_000);
    tracker.observe(observation(), 2_000);
    tracker.observe(observation({ currentTime: 1 }), 3_000);
    tracker.observe(observation({ currentTime: 10, seeking: true }), 4_000);
    tracker.observe(observation({ currentTime: 10 }), 5_000);
    tracker.observe(observation({ currentTime: 11, readyState: 2 }), 6_000);
    tracker.observe(observation({ currentTime: 11 }), 7_000);
    tracker.observe(observation({ currentTime: 12 }), 8_000);
    expect(tracker.stats.watchedSeconds).toBe(2);
  });

  it('rejects forward jumps, backward seeks, clip changes and large observation gaps', () => {
    const tracker = new SessionPlaybackTracker(today);
    tracker.observe(observation(), 0);
    tracker.observe(observation({ currentTime: 40 }), 1_000);
    tracker.observe(observation({ currentTime: 5 }), 2_000);
    tracker.observe(observation({ currentTime: 6, clipIdentity: 'other' }), 3_000);
    tracker.observe(observation({ currentTime: 36, clipIdentity: 'other' }), 33_000);
    tracker.observe(observation({ currentTime: 37, clipIdentity: 'other' }), 34_000);
    expect(tracker.stats.watchedSeconds).toBe(1);
  });

  it('does not count stale duplicate observations twice or use reversed clocks', () => {
    const tracker = new SessionPlaybackTracker(today);
    tracker.observe(observation(), 0);
    tracker.observe(observation({ currentTime: 1 }), 1_000);
    tracker.observe(observation({ currentTime: 1 }), 1_000);
    tracker.observe(observation({ currentTime: 0.5 }), 500);
    tracker.observe(observation({ currentTime: 2 }), 2_000);
    expect(tracker.stats.watchedSeconds).toBe(2);
  });

  it('resets the baseline when playback speed changes and counts the new speed', () => {
    const tracker = new SessionPlaybackTracker(today);
    tracker.observe(observation(), 0);
    tracker.observe(observation({ currentTime: 1 }), 1_000);
    tracker.observe(observation({ currentTime: 1, playbackRate: 4 }), 1_000);
    tracker.observe(observation({ currentTime: 5, playbackRate: 4 }), 2_000);
    expect(tracker.stats.watchedSeconds).toBe(2);
  });

  it('does not attribute playback to a missing clip or invalid media state', () => {
    const tracker = new SessionPlaybackTracker(today);
    tracker.observe(observation({ clipIdentity: null }), 0);
    tracker.observe(observation({ clipIdentity: null, currentTime: 1 }), 1_000);
    tracker.observe(observation({ currentTime: Number.NaN }), 2_000);
    tracker.observe(observation({ currentTime: 3 }), 3_000);
    tracker.observe(observation({ currentTime: 4, playbackRate: 0 }), 4_000);
    tracker.observe(observation({ currentTime: 5, ended: true }), 5_000);
    expect(tracker.stats.watchedSeconds).toBe(0);
  });
});
