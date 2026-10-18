import { createClipIdentity, type ClipData } from '../entities/clip.entity';
import { SessionPlaybackTracker, type SessionStatistics } from '../features/statistics/session-playback-tracker';

const VIDEO_SELECTOR = '[data-vacnet-review-video], #video_html5_api, video.vjs-tech, video#video';
const MEDIA_EVENTS = ['play', 'playing', 'pause', 'seeking', 'seeked', 'waiting', 'stalled', 'timeupdate', 'ratechange', 'loadeddata', 'loadedmetadata', 'ended', 'emptied'] as const;

export const installSessionPlaybackObserver = ({ document, getClip, onUpdate, now = () => performance.now() }: {
  document: Document;
  getClip: () => ClipData | null;
  onUpdate: (stats: SessionStatistics) => void;
  now?: () => number;
}): (() => void) => {
  const tracker = new SessionPlaybackTracker();
  const view = document.defaultView!;
  let previousVideo: HTMLVideoElement | null = null;
  let generation = 0;
  let disposed = false;
  let publishedSeconds = -1;
  const sample = (): void => {
    if (disposed) return;
    const video = document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
    const clip = getClip();
    if (video !== previousVideo) { generation += 1; previousVideo = video; }
    tracker.observe({
      clipIdentity: video && clip ? `${createClipIdentity(clip).identity}\u0000${generation}\u0000${video.currentSrc}` : null,
      currentTime: video?.currentTime ?? 0,
      playbackRate: video?.playbackRate ?? 1,
      paused: video?.paused ?? true,
      seeking: video?.seeking ?? false,
      readyState: video?.readyState ?? 0,
      ended: video?.ended ?? false,
    }, now());
    const stats = tracker.stats;
    if (stats.watchedSeconds !== publishedSeconds) {
      publishedSeconds = stats.watchedSeconds;
      onUpdate(stats);
    }
  };
  for (const event of MEDIA_EVENTS) document.addEventListener(event, sample, true);
  const interval = view.setInterval(sample, 250);
  sample();
  return () => {
    if (disposed) return;
    sample();
    disposed = true;
    view.clearInterval(interval);
    for (const event of MEDIA_EVENTS) document.removeEventListener(event, sample, true);
  };
};
