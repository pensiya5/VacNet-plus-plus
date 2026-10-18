const MAX_URL_LENGTH = 8_192;
const WEBM_ORIGIN = 'https://replay-video.valve.net';
const VALVE_ORIGIN = 'https://www.counter-strike.net';
const VALVE_VERDICT_PATH = '/vacnet/submit';

const parseUrl = (value: string): URL | null => {
  if (value.length > MAX_URL_LENGTH) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const getAllowedWebmUrl = (value: string): URL | null => {
  const url = parseUrl(value);
  return url?.protocol === 'https:'
    && url.origin === WEBM_ORIGIN
    && url.username === ''
    && url.password === ''
    ? url
    : null;
};

export const getAllowedValvePageUrl = (value: string): URL | null => {
  const url = parseUrl(value);
  return url?.protocol === 'https:'
    && url.origin === VALVE_ORIGIN
    && url.pathname.startsWith('/vacnet/')
    && url.username === ''
    && url.password === ''
    ? url
    : null;
};

export const getAllowedValveSubmitUrl = (value: string): URL | null => {
  const url = parseUrl(value);
  return url?.protocol === 'https:'
    && url.origin === VALVE_ORIGIN
    && url.pathname.startsWith(VALVE_VERDICT_PATH)
    && url.username === ''
    && url.password === ''
    ? url
    : null;
};
