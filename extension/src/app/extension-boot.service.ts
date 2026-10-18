const BOOTING_ATTRIBUTE = 'data-vacnet-booting';
const MAIN_READY_ATTRIBUTE = 'data-vacnet-main-ready';
const UI_READY_ATTRIBUTE = 'data-vacnet-ui-ready';

const getRoot = (): HTMLElement => document.documentElement;

const releaseIfReady = (): void => {
  const root = getRoot();
  if (root.dataset.vacnetMainReady === 'true' && root.dataset.vacnetUiReady === 'true') {
    root.removeAttribute(BOOTING_ATTRIBUTE);
  }
};

export const startExtensionBoot = (): (() => void) => {
  const root = getRoot();
  root.setAttribute(BOOTING_ATTRIBUTE, 'true');
  const fallbackId = window.setTimeout(() => root.removeAttribute(BOOTING_ATTRIBUTE), 10_000);

  return () => {
    window.clearTimeout(fallbackId);
    root.removeAttribute(BOOTING_ATTRIBUTE);
    root.removeAttribute(MAIN_READY_ATTRIBUTE);
    root.removeAttribute(UI_READY_ATTRIBUTE);
  };
};

export const markExtensionMainReady = (): void => {
  getRoot().setAttribute(MAIN_READY_ATTRIBUTE, 'true');
  releaseIfReady();
};

export const markExtensionUiReady = (): void => {
  getRoot().setAttribute(UI_READY_ATTRIBUTE, 'true');
  releaseIfReady();
};
