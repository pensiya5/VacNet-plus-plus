import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const placeholders = (message) => message.match(/\{[^{}]+\}|\[time\]/gu) ?? [];

test('translation catalogs and generated message keys stay in sync', () => {
  const english = JSON.parse(read('public/_locales/en/messages.json'));
  const generated = [...read('src/shared/utils/generated-message-keys.utils.ts')
    .matchAll(/^\s+"([^"]+)"/gm)].map((match) => match[1]);

  assert.deepEqual(generated, Object.keys(english).sort());
  for (const locale of ['de', 'en', 'es', 'pt_BR', 'ru', 'zh_CN']) {
    const catalog = JSON.parse(read(`public/_locales/${locale}/messages.json`));
    assert.deepEqual(Object.keys(catalog).sort(), generated, `${locale}: mismatched keys`);
    for (const [key, translation] of Object.entries(catalog)) {
      assert.ok(translation.message?.trim(), `${locale}: empty translation ${key}`);
      assert.deepEqual(placeholders(translation.message), placeholders(english[key].message), `${locale}: placeholders for ${key}`);
      if (key.startsWith('source')) {
        assert.equal(translation.message, english[key].message, `${locale}: changed portal source text for ${key}`);
      }
    }
  }
});
