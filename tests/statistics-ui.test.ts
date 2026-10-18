import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { emptyHistory, type ClipHistoryEntry, type HistoryState } from '../src/entities/history.entity';
import { emptyVerdicts } from '../src/entities/verdict.entity';
import { DashboardStatistics } from '../src/features/statistics/components/DashboardStatistics';
import { TranslationProvider } from '../src/shared/components/TranslationProvider';
import { createCatalog } from '../src/shared/services/i18n.service';

let root: HTMLElement;
const today = new Date(2026, 9, 18, 12).getTime();
const saved = (overrides: Partial<ClipHistoryEntry>): ClipHistoryEntry => ({
  ...emptyVerdicts(), taskId: 'task', videoId: 'video', sourceWebmUrl: 'https://example.com/video.webm',
  range: { start: 0, end: 60 }, eventTime: 10, reviewType: 'cheating',
  clipCount: null, app: '730', matchTimestamp: null, webmDuration: null, verdictTick: null,
  identityVersion: 2, clipKey: 'video:video|start:0|end:60000',
  timestamp: today, badClip: false, deduplication: 'new-clip', ...overrides,
});
const mount = (history: HistoryState = emptyHistory(), watchedSeconds = 0) => act(() => render(h(TranslationProvider, {
  catalog: createCatalog(),
  children: h(DashboardStatistics, { history, session: { startedAt: today, watchedSeconds } }),
}), root));
const sectionValue = (title: string, label: string): string | null | undefined => {
  const section = [...root.querySelectorAll('section')].find((item) => item.querySelector('h3')?.textContent === title);
  return section && [...section.querySelectorAll('dl > div')]
    .find((row) => row.querySelector('dt')?.textContent === label)?.querySelector('dd')?.textContent;
};

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(today);
  root = document.createElement('div'); document.body.append(root);
});
afterEach(() => { render(null, root); root.remove(); vi.useRealTimers(); });

it('shows session playback in hours, minutes and seconds and explains local-history limits', () => {
  mount(emptyHistory(), 3661.9);
  const catalog = createCatalog();
  expect(sectionValue(catalog.statisticsSession, catalog.statisticsWatchedTime)).toBe('1 ч 1 мин 1 с');
  expect(root.textContent).toContain(catalog.statisticsHistoryNote.replace('{limit}', '1000'));
  expect(root.textContent).toContain(catalog.statisticsSessionNote);
  mount();
  expect(sectionValue(catalog.statisticsSession, catalog.statisticsWatchedTime)).toBe('0 с');
});

it('shows today native answer counts and bad clips without turning missing data into uncertainty', () => {
  const history = emptyHistory();
  history.entries = {
    yes: saved({ cheating: 'positive' }), bad: saved({ cheating: 'positive', badClip: true }),
    missing: saved({}), skip: saved({ cheating: 'skip', deduplication: 'exact-duplicate' }),
  };
  mount(history);
  const catalog = createCatalog();
  expect(sectionValue(catalog.statisticsToday, catalog.statisticsSavedToday)).toBe('4');
  expect(sectionValue(catalog.statisticsToday, catalog.statisticsBadClips)).toBe('1');
  expect(sectionValue(catalog.statisticsToday, catalog.statisticsRepeats)).toBe('1');
  expect(sectionValue(catalog.statisticsNativeAnswers, catalog.cheatingYes)).toBe('1');
  expect(sectionValue(catalog.statisticsNativeAnswers, catalog.btnUncertain)).toBe('1');
  expect(sectionValue(catalog.statisticsNativeAnswers, catalog.cheatingNo)).toBe('0');
  expect(sectionValue(catalog.statisticsNativeAnswers, catalog.metricsNoVerdict)).toBe('1');
});

it('renders independent labelled legacy category rows and updates them when history changes', () => {
  const history = emptyHistory();
  history.entries = { legacy: saved({ reviewType: 'legacy', aimassist: 'positive', wallhack: 'negative', autobhop: 'skip', bot: 'positive' }) };
  mount(history);
  const catalog = createCatalog();
  const rows = [...root.querySelectorAll('tbody tr')];
  expect(rows.map((row) => row.querySelector('th')?.textContent)).toEqual([
    catalog.labelAimAssist, catalog.labelWallHack, catalog.labelAutoBhop, catalog.labelBot,
  ]);
  expect(rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent))).toEqual([
    ['1', '0', '0'], ['0', '0', '1'], ['0', '1', '0'], ['1', '0', '0'],
  ]);
  history.entries = {};
  mount(history);
  expect([...root.querySelectorAll('tbody td')].every((cell) => cell.textContent === '0')).toBe(true);
});

it('refreshes the local day at midnight even when playback and history stay unchanged', () => {
  const history = emptyHistory();
  history.entries = { saved: saved({ cheating: 'positive' }) };
  vi.setSystemTime(new Date(2026, 9, 18, 23, 59, 59, 900));
  mount(history);
  const catalog = createCatalog();
  expect(sectionValue(catalog.statisticsToday, catalog.statisticsSavedToday)).toBe('1');
  act(() => { vi.advanceTimersByTime(101); });
  expect(sectionValue(catalog.statisticsToday, catalog.statisticsSavedToday)).toBe('0');
});
