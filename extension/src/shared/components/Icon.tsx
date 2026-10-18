import type { JSX } from 'preact';

export type IconName = 'info' | 'keyboard' | 'tune' | 'eyeOff' | 'autoVerdict' | 'lock' | 'stretch' | 'upload' | 'download' | 'trash' | 'copy' | 'close' | 'sun' | 'moon' | 'refresh';

interface IconProps extends JSX.SVGAttributes<SVGSVGElement> {
  name: IconName;
}

const paths: Record<IconName, JSX.Element> = {
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1a8 8 0 0 1 13.2 3.4L20 12M4 12l.7 2.5a8 8 0 0 0 13.2 3.4" /></>,
  info: <><circle cx="12" cy="12" r="9" />
    <path d="M12 10v6" /><path d="M12 7h.01" />
  </>,
  keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10" /></>,
  tune: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="11" cy="18" r="2" fill="currentColor" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.8 10.8 0 0 1 12 4.8c5 0 8.5 4.2 9.5 7.2a11.7 11.7 0 0 1-3.1 4.7M6.2 6.2A12.5 12.5 0 0 0 2.5 12c1 3 4.5 7.2 9.5 7.2 1.2 0 2.3-.2 3.3-.6" /></>,
  autoVerdict: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  stretch: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" /><path d="M8 8l-3-3M16 8l3-3M8 16l-3 3M16 16l3 3" /></>,
  upload: <><path d="M12 16V4M8 8l4-4 4 4M5 14v5h14v-5" /></>,
  download: <><path d="M12 4v12M8 12l4 4 4-4M5 14v5h14v-5" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="1" /><path d="M16 8V5H5v11h3" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>,
  moon: <><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" /></>,
};

export const Icon = ({ name, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props}>
    {paths[name]}
  </svg>
);
