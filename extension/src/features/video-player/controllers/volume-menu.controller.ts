import type Plyr from 'plyr';

export class VolumeMenuController {
  private readonly container: HTMLDivElement | null;
  private readonly popup: HTMLDivElement | null;
  private readonly sliderTrack: HTMLDivElement | null;
  private readonly slider: HTMLInputElement | null;
  private readonly percentage: HTMLOutputElement | null;
  private readonly muteButton: HTMLButtonElement | null;
  private readonly settingsButton: HTMLButtonElement | null;
  private readonly settingsPopup: HTMLDivElement | null;

  constructor(element: HTMLDivElement, private readonly plyr: Plyr, label: string) {
    const container = element.querySelector<HTMLDivElement>('.plyr__volume');
    const mute = container?.querySelector<HTMLButtonElement>('button[data-plyr="mute"]');
    this.container = container;
    this.muteButton = mute ?? null;
    this.settingsButton = element.querySelector<HTMLButtonElement>('button[data-plyr="settings"]') ?? null;
    this.settingsPopup = this.settingsButton?.parentElement?.querySelector<HTMLDivElement>('.plyr__menu__container') ?? null;
    if (!container || !mute) { this.popup = null; this.sliderTrack = null; this.slider = null; this.percentage = null; return; }
    container.classList.add('plyr__menu');
    const popup = document.createElement('div'); popup.className = 'plyr__menu__container vacnet-volume-menu'; popup.id = `vacnet-volume-${crypto.randomUUID()}`; popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', label); popup.hidden = true;
    const content = document.createElement('div'); content.className = 'vacnet-volume-menu__content';
    const percentage = document.createElement('output'); percentage.className = 'vacnet-volume-menu__percentage'; percentage.setAttribute('aria-live', 'polite');
    const slider = document.createElement('input'); slider.className = 'vacnet-volume-menu__slider'; slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.01'; slider.setAttribute('orient', 'vertical'); slider.setAttribute('aria-label', label);
    const track = document.createElement('div'); track.className = 'vacnet-volume-menu__slider-track'; const thumb = document.createElement('span'); thumb.className = 'vacnet-volume-menu__slider-thumb'; track.append(slider, thumb); content.append(percentage, track); popup.append(content); container.append(popup);
    this.popup = popup; this.sliderTrack = track; this.slider = slider; this.percentage = percentage;
    mute.setAttribute('aria-controls', popup.id); mute.setAttribute('aria-expanded', 'false'); mute.setAttribute('aria-haspopup', 'dialog');
    mute.addEventListener('click', this.onMute, true); this.settingsButton?.addEventListener('click', this.onSettings, true); slider.addEventListener('input', this.onInput); track.addEventListener('pointerdown', this.onPointerDown); track.addEventListener('pointermove', this.onPointerMove); track.addEventListener('pointerup', this.onPointerUp); track.addEventListener('pointercancel', this.onPointerUp); document.addEventListener('pointerdown', this.onDocumentPointer, true); document.addEventListener('keydown', this.onKey, true); this.update();
  }
  update(): void { if (!this.slider || !this.percentage) return; const volume = this.plyr.muted ? 0 : this.plyr.volume; this.slider.value = String(volume); this.sliderTrack?.style.setProperty('--value-height', `${volume * 120}px`); this.percentage.value = `${Math.round(volume * 100)}%`; }
  dispose(): void { this.muteButton?.removeEventListener('click', this.onMute, true); this.settingsButton?.removeEventListener('click', this.onSettings, true); this.slider?.removeEventListener('input', this.onInput); this.sliderTrack?.removeEventListener('pointerdown', this.onPointerDown); this.sliderTrack?.removeEventListener('pointermove', this.onPointerMove); this.sliderTrack?.removeEventListener('pointerup', this.onPointerUp); this.sliderTrack?.removeEventListener('pointercancel', this.onPointerUp); document.removeEventListener('pointerdown', this.onDocumentPointer, true); document.removeEventListener('keydown', this.onKey, true); this.popup?.remove(); }
  private readonly onMute = (event: MouseEvent): void => { event.preventDefault(); event.stopImmediatePropagation(); if (this.popup?.hidden) this.open(); else this.close(); };
  private readonly onSettings = (): void => this.close();
  private readonly onInput = (): void => { const value = Number(this.slider?.value); if (Number.isFinite(value)) { this.plyr.volume = value; this.plyr.muted = value === 0; } };
  private readonly onPointerDown = (event: PointerEvent): void => { if (!this.sliderTrack) return; event.preventDefault(); this.sliderTrack.setPointerCapture(event.pointerId); this.setFromPointer(event); };
  private readonly onPointerMove = (event: PointerEvent): void => { if (this.sliderTrack?.hasPointerCapture(event.pointerId)) this.setFromPointer(event); };
  private readonly onPointerUp = (event: PointerEvent): void => { if (this.sliderTrack?.hasPointerCapture(event.pointerId)) this.sliderTrack.releasePointerCapture(event.pointerId); };
  private readonly onDocumentPointer = (event: PointerEvent): void => { if (!(event.target instanceof Node && this.container?.contains(event.target))) this.close(); };
  private readonly onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') this.close(); };
  private open(): void { if (!this.popup || !this.muteButton) return; this.closeSettings(); this.update(); this.popup.hidden = false; this.muteButton.setAttribute('aria-expanded', 'true'); }
  private close(): void { if (!this.popup || !this.muteButton || this.popup.hidden) return; this.popup.hidden = true; this.muteButton.setAttribute('aria-expanded', 'false'); }
  private closeSettings(): void { if (this.settingsButton && this.settingsPopup && !this.settingsPopup.hidden) this.settingsButton.click(); }
  private setFromPointer(event: PointerEvent): void { if (!this.sliderTrack) return; const bounds = this.sliderTrack.getBoundingClientRect(); const height = bounds.height - 8; if (height <= 0) return; const volume = Math.min(1, Math.max(0, (bounds.bottom - 8 - event.clientY) / height)); this.plyr.volume = volume; this.plyr.muted = volume === 0; this.update(); }
}
