# Contributing to VacNet++

[English](#english) · [Русский](#русский)

Thanks for helping improve VacNet++! Bug reports, suggestions, documentation fixes, and pull requests are welcome.

## English

### Before you start

- Check [existing issues](https://github.com/pensiya5/vacnet-plus-plus/issues) before reporting a bug or proposing a feature.
- For larger changes, open an issue first to discuss the approach.
- Follow our [Code of Conduct](CODE_OF_CONDUCT.md).
- **Security vulnerabilities must be reported privately** according to our [Security Policy](SECURITY.md), not in public issues.

### Set up the project

You need **Node.js 22.12+** and npm. The application lives in the `extension/` directory:

```bash
git clone https://github.com/pensiya5/vacnet-plus-plus.git
cd vacnet-plus-plus/extension
npm ci
npm run check
```

Development builds:

```bash
npm run dev
npm run dev:firefox
```

For browser integration tests, install Chromium with `npx playwright install chromium`, then run `npm run check:all`.

See the [development guide](../extension/docs/DEVELOPMENT.md) for more details.

### Make a contribution

1. Fork the repository and create a descriptive branch for your change.
2. Keep changes focused. Follow existing **TypeScript, WXT, and Preact** patterns rather than rewriting unrelated code.
3. Add or update tests for behavior changes. Use synthetic test data, never real VACNet accounts or private clips.
4. When adding or changing translation keys, update both `extension/public/_locales/en/messages.json` and `extension/public/_locales/ru/messages.json`, then run `npm run generate:i18n`.
5. Run `npm run check` from `extension/` (and relevant browser tests when needed).
6. Open a pull request to `main`. Explain **what changed**, **why**, and **which checks passed**. Include redacted screenshots for visible UI changes.

Keep commit messages short and meaningful, e.g. `fix: preserve playback state` or `docs: improve installation guide`.

### Safety and compatibility

- Preserve Chrome/Chromium and Firefox compatibility and the portal's existing confirmation requirements.
- Do not add unnecessary permissions, tracking, or remote uploads of local history.
- Never include live invitation/guest links, credentials, session tokens, or personal data in code, issues, test fixtures, or screenshots.
- Do not automate real VACNet verdict submissions or probe third-party infrastructure.
- Keep the repository root minimal; application code belongs under `extension/`.

---

## Русский

Спасибо за интерес к VacNet++! Мы рады сообщениям об ошибках, идеям, улучшениям документации и Pull Requests.

### Перед началом

- Проверьте [существующие Issues](https://github.com/pensiya5/vacnet-plus-plus/issues), чтобы избежать дубликатов.
- Крупные изменения лучше сначала обсудить в Issue.
- Соблюдайте [правила сообщества](CODE_OF_CONDUCT.md).
- **Об уязвимостях сообщайте приватно** по [политике безопасности](SECURITY.md), не раскрывая детали в открытых Issues.

### Запуск проекта

Нужны **Node.js 22.12+** и npm. Исходники находятся в папке `extension/`:

```bash
git clone https://github.com/pensiya5/vacnet-plus-plus.git
cd vacnet-plus-plus/extension
npm ci
npm run check
```

Для разработки: `npm run dev` (Chromium) или `npm run dev:firefox` (Firefox).

Для браузерных тестов: `npx playwright install chromium`, затем `npm run check:all`.

Подробнее — в [руководстве разработчика](../extension/docs/DEVELOPMENT.md).

### Как предложить изменение

1. Создайте Fork репозитория и отдельную ветку с понятным названием.
2. Вносите небольшие, связанные с задачей изменения. Сохраняйте существующий стиль TypeScript, WXT и Preact.
3. Если меняется поведение, добавьте или обновите тесты с искусственными данными.
4. При изменении ключей перевода обновляйте оба каталога `extension/public/_locales/en/messages.json` и `extension/public/_locales/ru/messages.json`, затем запускайте `npm run generate:i18n`.
5. Запустите `npm run check` из `extension/` и необходимые браузерные тесты.
6. Откройте Pull Request в `main`: кратко опишите изменения, их причину и результаты проверок. Для интерфейса прикладывайте скриншоты без приватных данных.

Используйте короткие сообщения коммитов, например `fix: restore video controls`.

### Безопасность

- Сохраняйте совместимость с Chromium и Firefox и штатные ограничения портала.
- Не добавляйте лишние разрешения, телеметрию или передачу локальной истории на сервер.
- Не публикуйте действующие ссылки приглашений, токены, пароли, персональные данные и приватные клипы.
- Не автоматизируйте реальные отправки вердиктов VACNet и не тестируйте сторонние сервисы без разрешения.
- Сохраняйте минималистичную структуру корня; код расширения должен оставаться в `extension/`.
