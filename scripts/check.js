import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const ignored = new Set([
  'node_modules',
  '.git',
  'data',
  'test-results',
  'playwright-report',
  'report-planning',
  'output',
  'release',
]);
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      ignored.has(entry.name) ||
      entry.name.startsWith('.local-credentials') ||
      entry.name === '.env'
    )
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push(path);
  }
}
walk('.');
let failures = 0;
for (const file of files) {
  if (
    /\.(js|json|md|css|html|svg|example|yml|yaml)$/.test(file) &&
    readFileSync(file, 'utf8').includes(String.fromCharCode(0x2014))
  ) {
    console.error(`Disallowed em dash: ${file}`);
    failures++;
  }
  if (file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      console.error(result.stderr);
      failures++;
    }
  }
}
if (failures) process.exit(1);
console.log(
  `Checked ${files.length} project files: JavaScript syntax is valid and no em dashes were found.`,
);
