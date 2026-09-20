#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const scanRoots = ['outputs', 'dist'];
const forbidden = [
  { name: 'private key', pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i },
  { name: 'bearer token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i },
  { name: 'github token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { name: 'OpenAI token', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'absolute Windows user path', pattern: /[A-Za-z]:[\\/]Users[\\/]/i },
  { name: 'absolute POSIX user path', pattern: /(?:^|[\s"'])\/(?:Users|home)\/[A-Za-z0-9._-]+/i },
];

async function filesUnder(path) {
  try {
    const info = await stat(path);
    if (info.isFile()) return [path];
    if (!info.isDirectory()) return [];
  } catch { return []; }
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(child));
    else if (entry.isFile() && /\.(?:html|json|md)$/i.test(entry.name)) result.push(child);
  }
  return result;
}

const files = (await Promise.all(scanRoots.map(name => filesUnder(join(root, name))))).flat();
const findings = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const rule of forbidden) if (rule.pattern.test(text)) findings.push(`${relative(root, file)}: ${rule.name}`);
}
if (findings.length) {
  console.error(`Redaction check failed (${findings.length} finding${findings.length === 1 ? '' : 's'}):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Redaction check passed (${files.length} exported artifact${files.length === 1 ? '' : 's'} scanned).`);
}
