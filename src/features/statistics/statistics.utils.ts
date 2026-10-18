import type { HistoryState } from '../../entities/history.entity';
import { verdictNames, type VerdictValue } from '../../entities/verdict.entity';

export type AnswerDistribution = Record<VerdictValue, number>;
export type LegacyCategory = typeof verdictNames[number];
export interface TodayStatistics {
  total: number;
  nativeCount: number;
  legacyCount: number;
  badClips: number;
  repeats: number;
  nativeAnswers: AnswerDistribution & { missing: number };
  legacyAnswers: Record<LegacyCategory, AnswerDistribution>;
}

export const aggregateHistoryStatistics = (history: HistoryState, now: number = Date.now()): TodayStatistics => {
  const result: TodayStatistics = {
    total: 0, nativeCount: 0, legacyCount: 0, badClips: 0, repeats: 0,
    nativeAnswers: { positive: 0, skip: 0, negative: 0, missing: 0 },
    legacyAnswers: {
      aimassist: { positive: 0, skip: 0, negative: 0 },
      wallhack: { positive: 0, skip: 0, negative: 0 },
      autobhop: { positive: 0, skip: 0, negative: 0 },
      bot: { positive: 0, skip: 0, negative: 0 },
    },
  };
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  // Calendar arithmetic also handles local days that cross a DST change.
  end.setDate(end.getDate() + 1);

  for (const entry of Object.values(history.entries)) {
    if (entry.timestamp < start.getTime() || entry.timestamp >= end.getTime()) continue;
    result.total += 1;
    if (entry.reviewType === 'cheating') result.nativeCount += 1;
    else result.legacyCount += 1;
    if (entry.deduplication === 'exact-duplicate') result.repeats += 1;
    if (entry.badClip) {
      result.badClips += 1;
      continue;
    }
    if (entry.reviewType === 'cheating') {
      if (entry.cheating) result.nativeAnswers[entry.cheating] += 1;
      else result.nativeAnswers.missing += 1;
    } else {
      for (const category of verdictNames) result.legacyAnswers[category][entry[category]] += 1;
    }
  }
  return result;
};
