import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const file = (path) => new URL(`../${path}`, import.meta.url);
const directories = await readdir(file('public/_locales/'), { withFileTypes: true });
const locales = directories.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const catalogs = Object.fromEntries(await Promise.all(locales.map(async (locale) => {
  const catalog = JSON.parse(await readFile(file(`public/_locales/${locale}/messages.json`), 'utf8'));
  return [locale, catalog];
})));
const keys = Object.keys(catalogs.en).sort();
for (const [locale, catalog] of Object.entries(catalogs)) {
  assert.deepEqual(Object.keys(catalog).sort(), keys, `${locale}: translation keys must match English`);
  for (const key of keys) {
    assert.ok(catalog[key].message?.trim(), `${locale}: empty translation ${key}`);
  }
}
const source = `export const messageKeys = [\n${keys.map((key) => `  ${JSON.stringify(key)},`).join('\n')}\n] as const;\n\nexport type MessageKey = (typeof messageKeys)[number];\n`;
await writeFile(file('src/shared/utils/generated-message-keys.utils.ts'), source);
console.log(`Generated ${keys.length} translation keys.`);
