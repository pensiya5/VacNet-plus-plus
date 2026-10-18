import { h, render } from 'preact';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { PageSnapshot } from '../src/entities/clip.entity';
import { emptyVerdicts } from '../src/entities/verdict.entity';
import { DashboardMetrics } from '../src/features/dashboard/components/DashboardMetrics';
import { TranslationProvider } from '../src/shared/components/TranslationProvider';
import { createCatalog } from '../src/shared/services/i18n.service';

let root: HTMLElement;
const snapshot = (): PageSnapshot => ({
  clip: { taskId: 'test-task', sourceWebmUrl: 'https://replay-video.valve.net/test.webm',
    videoId: 'test', range: { start: 0, end: 420 }, eventTime: -1, reviewType: 'cheating',
    clipCount: '42', app: '730', matchTimestamp: null, webmDuration: 420 },
  deduplication: 'new-match', player: null, hasVideo: true, submitting: false, error: null,
  verdicts: { ...emptyVerdicts(), cheating: 'positive' }, previousVerdicts: null,
  reviewControls: { positiveAvailable: true, skipAvailable: false, negativeAvailable: false,
    confirming: true, confirmAvailable: false, decisionTick: 0, decisionTime: 0 },
});
const mount = (state: PageSnapshot) => render(h(TranslationProvider, {
  catalog: createCatalog(), children: h(DashboardMetrics, { snapshot: state }),
}), root);
const value = (label: string) => [...root.querySelectorAll('dl > div')]
  .find((row) => row.querySelector('dt')?.textContent === label)?.querySelector('dd')?.textContent;

beforeEach(() => { root = document.createElement('div'); document.body.append(root); });
afterEach(() => { render(null, root); root.remove(); });

it('shows new review format, exact decision tick and answer availability, including zero time and tick', () => {
  mount(snapshot());
  expect(value('Тип проверки')).toBe('Один вердикт');
  expect(value('Формат клипа')).toBe('Полный матч');
  expect(value('Выбранный ответ')).toBe('Читер');
  expect(value('Этап')).toBe('Ожидание подтверждения');
  expect(value('Тик решения')).toBe('0');
  expect(value('Время решения')).toBe('0:00.00');
  expect(value('Ответ «Читер»')).toBe('Доступен');
  expect(value('Ответ «Неясно»')).toBe('Недоступен');
  expect(value('Ответ «Не читер»')).toBe('Недоступен');
  expect(value('Кнопка «Подтвердить»')).toBe('Недоступен');
  expect(value('Отправка вердикта')).toBe('Не выполняется');
});

it('updates confirmation readiness and submission without claiming acceptance', () => {
  const state = snapshot();
  state.reviewControls = { ...state.reviewControls!, confirmAvailable: true, decisionTick: 22531.75, decisionTime: 25.3 };
  mount(state);
  expect(value('Этап')).toBe('Можно подтвердить');
  expect(value('Кнопка «Подтвердить»')).toBe('Доступен');
  expect(value('Тик решения')).toBe('22531.75');
  expect(value('Время решения')).toBe('0:25.30');
  state.submitting = true;
  state.reviewControls.confirmAvailable = false;
  mount(state);
  expect(value('Отправка вердикта')).toBe(createCatalog().statusSubmitting);
  expect(value('Кнопка «Подтвердить»')).toBe('Недоступен');
});

it('distinguishes unavailable review data from a locked answer or a zero decision', () => {
  const state = snapshot();
  state.reviewControls = null;
  state.verdicts = emptyVerdicts();
  mount(state);
  expect(value('Выбранный ответ')).toBe('Не выбран');
  expect(value('Тик решения')).toBe('—');
  expect(value('Время решения')).toBe('—');
  expect(value('Ответ «Читер»')).toBe('—');
});

it('keeps four-category reviews supported without displaying stale native-only metrics', () => {
  const state = snapshot();
  state.clip = { ...state.clip!, reviewType: 'legacy', range: { start: 2, end: 14 }, eventTime: 7 };
  mount(state);
  expect(value('Тип проверки')).toBe('Четыре категории');
  expect(value('Формат клипа')).toBe('Отдельный момент');
  expect(value('Тик решения')).toBeUndefined();
  expect(value('Ответ «Читер»')).toBeUndefined();
  expect(value('Отправка вердикта')).toBe('Не выполняется');
});
