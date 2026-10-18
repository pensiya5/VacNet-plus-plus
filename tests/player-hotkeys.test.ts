import { afterEach, beforeEach, expect, it } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { Dashboard } from '../src/features/dashboard/components/Dashboard';
import { TranslationProvider } from '../src/shared/components/TranslationProvider';
import { createCatalog } from '../src/shared/services/i18n.service';
import { installPlayerHotkeys } from '../src/features/video-player/player/player-hotkeys.injector';
import { emptyVerdicts } from '../src/entities/verdict.entity';
import type { PlayerCommand, ReviewCommand } from '../src/shared/ports/protocol.port';
import type { PageSnapshot } from '../src/entities/clip.entity';
import html from './fixtures/review-page.html?raw';

let cleanup: (() => void)[] = [];
let host: HTMLElement;
let root: ShadowRoot;
let dashboardOpen: boolean;
let modalOpen: boolean;
let reviews: ReviewCommand[];
let players: PlayerCommand[];
const key = (target: HTMLElement, code: string) => {
  const event = new KeyboardEvent('keydown', { key: code === 'Escape' ? 'Escape' : code, code, bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};
beforeEach(() => {
  document.documentElement.innerHTML = html;
  host = document.createElement('vacnet-extension-ui'); document.body.append(host);
  root = host.attachShadow({ mode: 'open' });
  dashboardOpen = false; modalOpen = false; reviews = []; players = [];
  installPlayerHotkeys({
    context: { addEventListener(target: Document, type: string, listener: EventListener, options: AddEventListenerOptions) {
      target.addEventListener(type, listener, options);
      cleanup.push(() => target.removeEventListener(type, listener, options));
    } } as never,
    isDashboardOpen: () => dashboardOpen,
    isModalOpen: () => modalOpen,
    closeDashboard: () => { dashboardOpen = false; },
    getPresets: () => [{ label: 'Native', color: 'red', autoSubmit: true, verdicts: { ...emptyVerdicts(), cheating: 'positive' } }],
    getSnapshot: () => ({ clip: { taskId: 'current', eventTime: -1 }, hasVideo: true, submitting: false,
      verdicts: { ...emptyVerdicts(), cheating: 'positive' } }) as PageSnapshot,
    emitReviewCommand: (command) => reviews.push(command), emitPlayerCommand: (command) => players.push(command),
  });
});
afterEach(() => { cleanup.forEach((remove) => remove()); cleanup = []; host.remove(); });

it('blocks verdicts, presets and playback while a dashboard is open', () => {
  dashboardOpen = true;
  const panel = document.createElement('aside'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'vacnet-dashboard-title'); root.append(panel);
  for (const code of ['Enter', 'Space', 'Backspace', 'Digit1', 'ArrowLeft']) key(panel, code);
  expect(reviews).toEqual([]);
  expect(players).toEqual([]);
});

it('also blocks portal key handlers when a dashboard is open and focus is outside it', () => {
  dashboardOpen = true;
  let siteSubmissions = 0;
  const siteHandler = (event: KeyboardEvent) => { if (event.code === 'Enter') siteSubmissions++; };
  document.addEventListener('keydown', siteHandler);
  cleanup.push(() => document.removeEventListener('keydown', siteHandler));
  key(document.body, 'Enter');
  expect(siteSubmissions).toBe(0);
  expect(reviews).toEqual([]);
});

it('recognizes an extension modal through the composed path even if document selectors cannot see it', () => {
  const dialog = document.createElement('div'); dialog.setAttribute('aria-modal', 'true'); root.append(dialog);
  expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  key(dialog, 'Enter'); key(dialog, 'Digit1');
  expect(reviews).toEqual([]);
});

it('keeps keyboard activation of buttons and text input available inside the dashboard', () => {
  dashboardOpen = true;
  const button = document.createElement('button'); root.append(button);
  const input = document.createElement('input'); root.append(input);
  expect(key(button, 'Enter').defaultPrevented).toBe(false);
  expect(key(input, 'Backspace').defaultPrevented).toBe(false);
  expect(reviews).toEqual([]);
});

it('lets Escape dismiss a nested confirmation before closing the dashboard', () => {
  dashboardOpen = true;
  const dialog = document.createElement('div'); dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('role', 'alertdialog'); root.append(dialog);
  let dismissed = false;
  dialog.addEventListener('keydown', (event) => { if (event.code === 'Escape') { dismissed = true; event.preventDefault(); } });
  key(dialog, 'Escape');
  expect(dismissed).toBe(true);
  expect(dashboardOpen).toBe(true);
});

it('still closes an ordinary dashboard with Escape and resumes player shortcuts afterward', () => {
  dashboardOpen = true;
  const panel = document.createElement('aside'); panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'vacnet-dashboard-title'); root.append(panel);
  key(panel, 'Escape');
  expect(dashboardOpen).toBe(false);
  key(document.body, 'Space');
  expect(players).toEqual([{ type: 'toggle-playback' }]);
});

it('dismisses a clear-history confirmation with Escape even when focus moved to a sibling toolbar button', () => {
  dashboardOpen = true;
  const mount = document.createElement('div'); root.append(mount);
  const toolbarButton = document.createElement('button'); root.append(toolbarButton);
  root.addEventListener('keydown', (event) => event.stopPropagation());
  const catalog = createCatalog();
  act(() => render(h(TranslationProvider, { catalog, children: h(Dashboard, {
    mode: 'history', history: null, metrics: null, onClose: () => { dashboardOpen = false; },
    onClearHistory: () => {}, onCopyMetrics: () => {}, onImportHistory: () => {},
    onExportHistory: () => {}, onImportError: () => {},
  }) }), mount));
  cleanup.push(() => act(() => render(null, mount)));
  act(() => mount.querySelector<HTMLButtonElement>('button[aria-label="' + catalog.clearVideoHistory + '"]')!.click());
  expect(root.querySelector('[data-confirm-dialog]')).not.toBeNull();
  modalOpen = true;
  toolbarButton.focus();
  act(() => { key(toolbarButton, 'Escape'); });
  expect(dashboardOpen).toBe(true);
  expect(root.querySelector('[data-confirm-dialog]')).toBeNull();
});
