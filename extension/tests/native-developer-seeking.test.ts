import { afterEach, expect, it, vi } from 'vitest';
import type { ClipData } from '../src/entities/clip.entity';
import html from './fixtures/review-page.html?raw';
import { installNativeDeveloperSeeking } from '../src/features/valve-interop/native-developer-seeking.service';

const clip: ClipData = {
  taskId: 'test-task', sourceWebmUrl: 'https://replay-video.valve.net/test.webm', videoId: 'test',
  reviewType: 'cheating', eventTime: -1, range: { start: 0, end: 70 }, app: 'cs2',
  clipCount: null, matchTimestamp: null, webmDuration: 90,
};
let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.(); cleanup = null;
  vi.useRealTimers();
});

it('does not replay the end event 250ms after playback starts during verdict confirmation', async () => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = html;
  const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
  document.querySelector('.verdict-column')!.classList.add('confirming');
  document.querySelectorAll<HTMLInputElement>('input[name="cheating"]').forEach((input) => { input.disabled = true; });
  const pauseFromEnd = vi.fn();
  video.addEventListener('ended', pauseFromEnd);
  cleanup = installNativeDeveloperSeeking(clip);

  video.dispatchEvent(new Event('play'));
  await vi.advanceTimersByTimeAsync(250);

  expect(pauseFromEnd).not.toHaveBeenCalled();
});
