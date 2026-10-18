import { effect } from '@preact/signals';
import { ThemeSchema, type ResolvedTheme, type Theme } from '../../entities/theme.entity';

interface PreferencesSignal {
  value: { theme: Theme };
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

type ThemeTarget = Document | HTMLElement;

export class ThemeInjector {
  private readonly targets = new Set<ThemeTarget>();
  private readonly mediaQuery: MediaQueryList | null;
  private readonly preferencesSignal: PreferencesSignal;
  private readonly stopPreferences: () => void;
  private disposed = false;

  public constructor(
    preferencesSignal: PreferencesSignal,
    documentTarget: Document = document,
  ) {
    this.preferencesSignal = preferencesSignal;
    this.targets.add(documentTarget);
    const body = documentTarget.querySelector('body');
    if (body instanceof HTMLElement) this.targets.add(body);
    this.mediaQuery = typeof window === 'undefined' ? null : window.matchMedia(DARK_QUERY);
    this.stopPreferences = effect(() => {
      this.apply(ThemeSchema.parse(this.preferencesSignal.value.theme));
    });
    this.addMediaListener();
    this.apply(ThemeSchema.parse(this.preferencesSignal.value.theme));
  }

  public addTarget(target: ThemeTarget | null): () => void {
    if (!target || this.disposed) return () => undefined;
    this.targets.add(target);
    this.apply(ThemeSchema.parse(this.preferencesSignal.value.theme));
    return () => this.targets.delete(target);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopPreferences();
    this.removeMediaListener();
    this.targets.clear();
  }

  private readonly handleMediaChange = (): void => {
    if (ThemeSchema.parse(this.preferencesSignal.value.theme) === 'system') this.apply('system');
  };

  private addMediaListener(): void {
    if (!this.mediaQuery) return;
    if (typeof this.mediaQuery.addEventListener === 'function') {
      this.mediaQuery.addEventListener('change', this.handleMediaChange);
    } else {
      this.mediaQuery.addListener(this.handleMediaChange);
    }
  }

  private removeMediaListener(): void {
    if (!this.mediaQuery) return;
    if (typeof this.mediaQuery.removeEventListener === 'function') {
      this.mediaQuery.removeEventListener('change', this.handleMediaChange);
    } else {
      this.mediaQuery.removeListener(this.handleMediaChange);
    }
  }

  private resolve(theme: Theme): ResolvedTheme {
    if (theme !== 'system') return theme;
    return this.mediaQuery?.matches ? 'dark' : 'light';
  }

  private apply(theme: Theme): void {
    const resolved = this.resolve(theme);
    for (const target of this.targets) {
      if (target instanceof Document) {
        target.documentElement.setAttribute('data-theme', resolved);
        const body = target.querySelector('body');
        if (body) body.setAttribute('data-theme', resolved);
      } else {
        target.setAttribute('data-theme', resolved);
      }
    }
  }
}
