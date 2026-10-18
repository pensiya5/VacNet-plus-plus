# AGENTS.md — VacNet++

Guidelines for AI coding agents working in this directory.

## Project

VacNet++ is an open-source browser extension for the Counter-Strike 2 VACNet review portal. It improves the review interface, video controls, verdict presets, local clip history, and statistics. It does **not** grant portal access or independently detect cheating.

The repository root contains the public `README.md` and repository metadata. **The application root is `extension/`**; run all npm commands from there.

## Stack and layout

- **TypeScript**, **WXT**, **Preact**, Manifest V3.
- `entrypoints/` — content scripts and background entry points.
- `src/app/` — application bootstrap and orchestration.
- `src/features/` — feature-specific logic and UI.
- `src/entities/` — domain models and validation schemas.
- `src/shared/` — shared components, messaging, services, and utilities.
- `public/_locales/` — English and Russian message catalogs.
- `tests/` — Vitest, Node tests, fixtures, and Playwright browser tests.
- `docs/DEVELOPMENT.md` — development and release-build instructions.

Follow existing naming conventions and architecture. Prefer small, targeted changes over broad refactors. Do not introduce dependencies without a concrete reason.

## Commands

Run from `extension/`:

```sh
npm ci
npm run typecheck
npm test
npm run build:all
npm run check
```

- `npm run check` runs the TypeScript check, both browser builds, and tests.
- `npx playwright install chromium` then `npm run test:browser` runs browser scenarios; `npm run check:all` includes these checks.
- `npm run generate:i18n` regenerates typed message keys after changing translation keys.
- `npm run dev` / `npm run dev:firefox` starts the corresponding development build.

Do not manually edit generated outputs such as `.wxt/`, `.output/`, or generated translation-key files. Regenerate them with the appropriate command.

## Changes and testing

1. Read the relevant feature, adjacent code, and tests before editing.
2. Preserve Chrome/Chromium and Firefox behavior, including Manifest V3 permissions and the browser-specific configuration.
3. Keep review and verdict submission behavior compatible with the host portal. Never bypass the portal's confirmation or availability checks.
4. For bug fixes and new behavior, add or update focused tests; use synthetic page fixtures.
5. If translation keys change, update **both** `public/_locales/en/messages.json` and `public/_locales/ru/messages.json`, then run `npm run generate:i18n`.
6. Run relevant checks and report which ones passed or could not be run. Do not claim a passing build without verification.
7. Keep commits concise and descriptive; avoid unrelated formatting or file churn.

## Safety and privacy

- Treat VACNet URLs, invitation and guest links, clip identifiers, session tokens, and imported/exported history as potentially sensitive.
- Never put real access links, account data, or tokens in code, fixtures, screenshots, logs, or public issues.
- Do not add telemetry, remote storage of verdicts/history, or new host permissions without explicit justification and approval.
- Use local synthetic tests only; do **not** automate real portal submissions, access other users' accounts, or probe Valve services.
- Keep the extension's role as a reviewer aid, not an automated cheat detector or verdict bot.

## Repository hygiene

- Preserve the minimal top-level structure; keep app code and app-specific documentation under `extension/`.
- Check links when moving docs or assets. The public README lives one directory above this file.
- Security reports follow [the repository security policy](../.github/SECURITY.md); routine issues use the Issue templates.
- For substantial changes, summarize what changed, any compatibility risks, and the checks performed.
