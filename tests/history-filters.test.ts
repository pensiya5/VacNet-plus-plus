import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { emptyHistory, historyKey, type ClipHistoryEntry } from '../src/entities/history.entity';
import { emptyVerdicts } from '../src/entities/verdict.entity';
import { DashboardHistory } from '../src/features/history/components/DashboardHistory';
import { TranslationProvider } from '../src/shared/components/TranslationProvider';
import { createCatalog, getMessage } from '../src/shared/services/i18n.service';

let root: HTMLElement;
const entry = (taskId: string, patch: Partial<ClipHistoryEntry> = {}): ClipHistoryEntry => ({
  ...emptyVerdicts(), identityVersion: 2, clipKey: `clip:${taskId}`, taskId,
  sourceWebmUrl: 'https://replay-video.valve.net/private.webm?token=secret-token',
  videoId: `video-${taskId}`, range: { start: 0, end: 10 }, eventTime: 3,
  reviewType: 'cheating', clipCount: '1', app: '730', matchTimestamp: null,
  webmDuration: 10, timestamp: new Date(2026, 9, 18, 12).getTime(),
  deduplication: 'new-match', badClip: false, verdictTick: null, cheating: 'positive', ...patch,
});
const mount = async (entries: ClipHistoryEntry[]) => {
  const history = { ...emptyHistory(), entries: Object.fromEntries(entries.map((item) => [historyKey(item), item])) };
  await act(async () => render(h(TranslationProvider, {
    catalog: createCatalog(), children: h(DashboardHistory, { totalClipsViewed: 50, history }),
  }), root));
};
const control = <T extends HTMLInputElement | HTMLSelectElement>(name: string): T => {
  const label = [...root.querySelectorAll('label')].find((item) => item.textContent?.includes(name));
  const input = label?.querySelector<T>('input, select');
  expect(input, `Accessible control: ${name}`).toBeTruthy();
  return input!;
};
const change = async (input: HTMLInputElement | HTMLSelectElement, value: string) => {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};
const tasks = () => [...root.querySelectorAll('li')].map((item) => item.textContent ?? '');
const hasTask = (taskId: string) => tasks().some((text) => text.includes(`${getMessage('taskId')}: ${taskId}`));

beforeEach(() => { root = document.createElement('div'); document.body.append(root); });
afterEach(() => { render(null, root); root.remove(); });

it('searches task and video IDs case-insensitively without matching private URL tokens', async () => {
  await mount([entry('TASK-A'), entry('TASK-B', { videoId: 'REPLAY-Z' })]);
  const search = root.querySelector<HTMLInputElement>('input[type=search]');
  expect(search).toBeTruthy();
  expect(search!.labels?.length).toBe(1);
  await change(search!, '  task-a  ');
  expect(hasTask('TASK-A')).toBe(true);
  expect(hasTask('TASK-B')).toBe(false);
  await change(search!, 'replay-z');
  expect(hasTask('TASK-B')).toBe(true);
  expect(hasTask('TASK-A')).toBe(false);
  await change(search!, 'secret-token');
  expect(tasks()).toHaveLength(0);
  expect(root.textContent).toContain(getMessage('historyNoFilterResults'));
  expect(root.querySelector('option')?.textContent).not.toContain('secret-token');
});

it('matches any legacy category, only cheating for native reviews, and isolates bad clips', async () => {
  await mount([
    entry('native-positive'), entry('native-negative', { cheating: 'negative' }),
    entry('native-uncertain', { cheating: 'skip' }),
    entry('legacy-wallhack', { reviewType: 'legacy', wallhack: 'positive', cheating: undefined }),
    entry('legacy-negative', { reviewType: 'legacy', aimassist: 'negative', cheating: 'positive' }),
    entry('bad', { badClip: true, cheating: 'positive' }),
  ]);
  const verdict = control<HTMLSelectElement>(getMessage('historyVerdictFilter'));
  await change(verdict, 'positive');
  expect(tasks()).toHaveLength(2);
  expect(hasTask('native-positive')).toBe(true);
  expect(hasTask('legacy-wallhack')).toBe(true);
  await change(verdict, 'negative');
  expect(tasks()).toHaveLength(2);
  expect(hasTask('native-negative')).toBe(true);
  expect(hasTask('legacy-negative')).toBe(true);
  await change(verdict, 'skip');
  expect(hasTask('native-positive')).toBe(false);
  expect(hasTask('native-negative')).toBe(false);
  expect(hasTask('native-uncertain')).toBe(true);
  expect(hasTask('bad')).toBe(false);
  await change(verdict, 'bad-clip');
  expect(tasks()).toHaveLength(1);
  expect(hasTask('bad')).toBe(true);
});

it('combines search, verdict, repeat and inclusive local calendar dates before grouping', async () => {
  const start = new Date(2026, 9, 18).getTime();
  const end = new Date(2026, 9, 19).getTime();
  await mount([
    entry('find-start', { timestamp: start, deduplication: 'exact-duplicate', matchTimestamp: 42 }),
    entry('find-end', { timestamp: end - 1, deduplication: 'exact-duplicate', matchTimestamp: 42 }),
    entry('find-before', { timestamp: start - 1, deduplication: 'exact-duplicate' }),
    entry('find-after', { timestamp: end, deduplication: 'exact-duplicate' }),
    entry('find-new', { deduplication: 'new-clip' }),
    entry('find-negative', { cheating: 'negative', deduplication: 'exact-duplicate' }),
    entry('other-repeat', { deduplication: 'exact-duplicate' }),
  ]);
  await change(root.querySelector<HTMLInputElement>('input[type=search]')!, 'find');
  await change(control(getMessage('historyVerdictFilter')), 'positive');
  await change(control(getMessage('historyRepeatFilter')), 'exact-duplicate');
  await change(control(getMessage('historyDateFrom')), '2026-10-18');
  await change(control(getMessage('historyDateTo')), '2026-10-18');
  expect(tasks()).toHaveLength(2);
  expect(hasTask('find-start')).toBe(true);
  expect(hasTask('find-end')).toBe(true);
  expect(root.querySelectorAll('details')).toHaveLength(1);
  expect(root.querySelector('[role=status]')?.textContent).toBe(getMessage('historyFilterResultCount', ['2', '7']));
});

it('marks reversed dates invalid and reset restores all results and all controls', async () => {
  await mount([entry('first'), entry('second')]);
  await change(root.querySelector<HTMLInputElement>('input[type=search]')!, 'first');
  await change(control(getMessage('historyVerdictFilter')), 'negative');
  await change(control(getMessage('historyRepeatFilter')), 'exact-duplicate');
  const from = control<HTMLInputElement>(getMessage('historyDateFrom'));
  const to = control<HTMLInputElement>(getMessage('historyDateTo'));
  await change(from, '2026-10-19');
  await change(to, '2026-10-18');
  expect(tasks()).toHaveLength(0);
  expect(from.getAttribute('aria-invalid')).toBe('true');
  expect(to.getAttribute('aria-invalid')).toBe('true');
  expect(root.querySelector('[role=alert]')?.textContent).toBe(getMessage('historyInvalidDateRange'));
  const reset = [...root.querySelectorAll('button')].find((item) => item.textContent === getMessage('historyResetFilters'))!;
  expect(reset.type).toBe('button');
  await act(async () => reset.click());
  expect(tasks()).toHaveLength(2);
  expect(from.value).toBe('');
  expect(to.value).toBe('');
  expect(from.getAttribute('aria-invalid')).not.toBe('true');
  expect(control<HTMLSelectElement>(getMessage('historyVerdictFilter')).value).toBe('all');
  expect(control<HTMLSelectElement>(getMessage('historyRepeatFilter')).value).toBe('all');
  expect(root.querySelector<HTMLInputElement>('input[type=search]')!.value).toBe('');
});

it('supports either date bound independently using local days', async () => {
  await mount([
    entry('before', { timestamp: new Date(2026, 9, 17, 23, 59, 59, 999).getTime() }),
    entry('inside', { timestamp: new Date(2026, 9, 18, 23, 59, 59, 999).getTime() }),
    entry('after', { timestamp: new Date(2026, 9, 19).getTime() }),
  ]);
  const from = control<HTMLInputElement>(getMessage('historyDateFrom'));
  const to = control<HTMLInputElement>(getMessage('historyDateTo'));
  await change(from, '2026-10-18');
  expect(tasks()).toHaveLength(2);
  expect(hasTask('before')).toBe(false);
  await change(from, '');
  await change(to, '2026-10-18');
  expect(tasks()).toHaveLength(2);
  expect(hasTask('after')).toBe(false);
  expect(hasTask('inside')).toBe(true);
});

it('distinguishes an empty history from an empty filtered result and updates when history changes', async () => {
  await mount([]);
  expect(root.textContent).toContain(getMessage('noClipHistory'));
  expect(root.textContent).not.toContain(getMessage('historyNoFilterResults'));
  await mount([entry('new-task')]);
  expect(hasTask('new-task')).toBe(true);
  await change(root.querySelector<HTMLInputElement>('input[type=search]')!, 'missing');
  expect(root.textContent).toContain(getMessage('historyNoFilterResults'));
  expect(root.textContent).not.toContain(getMessage('noClipHistory'));
});
