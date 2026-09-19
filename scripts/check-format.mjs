import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const roots = ['src', 'web/src', 'tests', 'scripts'];
const extensions = new Set(['.ts', '.tsx', '.mjs', '.mts']);
const failures = [];

async function walk(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/[ \t]+$/.test(line)) failures.push(`${path}:${index + 1}: trailing whitespace`);
        if (/\r/.test(line)) failures.push(`${path}:${index + 1}: carriage return`);
      });
    }
  }
}

for (const directory of roots) await walk(join(root, directory));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Format gate: ${roots.join(', ')} have no trailing whitespace or mixed line endings.`);
}
