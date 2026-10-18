export interface SessionStatistics {
  startedAt: number;
  watchedSeconds: number;
}

export interface PlaybackObservation {
  clipIdentity: string | null;
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  seeking: boolean;
  readyState: number;
  ended: boolean;
}

export class SessionPlaybackTracker {
  private previous: { observation: PlaybackObservation; atMs: number } | null = null;
  private watchedSeconds = 0;

  constructor(private readonly startedAt = Date.now()) {}

  /** Call on video state events and about every 250 ms, using a monotonic clock. */
  observe(observation: PlaybackObservation, atMs = performance.now()): void {
    if (!Number.isFinite(atMs) || (this.previous && atMs < this.previous.atMs)) return;
    const previous = this.previous;
    this.previous = { observation: { ...observation }, atMs };
    if (!previous) return;

    const before = previous.observation;
    const elapsed = (atMs - previous.atMs) / 1_000;
    // A long gap cannot establish whether the video kept playing between samples.
    if (elapsed <= 0 || elapsed > 2 || !before.clipIdentity || before.clipIdentity !== observation.clipIdentity) return;
    if (before.paused || before.ended || before.seeking || observation.seeking) return;
    if (before.readyState < 3 || observation.readyState < 3) return;
    if (!Number.isFinite(before.currentTime) || !Number.isFinite(observation.currentTime)) return;
    if (!Number.isFinite(before.playbackRate) || before.playbackRate <= 0 || before.playbackRate !== observation.playbackRate) return;

    const progress = observation.currentTime - before.currentTime;
    const expectedProgress = elapsed * before.playbackRate;
    // Media clocks can be rounded. Larger jumps are seeks, not watched footage.
    if (progress <= 0 || progress > expectedProgress + Math.max(0.1, expectedProgress * 0.15)) return;
    this.watchedSeconds += Math.min(elapsed, progress / before.playbackRate);
  }

  get stats(): SessionStatistics {
    return { startedAt: this.startedAt, watchedSeconds: this.watchedSeconds };
  }
}
