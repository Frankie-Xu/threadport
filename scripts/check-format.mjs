import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const DEFAULT_ROOTS = ['src', 'web/src', 'tests', 'scripts'];
const extensions = new Set(['.ts', '.tsx', '.mjs', '.mts']);

async function walk(directory, failures) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, failures);
    else if (extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      // Keep carriage returns in each line so CRLF files are reported instead
      // of being normalized away before the check runs.
      const lines = (await readFile(path, 'utf8')).split('\n');
      lines.forEach((line, index) => {
        if (/[ \t]+$/.test(line)) failures.push(`${path}:${index + 1}: trailing whitespace`);
        if (/\r/.test(line)) failures.push(`${path}:${index + 1}: carriage return`);
      });
    }
  }
}

export async function checkFormat(root = process.cwd(), roots = DEFAULT_ROOTS) {
  const failures = [];
  for (const directory of roots) await walk(join(root, directory), failures);
  return failures;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const failures = await checkFormat();
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Format gate: ${DEFAULT_ROOTS.join(', ')} have no trailing whitespace or mixed line endings.`);
  }
}
