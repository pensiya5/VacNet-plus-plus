import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import html from './fixtures/review-page.html?raw';
import { NativeReviewController } from '../src/features/valve-interop/native-controls.adapter';
import { emptyVerdicts } from '../src/entities/verdict.entity';

let controller: NativeReviewController;
let submitted: ReturnType<typeof vi.fn>;
const radio = (value: string) => document.querySelector<HTMLInputElement>(`input[name=cheating][value=${value}]`)!;
const tick = () => document.querySelector<HTMLInputElement>('[name=verdict_tick]')!;
const arm = async () => {
  document.querySelector<HTMLButtonElement>('#submitVerdictButton')!.disabled = false;
  await new Promise<void>((resolve) => queueMicrotask(resolve));
};

beforeEach(() => {
  document.documentElement.innerHTML = html;
  const panel = document.querySelector('.verdict-column')!;
  const form = document.querySelector<HTMLFormElement>('form')!;
  const buttons = document.createElement('div');
  buttons.id = 'submitbuttons';
  panel.append(buttons);
  let availableBeforeChoice = new Map<HTMLInputElement, boolean>();
  submitted = vi.fn();
  form.submit = submitted;
  window.CancelVerdict = vi.fn(() => {
    radio('positive').checked = false; radio('skip').checked = false; radio('negative').checked = false;
    tick().value = '';
    panel.classList.remove('confirming');
    for (const [input, available] of availableBeforeChoice) input.disabled = !available;
    buttons.replaceChildren();
  });
  window.ReportBadClip = vi.fn();
  document.querySelector('.verdicts-container')!.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    tick().value = value === 'positive' ? '22531.75' : '';
    panel.classList.add('confirming');
    availableBeforeChoice = new Map([...document.querySelectorAll<HTMLInputElement>('input[name=cheating]')]
      .map((input) => [input, !input.disabled]));
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name=cheating]')) input.disabled = true;
    buttons.innerHTML = '<button id="backbutton">Cancel</button><button id="submitVerdictButton" disabled>Confirm</button>';
    buttons.querySelector('#backbutton')!.addEventListener('click', () => window.CancelVerdict!());
    buttons.querySelector('#submitVerdictButton')!.addEventListener('click', () => form.submit());
  });
  controller = new NativeReviewController(document, vi.fn());
});
afterEach(() => { controller.dispose(); delete window.CancelVerdict; delete window.ReportBadClip; });

it('routes a custom cheating choice through the site and keeps its exact tick and arming gate', async () => {
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'negative' });
  expect(controller.verdicts().cheating).toBeUndefined();
  radio('positive').disabled = false;
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  expect(controller.verdicts().cheating).toBe('positive');
  expect(controller.snapshot()).toMatchObject({ confirming: true, confirmAvailable: false, decisionTick: 22531.75, decisionTime: 0 });
  controller.handle({ type: 'confirm-verdict' });
  expect(submitted).not.toHaveBeenCalled();
  await arm();
  controller.handle({ type: 'confirm-verdict' });
  expect(submitted).toHaveBeenCalledOnce();
  expect(tick().value).toBe('22531.75');
});

it('cancels using native logic and clears the decision tick', () => {
  radio('positive').disabled = false;
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  controller.handle({ type: 'cancel-verdict' });
  expect(tick().value).toBe('');
  expect(controller.snapshot().confirming).toBe(false);
  expect(controller.verdicts().cheating).toBeUndefined();
});

it('keeps the decision time fixed while reviewing more video and records a new time when replacing the answer', () => {
  const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
  for (const choice of ['positive', 'negative', 'skip']) radio(choice).disabled = false;
  video.currentTime = 30;
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  expect(controller.snapshot().decisionTime).toBe(30);
  video.currentTime = 90;
  video.dispatchEvent(new Event('timeupdate'));
  expect(controller.snapshot()).toMatchObject({ decisionTime: 30, decisionTick: 22531.75 });
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'negative' });
  expect(controller.snapshot().decisionTime).toBe(90);
  controller.handle({ type: 'cancel-verdict' });
  expect(controller.snapshot().decisionTime).toBeNull();
});

it('auto-submits a native preset only after the server page enables confirmation', async () => {
  radio('positive').disabled = false;
  controller.handle({ type: 'submit', verdicts: { ...emptyVerdicts(), cheating: 'positive' }, badClip: false });
  expect(submitted).not.toHaveBeenCalled();
  await arm();
  expect(submitted).toHaveBeenCalledOnce();
});

it('keeps legacy presets from manufacturing a cheating verdict and preserves reporting', () => {
  radio('positive').disabled = false;
  controller.handle({ type: 'set-verdicts', verdicts: { ...emptyVerdicts(), aimassist: 'positive' } });
  expect(controller.verdicts().cheating).toBeUndefined();
  controller.handle({ type: 'report-bad-clip' });
  expect(window.ReportBadClip).toHaveBeenCalledOnce();
});

it('applies a repeated answer when available without unlocking answers or submitting', async () => {
  controller.setRepeatVerdict('negative');
  expect(controller.verdicts().cheating).toBeUndefined();
  radio('negative').disabled = false;
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(controller.verdicts().cheating).toBe('negative');
  expect(submitted).not.toHaveBeenCalled();
});

it.each(['negative', 'skip'] as const)('replaces a pending positive with %s using native cancellation and a new confirmation gate', async (value) => {
  for (const choice of ['positive', 'negative', 'skip']) radio(choice).disabled = false;
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  expect(document.querySelectorAll('input[name=cheating]:disabled')).toHaveLength(3);
  expect(controller.snapshot()).toMatchObject({ positiveAvailable: true, negativeAvailable: true, skipAvailable: true });
  await arm();
  const previousConfirm = document.querySelector('#submitVerdictButton');
  document.querySelector('.verdicts-container')!.addEventListener('change', () => { tick().value = '33012.5'; });

  controller.handle({ type: 'set-verdict', name: 'cheating', value });
  expect(window.CancelVerdict).toHaveBeenCalledOnce();
  expect(controller.verdicts().cheating).toBe(value);
  expect(document.querySelector('#submitVerdictButton')).not.toBe(previousConfirm);
  expect(controller.snapshot()).toMatchObject({ confirming: true, confirmAvailable: false, decisionTick: 33012.5 });
  controller.handle({ type: 'confirm-verdict' });
  expect(submitted).not.toHaveBeenCalled();

  await arm();
  controller.handle({ type: 'confirm-verdict' });
  controller.handle({ type: 'confirm-verdict' });
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  expect(submitted).toHaveBeenCalledOnce();
  expect(controller.verdicts().cheating).toBe(value);
  expect(tick().value).toBe('33012.5');
  expect(window.CancelVerdict).toHaveBeenCalledOnce();
  expect(controller.snapshot()).toMatchObject({ positiveAvailable: false, negativeAvailable: false, skipAvailable: false });
});

it.each(['negative', 'skip'] as const)('rejects unavailable %s without cancelling the pending verdict', (value) => {
  radio('positive').disabled = false;
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  expect(controller.snapshot()).toMatchObject({ positiveAvailable: true, negativeAvailable: false, skipAvailable: false });
  controller.handle({ type: 'set-verdict', name: 'cheating', value });
  expect(window.CancelVerdict).not.toHaveBeenCalled();
  expect(controller.verdicts().cheating).toBe('positive');
  expect(controller.snapshot()).toMatchObject({ confirming: true, decisionTick: 22531.75 });
});

it('rechecks the native availability restored by cancellation before clicking a replacement', () => {
  radio('positive').disabled = false;
  radio('negative').disabled = false;
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  const nativeCancel = window.CancelVerdict!;
  window.CancelVerdict = vi.fn(() => { nativeCancel(); radio('negative').disabled = true; });
  const click = vi.spyOn(radio('negative'), 'click');
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'negative' });
  expect(window.CancelVerdict).toHaveBeenCalledOnce();
  expect(click).not.toHaveBeenCalled();
  expect(controller.verdicts().cheating).toBeUndefined();
  expect(controller.snapshot().negativeAvailable).toBe(false);
});

it('keeps an unchanged pending answer and its arming button intact', async () => {
  radio('positive').disabled = false;
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  await arm();
  const confirm = document.querySelector('#submitVerdictButton');
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  expect(window.CancelVerdict).not.toHaveBeenCalled();
  expect(document.querySelector('#submitVerdictButton')).toBe(confirm);
  expect(controller.snapshot().confirmAvailable).toBe(true);
});

it('does not auto-submit a manually changed answer from a pending auto-submit preset', async () => {
  radio('positive').disabled = false;
  radio('negative').disabled = false;
  controller.handle({ type: 'submit', verdicts: { ...emptyVerdicts(), cheating: 'positive' }, badClip: false });
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'negative' });
  expect(controller.verdicts().cheating).toBe('negative');
  await arm();
  expect(submitted).not.toHaveBeenCalled();
});
