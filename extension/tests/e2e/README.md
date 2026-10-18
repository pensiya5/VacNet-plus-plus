# Browser integration tests

```sh
npm ci
npx playwright install chromium
npm run build
npx playwright test
```

The tests load the **actual `.output/chrome-mv3` extension**, including its
background service worker and both content-script worlds, into bundled Chromium.
Each test creates and removes a fresh temporary browser profile. Existing Chrome
profiles, account cookies and extension data are never opened or modified.

The portal and a generated playable WebM are served from synthetic intercepted
responses. The synthetic portal implements native radio selection, cancellation,
confirmation delay and navigation to the next task. It records submissions
locally; network requests outside the fixtures are blocked. No production VACNET
submission is made.

The normal release test intercepts the **worker's HTTP response using CDP**.
It does not replace `fetch`, the update checker, runtime messaging or storage.
Consequently an unbound native fetch/`Illegal invocation` regression fails the
test even with deterministic GitHub data. It also checks the resulting UI link
and that an immediate second check reuses the background cache.

For an additional public GitHub smoke test, opt in explicitly:

```powershell
$env:VACNET_E2E_LIVE_UPDATES = '1'
npx playwright test --grep '\[live\]'
```

This calls the public `pensiya5/VacNetPlusPlus` latest-release API without
credentials, using the installed background worker. A missing stable release,
network outage or GitHub rate limit causes that opt-in test to fail. Other tests
stay deterministic even when this environment variable is set.

Set `VACNET_E2E_HEADED=1` to inspect the isolated test browser. Failure screenshots
are written to `test-results/browser`. The full Chromium channel is required;
Chrome/Edge branded channels and the headless shell are not substitutes for
loading an unpacked extension.

If downloaded Chromium cannot start on Windows (for example a SideBySide assembly
error), a recent installed Chrome can be used explicitly:

```powershell
$env:VACNET_E2E_CHROME_EXECUTABLE = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npx playwright test
```

This still creates a new temporary profile. It loads the same built extension
through the browser CDP `Extensions.loadUnpacked` API with extension debugging
enabled; it does not use Chrome's disabled command-line loading switch. The
default CI path continues to use Playwright's bundled full Chromium.
