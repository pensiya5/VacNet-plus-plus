import { PLUGIN_ID_MAX_LENGTH } from '../../entities/plugin.entity';

/** Filename → valid plugin id ("My Cool Plugin.js" → "my-cool-plugin"). */
export const pluginIdFromFilename = (filename: string): string => {
  const base = filename
    .replace(/\.[a-z0-9]+$/iu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, PLUGIN_ID_MAX_LENGTH)
    .replace(/-+$/gu, '');
  return base.length >= 3 ? base : 'imported-plugin';
};

/** Filename → human plugin name ("my-cool-plugin.js" → "my cool plugin"). */
export const pluginNameFromFilename = (filename: string): string => {
  const base = filename.replace(/\.[a-z0-9]+$/iu, '').replace(/[-_]+/gu, ' ').trim();
  return base.length >= 1 ? base.slice(0, 64) : 'Импортированный плагин';
};

/** First id not taken by an existing plugin ("x" taken → "x-2"). */
export const uniquePluginId = (candidate: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(candidate)) return candidate;
  for (let n = 2; ; n += 1) {
    const next = `${candidate.slice(0, PLUGIN_ID_MAX_LENGTH - 3)}-${n}`;
    if (!taken.has(next)) return next;
  }
};
