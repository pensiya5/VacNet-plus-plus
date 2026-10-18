import type { VideoJsPlayer } from '../video-js.port';
import { type MessageCatalog } from '../../../shared/services/i18n.service';
import { ABORT_ERROR_MESSAGE } from '../../../shared/utils/message-bus-wire.utils';

const LOAD_TIMEOUT_MS = 30_000;

export const createAbortError = (): DOMException => new DOMException(ABORT_ERROR_MESSAGE, 'AbortError');

export class PlayerLifecycle {
  private generation = 0;
  private readonly disposeController = new AbortController();

  get signal(): AbortSignal { return this.disposeController.signal; }
  nextGeneration(): number { return ++this.generation; }
  isCurrent(generation: number): boolean { return generation === this.generation && !this.signal.aborted; }

  dispose(): void {
    this.generation += 1;
    this.disposeController.abort();
  }
}

const waitForVideoData = (
  video: HTMLVideoElement,
  target: number,
  signal: AbortSignal,
  message: string,
  timeoutMessage: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeoutId);
      video.removeEventListener('seeked', complete);
      video.removeEventListener('canplay', complete);
      video.removeEventListener('loadeddata', complete);
      video.removeEventListener('error', fail);
      signal.removeEventListener('abort', abort);
    };
    const complete = (): void => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || Math.abs(video.currentTime - target) > 0.5) return;
      cleanup();
      resolve();
    };
    const fail = (): void => { cleanup(); reject(new Error(message)); };
    const abort = (): void => { cleanup(); reject(createAbortError()); };
    const timeoutId = window.setTimeout(() => { cleanup(); reject(new Error(timeoutMessage)); }, LOAD_TIMEOUT_MS);
    video.addEventListener('seeked', complete);
    video.addEventListener('canplay', complete);
    video.addEventListener('loadeddata', complete);
    video.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    complete();
  });

export const waitForPlyrMetadata = (video: HTMLVideoElement, signal: AbortSignal, catalog: MessageCatalog): Promise<void> =>
  new Promise((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', complete);
      video.removeEventListener('error', fail);
      signal.removeEventListener('abort', abort);
    };
    const complete = (): void => { cleanup(); resolve(); };
    const fail = (): void => { cleanup(); reject(new Error(catalog.errReviewVideoMetadataLoadFailed)); };
    const abort = (): void => { cleanup(); reject(createAbortError()); };
    const timeoutId = window.setTimeout(() => { cleanup(); reject(new Error(catalog.errReviewVideoMetadataTimeout)); }, LOAD_TIMEOUT_MS);
    video.addEventListener('loadedmetadata', complete, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', abort, { once: true });
  });

export const waitForPlyrTargetData = (
  video: HTMLVideoElement,
  target: number,
  signal: AbortSignal,
  catalog: MessageCatalog,
): Promise<void> => waitForVideoData(
  video,
  target,
  signal,
  catalog.errReviewVideoSeekFailed,
  catalog.errVideoOperationTimeout,
);

export const waitForVideoJsMetadata = (
  player: VideoJsPlayer,
  target: number,
  source: string,
  signal: AbortSignal,
  catalog: MessageCatalog,
): Promise<void> => new Promise((resolve, reject) => {
  const cleanup = (): void => {
    window.clearTimeout(timeoutId);
    player.off('loadedmetadata', complete);
    player.off('error', fail);
    signal.removeEventListener('abort', abort);
  };
  const complete = (): void => { cleanup(); player.currentTime(target); resolve(); };
  const fail = (): void => { cleanup(); reject(new Error(catalog.errValveVideoJsSourceLoadFailed)); };
  const abort = (): void => { cleanup(); reject(createAbortError()); };
  const timeoutId = window.setTimeout(() => { cleanup(); reject(new Error(catalog.errValveVideoJsMetadataTimeout)); }, LOAD_TIMEOUT_MS);
  player.on('loadedmetadata', complete);
  player.on('error', fail);
  signal.addEventListener('abort', abort, { once: true });
  player.preload('metadata');
  player.src({ src: source, type: source.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4' });
});

export const waitForVideoJsTargetData = (
  video: HTMLVideoElement,
  target: number,
  signal: AbortSignal,
  catalog: MessageCatalog,
): Promise<void> => waitForVideoData(
  video,
  target,
  signal,
  catalog.errValveVideoElementSeekFailed,
  catalog.errVideoOperationTimeout,
);
