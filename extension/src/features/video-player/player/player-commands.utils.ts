export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export const calculateEventTargetTime = (eventTime: number, rangeStart: number): number =>
  Math.max(rangeStart, eventTime - 2);

export const calculatePlaybackRate = (currentRate: number, direction: -1 | 1): number => {
  if (direction === 1) return PLAYBACK_RATES.find((rate) => rate > currentRate) ?? 4;
  return [...PLAYBACK_RATES].reverse().find((rate) => rate < currentRate) ?? 0.25;
};
