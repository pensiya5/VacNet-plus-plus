import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DEMO_PLUGIN_CODE } from '../src/features/plugins/demo-plugin';

// The paste-ready example ships twice: as the PluginManager demo string and as
// a standalone file under docs/examples. Fail the build when they diverge.
it('keeps the copy-paste example file in sync with the demo plugin source', () => {
  const stored = readFileSync(join(process.cwd(), 'docs', 'examples', 'review-timer.js'), 'utf8');
  expect(stored).toBe(`${DEMO_PLUGIN_CODE}\n`);
});
