import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpdateCheckButton } from '../src/features/updates/components/UpdateCheckButton';
import type { UpdateCheckResult } from '../src/features/updates/update-checker.service';
import { TranslationProvider } from '../src/shared/components/TranslationProvider';
import { createCatalog } from '../src/shared/services/i18n.service';

let root: HTMLElement;
const current: UpdateCheckResult = { currentVersion: '4.2.1', latestVersion: '4.2.1',
  available: false, releaseUrl: 'https://github.com/pensiya5/VacNetPlusPlus/releases/tag/v4.2.1',
  error: false, checkedAt: 1_800_000_000_000 };
const mount = async (onCheck: (force: boolean) => Promise<UpdateCheckResult>) => {
  await act(async () => render(h(TranslationProvider, {
    catalog: createCatalog(), children: h(UpdateCheckButton, { onCheck }),
  }), root));
};
beforeEach(() => { root = document.createElement('div'); document.body.append(root); });
afterEach(() => { render(null, root); root.remove(); });

it('checks on mount and provides an explicit manual check', async () => {
  const onCheck = vi.fn().mockResolvedValue(current);
  await mount(onCheck);
  expect(onCheck).toHaveBeenCalledWith(false);
  expect(root.textContent).toContain('Установлена последняя версия');
  expect(root.textContent).toContain('4.2.1');
  await act(async () => root.querySelector<HTMLButtonElement>('[data-update-check]')!.click());
  expect(onCheck).toHaveBeenLastCalledWith(true);
});

it('marks available updates and links to the fork release without opening it automatically', async () => {
  await mount(async () => ({ ...current, available: true, latestVersion: '4.3.0',
    releaseUrl: 'https://github.com/pensiya5/VacNetPlusPlus/releases/tag/v4.3.0' }));
  expect(root.textContent).toContain('Доступна версия 4.3.0');
  expect(root.querySelector('[data-update-available]')).not.toBeNull();
  const link = root.querySelector<HTMLAnchorElement>('a')!;
  expect(link.href).toBe('https://github.com/pensiya5/VacNetPlusPlus/releases/tag/v4.3.0');
  expect(link.rel).toContain('noopener');
});

it('shows a failed check without falsely claiming the latest version is installed', async () => {
  await mount(async () => { throw new Error('worker unavailable'); });
  expect(root.textContent).toContain('Не удалось проверить обновления');
  expect(root.textContent).not.toContain('Установлена последняя версия');
  expect(root.querySelector<HTMLButtonElement>('[data-update-check]')!.disabled).toBe(false);
});

it('disables manual checks while loading and restores them after completion', async () => {
  let resolve!: (value: UpdateCheckResult) => void;
  await mount(() => new Promise((done) => { resolve = done; }));
  expect(root.querySelector<HTMLButtonElement>('[data-update-check]')!.disabled).toBe(true);
  expect(root.textContent).toContain('Проверяем обновления');
  await act(async () => resolve(current));
  expect(root.querySelector<HTMLButtonElement>('[data-update-check]')!.disabled).toBe(false);
});
