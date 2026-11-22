import { afterEach, expect, it, vi } from 'vitest';
import { createCatalog, getMessage } from '../src/shared/services/i18n.service';
import { readValveClip } from '../src/features/valve-interop/clip.parser';

afterEach(() => vi.restoreAllMocks());

it.each([
  ['en-GB', 'en'],
  ['ru-RU', 'ru'],
  ['es-MX', 'es'],
  ['pt-PT', 'pt-BR'],
  ['de-AT', 'de'],
  ['zh-Hans-CN', 'zh-CN'],
  ['zh-Hant-TW', 'en'],
  ['fr-FR', 'en'],
])('chooses the review UI locale for %s', (language, locale) => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
  const catalog = createCatalog();
  expect(catalog.videoJsLocale).toBe(locale);
  expect(catalog.cheatingYes).toBe(getMessage('cheatingYes'));
  expect(catalog.sourceBtnConfirm).toBe('Confirm');
});

it('uses English UI strings and substitutes values without extension APIs', () => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
  expect(createCatalog().btnConfirm).toBe('Confirm');
  expect(getMessage('updateAvailable', '5.0')).toBe('Version 5.0 is available');
});

it.each(['App', 'Aplicación'])('reads the clip app ID from the %s label after localization', async (label) => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-MX');
  const document = new DOMParser().parseFromString(`
    <form id="submitverdictform"><input name="verdict_task" value="synthetic-task"></form>
    <video id="video" data-start-time="0" data-end-time="12" data-event-time="3"
      src="https://replay-video.valve.net/synthetic/example.webm"></video>
    <table class="detailstable">
      <tr><td>Other field</td><td>123</td></tr>
      <tr><td>Another field</td><td>456</td></tr>
      <tr><td>${label}</td><td>440</td></tr>
    </table>
  `, 'text/html');
  const clip = await readValveClip(document, 'https://www.counter-strike.net/vacnet/clips', async () => null);
  expect(clip.app).toBe('440');
});
