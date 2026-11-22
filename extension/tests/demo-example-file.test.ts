import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDemoPluginCode } from '../src/features/plugins/demo-plugin';
import { createCatalog } from '../src/shared/services/i18n.service';

// The paste-ready example ships twice: as the PluginManager demo string and as
// a standalone file under docs/examples. Fail the build when they diverge.
it('keeps the copy-paste example file in sync with the demo plugin source', () => {
  const stored = readFileSync(join(process.cwd(), 'docs', 'examples', 'review-timer.js'), 'utf8');
  const catalog = createCatalog();
  const code = createDemoPluginCode(catalog.pluginDemoTimer, catalog.pluginDemoTimerCurrent, catalog.pluginDemoTimerAverage);
  expect(stored).toBe(`${code}\n`);
});
