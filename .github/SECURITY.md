# Security Policy / Политика безопасности

[English](#english) · [Русский](#русский)

## English

### Supported versions

Security fixes are considered for the **latest stable release** of VacNet++ (currently **4.5.0**). Older releases are not actively maintained. Please update to the [latest release](https://github.com/pensiya5/vacnet-plus-plus/releases/latest) before reporting an issue. Security maintenance is best-effort; there is no guaranteed response or fix timeline.

### Reporting a vulnerability

**Do not disclose security vulnerabilities in public GitHub Issues, Discussions, pull requests, or comments.**

1. Open the repository's [Security Advisories](https://github.com/pensiya5/vacnet-plus-plus/security/advisories).
2. Select **Report a vulnerability**, if available, to submit a **private** report to the maintainers.
3. Include the affected VacNet++ version, browser and version, a clear impact description, reproduction steps, and a minimal proof of concept that does not expose private user data.

If **Report a vulnerability** is unavailable, private vulnerability reporting has not been enabled. Please do not post the details publicly; request a private contact method from the maintainer without disclosing the vulnerability itself.

Please allow maintainers an opportunity to investigate and prepare a fix before public disclosure. Reports are reviewed on a best-effort basis.

### Scope and safe reporting

Examples of relevant security issues in **VacNet++** include:

- Exposure of VACNet invitation/guest links, credentials, session tokens, or locally stored review data.
- Cross-site scripting or unsafe handling of untrusted content by the extension.
- Unintended or unauthorized review/answer submission caused by the extension.
- Insecure import/export of clip history, extension permissions, or update/install flows.

**Never include** real invitation links, guest-access URLs, tokens, account credentials, private clips, personal information, or unredacted console logs/screenshots in a report. Use synthetic test data and redact identifiers.

Test only with systems and accounts you own or are explicitly authorized to use. Do not probe or attack the live VACNet service, Valve infrastructure, or other people's accounts. Issues in third-party services are outside the scope of this project's security policy and should be reported to the relevant vendor.

For ordinary bugs and feature requests, use [GitHub Issues](https://github.com/pensiya5/vacnet-plus-plus/issues/new/choose).

---

## Русский

### Поддерживаемые версии

Исправления безопасности рассматриваются для **последнего стабильного релиза** VacNet++ (сейчас **4.5.0**). Старые версии активно не поддерживаются. Перед отправкой отчёта обновитесь до [последнего релиза](https://github.com/pensiya5/vacnet-plus-plus/releases/latest). Поддержка осуществляется по возможности, без гарантированных сроков ответа или исправления.

### Как сообщить об уязвимости

**Не публикуйте информацию об уязвимостях в открытых Issues, Discussions, Pull Requests и комментариях.**

1. Перейдите в [Security Advisories](https://github.com/pensiya5/vacnet-plus-plus/security/advisories) репозитория.
2. Если доступна кнопка **Report a vulnerability**, отправьте через неё **приватный** отчёт.
3. Укажите версию VacNet++, браузер и его версию, последствия проблемы, шаги воспроизведения и безопасный минимальный пример без конфиденциальных данных.

Если кнопки **Report a vulnerability** нет, приватные отчёты ещё не включены. Не публикуйте детали уязвимости открыто; запросите у сопровождающего проекта приватный способ связи, не раскрывая саму проблему.

Дайте сопровождающим возможность разобраться в проблеме и подготовить исправление до публичного раскрытия. Отчёты обрабатываются по возможности.

### Что относится к безопасности

Например:

- Утечка ссылок приглашений и гостевого доступа VACNet, учётных данных, токенов сессии или локальной истории проверок.
- XSS и небезопасная обработка недоверенных данных расширением.
- Непреднамеренная или неавторизованная отправка вердикта из-за расширения.
- Небезопасный импорт/экспорт истории, разрешения расширения или механизмы установки и обновления.

**Не прикладывайте** настоящие ссылки приглашений, гостевые URL, токены, пароли, приватные клипы, персональные данные и скриншоты/логи без удаления секретов. Используйте тестовые данные.

Проверяйте проблемы только на своих системах и аккаунтах либо при наличии явного разрешения. Не тестируйте атаки на рабочий портал VACNet, инфраструктуру Valve или чужие аккаунты. Уязвимости сторонних сервисов следует сообщать их владельцам.

Для обычных ошибок и предложений используйте [GitHub Issues](https://github.com/pensiya5/vacnet-plus-plus/issues/new/choose).
