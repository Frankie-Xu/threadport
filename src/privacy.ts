import { createHash } from 'node:crypto';
import { posix, win32, resolve } from 'node:path';
import type { Capsule } from './types.js';
import { redactSecrets } from './redact.js';

const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 24);
const windows = (path: string) => /^[A-Za-z]:[\\/]|^\\\\/.test(path);

/** Relative files retain their directories; external paths never collapse to a basename. */
export function portablePath(value: string, root: string): string {
  const api = windows(root) ? win32 : posix;
  if (windows(value) && !windows(root)) return `external/${digest(value)}`;
  const canonicalRoot = api.resolve(root);
  const rel = api.relative(canonicalRoot, api.resolve(canonicalRoot, value));
  if (rel === '..' || rel.startsWith(`..${api.sep}`) || api.isAbsolute(rel)) return `external/${digest(value)}`;
  return rel.split(api.sep).join('/') || '.';
}

function mapStrings(value: unknown, transform: (text: string, key: string) => string, key = ''): unknown {
  if (typeof value === 'string') return transform(value, key);
  if (Array.isArray(value)) return value.map(v => mapStrings(v, transform, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, transform, k)]));
  return value;
}

/** Pairing identifiers remain intact until tool results have been correlated. */
export function redactRecords<T>(records: T): { records: T; count: number } {
  let count = 0;
  const protectedRecords = mapStrings(records, (text, key) => {
    if (['id', 'call_id', 'tool_use_id', 'sessionId', 'session_id'].includes(key)) return text;
    const result = redactSecrets(text); count += result.count; return result.text;
  });
  return { records: protectedRecords as T, count };
}

/** Session IDs are opaque whenever normalizing them would lose information or expose a secret. */
export function safeSessionId(value: string): string {
  if (redactSecrets(value).count || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) return `session-${digest(value)}`;
  return value;
}

export function protectCapsule(input: Capsule, privacy: 'local' | 'portable', roots: string[], priorCount = 0): Capsule {
  let count = priorCount;
  const capsule = structuredClone(input);
  const rawId = capsule.source_session_id ?? capsule.id;
  capsule.id = safeSessionId(rawId);
  capsule.source_session_id = safeSessionId(rawId);
  count += redactSecrets(rawId).count;
  if (capsule.project.repository) {
    const url = new URL(capsule.project.repository);
    if (url.username || url.password) { url.username = ''; url.password = ''; count++; }
    capsule.project.repository = url.href;
  }
  const root = roots[0] ?? resolve('.');
  const paths = new Map<string, string>();
  if (privacy === 'portable') {
    for (const file of capsule.files) {
      paths.set(file.path, portablePath(file.path, root));
      file.path = portablePath(file.path, root);
    }
    for (const evidence of capsule.evidence) {
      if (evidence.locator && (evidence.kind === 'session' || evidence.kind === 'file')) {
        const mapped = portablePath(evidence.locator, root);
        paths.set(evidence.locator, mapped);
        evidence.locator = mapped;
      }
    }
    for (const value of roots) if (value !== '.') paths.set(value, '.');
    capsule.project.root = '.'; capsule.git.root = '.';
  }
  const replacements = [...paths].filter(([from, to]) => from !== to).sort((a, b) => b[0].length - a[0].length);
  const result = mapStrings(capsule, (text, key) => {
    // Never replace paths inside integrity fields or opaque identifiers.
    if (['id', 'source_session_id', 'head', 'dirty_diff_hash', 'created_at', 'schema_version'].includes(key)) return text;
    let value = text;
    if (privacy === 'portable' && key !== 'repository') {
      for (const [from, to] of replacements) value = value.split(from).join(to);
      // Unknown absolute filesystem paths in prose are opaque, not reconstructed as commands.
      value = value.replace(/(^|[\s"'`(=])((?:[A-Za-z]:[\\/]|\\\\)[^\s"'`<>]+|\/(?!\/)[^\s"'`<>]+)/g,
        (_, prefix: string, path: string) => `${prefix}external/${digest(path)}`);
    }
    const redacted = redactSecrets(value); count += redacted.count; return redacted.text;
  }) as Capsule;
  result.redaction = { applied: count > 0, count };
  return result;
}
