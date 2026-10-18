import type Plyr from 'plyr';

export class ShareButtonController {
  private button: HTMLButtonElement | null = null;
  private tooltip: HTMLElement | null = null;
  private timeout: number | null = null;
  constructor(element: HTMLDivElement, _plyr: Plyr, label: string, private readonly copiedLabel: string) {
    const controls = element.querySelector<HTMLElement>('.plyr__controls'); const fullscreen = controls?.querySelector<HTMLButtonElement>('button[data-plyr="fullscreen"]');
    if (!controls || !fullscreen || controls.querySelector('.vacnet-share-clip')) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'plyr__controls__item plyr__control vacnet-share-clip'; button.setAttribute('aria-label', label);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M21.7 10.3l-7-7A1 1 0 0013 4v3.1C6.6 7.6 2.7 11 1.1 17.6a1 1 0 001.7.9c2.8-3.1 5.8-4.6 10.2-4.8V17a1 1 0 001.7.7l7-7a1 1 0 000-1.4z'); icon.append(path); const tooltip = document.createElement('span'); tooltip.className = 'plyr__tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.setAttribute('aria-live', 'polite'); tooltip.textContent = label; button.append(icon, tooltip); button.addEventListener('click', this.onClick); fullscreen.before(button); this.button = button; this.tooltip = tooltip;
  }
  dispose(): void { if (this.timeout !== null) window.clearTimeout(this.timeout); this.button?.removeEventListener('click', this.onClick); this.button?.remove(); this.button = null; this.tooltip = null; }
  private readonly onClick = (): void => { const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/vacnet/view?"]')).map((a) => new URL(a.href, document.baseURI)).find((url) => url.pathname === '/vacnet/view' && url.searchParams.has('s')); if (!link) return; void navigator.clipboard.writeText(link.href).then(() => { if (!this.button || !this.tooltip) return; this.button.setAttribute('aria-label', this.copiedLabel); this.tooltip.textContent = this.copiedLabel; this.tooltip.classList.add('plyr__tooltip--visible'); this.timeout = window.setTimeout(() => { this.button?.setAttribute('aria-label', this.tooltip?.textContent ?? ''); this.tooltip?.classList.remove('plyr__tooltip--visible'); this.timeout = null; }, 1800); }); };
}
