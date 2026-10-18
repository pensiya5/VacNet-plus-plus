import { afterEach, expect, it, vi } from 'vitest';
import { installSessionPlaybackObserver } from '../src/app/session-playback-observer';
import type { ClipData } from '../src/entities/clip.entity';

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

it.each(['tagged', 'native-id'])('tracks replacement %s videos and removes timers and captured media events when disposed', (shape) => {
  vi.useFakeTimers();
  let at = 0;
  let position = 0;
  const createVideo = () => {
    const video = document.createElement('video');
    if (shape === 'tagged') video.dataset.vacnetReviewVideo = '';
    else video.id = 'video';
    for (const [name, value] of Object.entries({ paused: false, seeking: false, ended: false, readyState: 4, playbackRate: 1 })) {
      Object.defineProperty(video, name, { configurable: true, get: () => value });
    }
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => position });
    return video;
  };
  const firstVideo = createVideo();
  document.body.append(firstVideo);
  const clip = { taskId: 'task', videoId: 'video', range: { start: 0, end: 60 }, eventTime: -1 } as ClipData;
  const updates: number[] = [];
  const dispose = installSessionPlaybackObserver({ document, getClip: () => clip, now: () => at,
    onUpdate: (stats) => { updates.push(stats.watchedSeconds); } });
  at = 500; position = 0.5;
  firstVideo.dispatchEvent(new Event('timeupdate'));
  expect(updates.at(-1)).toBe(0.5);
  at = 1_000; position = 30;
  const secondVideo = createVideo();
  firstVideo.replaceWith(secondVideo);
  secondVideo.dispatchEvent(new Event('loadeddata'));
  at = 1_500; position = 30.5;
  secondVideo.dispatchEvent(new Event('timeupdate'));
  expect(updates.at(-1)).toBe(1);
  dispose();
  const count = updates.length;
  at = 2_000; position = 31;
  secondVideo.dispatchEvent(new Event('timeupdate'));
  vi.advanceTimersByTime(500);
  expect(updates).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
});
