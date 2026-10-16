import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const testDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test');
const testFiles = readdirSync(testDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => join(testDir, f));

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
});

process.exit(result.status ?? 0);
