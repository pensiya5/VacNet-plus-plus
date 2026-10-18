import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../src/app/components/App';
import { dashboardStore } from '../src/features/dashboard/dashboard.store';
import { TranslationProvider } from '../src/shared/components/TranslationProvider';
import { createCatalog } from '../src/shared/services/i18n.service';

vi.mock('../src/features/preferences/preferences.store', async () => {
  const { signal } = await import('@preact/signals');
  const { createDefaultPreferences } = await import('../src/entities/preferences.entity');
  return { preferencesSignal: signal(createDefaultPreferences()), updatePreferences: vi.fn().mockResolvedValue(undefined) };
});
vi.mock('../src/features/history/history.store', async () => {
  const { signal } = await import('@preact/signals');
  const { emptyHistory } = await import('../src/entities/history.entity');
  return { historySignal: signal(emptyHistory()) };
});
let root: HTMLElement | null = null;
afterEach(() => { if (root) render(null, root); root = null; dashboardStore.close(); document.body.innerHTML = ''; });

it('opens statistics from the same footer as history and metrics, without destructive or unrelated actions', async () => {
  root = document.createElement('div');
  const footer = document.createElement('footer');
  document.body.append(root, footer);
  const noop = vi.fn();
  await act(async () => render(h(TranslationProvider, { catalog: createCatalog(), children: h(App, {
    nativeReview: true, footerTarget: footer, onReviewCommand: noop, onClearHistory: noop, onCopyMetrics: noop,
    onError: noop, onImportHistory: noop, onExportHistory: noop,
  }) }), root!));
  const statistics = [...footer.querySelectorAll('a')].find((link) => link.textContent === 'Статистика');
  expect(statistics).toBeDefined();
  expect(footer.querySelectorAll('a')).toHaveLength(3);
  await act(async () => statistics!.click());
  expect(root.querySelector('#vacnet-dashboard-title')?.textContent).toBe('Статистика');
  expect(root.textContent).toContain('Текущая сессия');
  expect(root.querySelector('[aria-label="Скопировать метрики"]')).toBeNull();
  expect(root.querySelector('[aria-label="Очистить историю"]')).toBeNull();
  await act(async () => root!.querySelector<HTMLButtonElement>('button[aria-label="Закрыть панель"]')!.click());
  expect(root.querySelector('#vacnet-dashboard-title')).toBeNull();
});
