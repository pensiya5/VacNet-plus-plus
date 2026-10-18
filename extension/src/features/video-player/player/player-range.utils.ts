import type { ClipRange } from '../../../entities/clip.entity';

const SHORT_CLIP_THRESHOLD_SECONDS = 60;
const OPEN_ENDED_RANGE = 999_999;

export const normalizeReviewRange = ({ start, end }: ClipRange): ClipRange => ({
  start: start < 1 ? 0 : start,
  end: end - start <= SHORT_CLIP_THRESHOLD_SECONDS ? OPEN_ENDED_RANGE : end,
});
