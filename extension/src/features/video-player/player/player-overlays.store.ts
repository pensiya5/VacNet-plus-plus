import { signal } from '@preact/signals';
import type { PlayerOverlayEvent } from '../../../shared/ports/protocol.port';

export type TriggerOverlayPhase = Extract<PlayerOverlayEvent, { kind: 'trigger' }>['phase'];
export interface PlayerOverlayState {
  speed: { text: string; visible: boolean };
  trigger: { phase: TriggerOverlayPhase; text: string };
}

export const playerOverlaySignal = signal<PlayerOverlayState>({
  speed: { text: '', visible: false },
  trigger: { phase: 'hidden', text: '' },
});

export const showSpeedOverlay = (text: string): void => {
  playerOverlaySignal.value = { ...playerOverlaySignal.value, speed: { text, visible: true } };
};
export const hideSpeedOverlay = (): void => {
  playerOverlaySignal.value = { ...playerOverlaySignal.value, speed: { ...playerOverlaySignal.value.speed, visible: false } };
};
export const setTriggerOverlay = (phase: TriggerOverlayPhase, text = ''): void => {
  playerOverlaySignal.value = { ...playerOverlaySignal.value, trigger: { phase, text } };
};
export const applyPlayerOverlay = (overlay: PlayerOverlayEvent): void => {
  if (overlay.kind === 'speed') {
    showSpeedOverlay(overlay.text);
    return;
  }
  setTriggerOverlay(overlay.phase, overlay.text);
};
export const resetPlayerOverlays = (): void => {
  playerOverlaySignal.value = { speed: { text: '', visible: false }, trigger: { phase: 'hidden', text: '' } };
};
