import type Plyr from 'plyr';

export class PreciseProgressController {
  private readonly progress: HTMLElement | null;
  private readonly seek: HTMLInputElement | null;
  private readonly tooltip: HTMLElement | null;
  private frame: number | null = null;
  constructor(element: HTMLDivElement, private readonly plyr: Plyr) {
    this.progress = element.querySelector<HTMLElement>('.plyr__progress'); this.seek = this.progress?.querySelector<HTMLInputElement>('input[data-plyr="seek"]') ?? null; this.tooltip = this.progress?.querySelector<HTMLElement>('.plyr__tooltip') ?? null;
    this.progress?.addEventListener('mouseenter', this.onHover); this.progress?.addEventListener('mousemove', this.onHover); plyr.on('play', this.start); plyr.on('pause', this.stop); plyr.on('ended', this.stop); if (!plyr.paused) this.start();
  }
  dispose(): void { this.progress?.removeEventListener('mouseenter', this.onHover); this.progress?.removeEventListener('mousemove', this.onHover); this.stop(); }
  private readonly onHover = (event: MouseEvent): void => { const duration = this.plyr.duration; if (!this.progress || !this.tooltip || !Number.isFinite(duration) || duration <= 0) return; const bounds = this.progress.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)); this.tooltip.textContent = this.format(duration * ratio); };
  private readonly start = (): void => { if (this.frame !== null) return; const update = (): void => { this.frame = null; if (!this.seek || this.plyr.paused || this.plyr.ended) return; const duration = this.plyr.duration; if (Number.isFinite(duration) && duration > 0) { const value = Math.min(100, Math.max(0, (this.plyr.currentTime / duration) * 100)); this.seek.value = String(value); this.seek.style.setProperty('--value', `${value}%`); } this.frame = window.requestAnimationFrame(update); }; this.frame = window.requestAnimationFrame(update); };
  private readonly stop = (): void => { if (this.frame !== null) window.cancelAnimationFrame(this.frame); this.frame = null; };
  private format(time: number): string { const ms = Math.round(Math.max(0, time) * 1000); const milliseconds = ms % 1000; const secondsTotal = Math.floor(ms / 1000); const seconds = secondsTotal % 60; const minutesTotal = Math.floor(secondsTotal / 60); const minutes = minutesTotal % 60; const hours = Math.floor(minutesTotal / 60); const clock = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : minutesTotal > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : String(seconds); return `${clock}.${String(milliseconds).padStart(3, '0')}`; }
}
