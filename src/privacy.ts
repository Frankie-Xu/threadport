import { createHash } from 'node:crypto';
import { posix, win32, resolve } from 'node:path';
import type { Capsule } from './types.js';
import { redactSecrets } from './redact.js';

const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 24);
const windows = (path: string) => /^[A-Za-z]:[\\/]|^\\\\/.test(path);

/** Relative files retain their directories; external paths never collapse to a basename. */
export function portablePath(value: string, root: string): string {
  return relativeInside(value, root) ?? `external/${digest(value)}`;
}

function relativeInside(value: string, root: string): string | undefined {
  const api = windows(root) ? win32 : posix;
  if (windows(value) && !windows(root)) return undefined;
  const canonicalRoot = api.resolve(root);
  const rel = api.relative(canonicalRoot, api.resolve(canonicalRoot, value));
  if (rel === '..' || rel.startsWith(`..${api.sep}`) || api.isAbsolute(rel)) return undefined;
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

/** Match complete paths, never a repository-name prefix inside a sibling path. */
function portableText(text: string, paths: Map<string, string>, roots: string[]): string {
  // Relative external locators also need mapping. Absolute paths are handled below
  // as whole tokens, including traversal and quoted whitespace, in a single pass.
  const relativePaths = [...paths.keys()].filter(value => !windows(value) && !posix.isAbsolute(value) && value !== paths.get(value));
  if (relativePaths.length) {
    const escaped = relativePaths.sort((a, b) => b.length - a.length).map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const exact = new RegExp(`(^|[\\s"'\x60(=:])(${escaped.join('|')})(?=$|[\\s"'\x60<>),;])`, 'g');
    text = text.replace(exact, (_, prefix: string, value: string) => prefix + paths.get(value));
  }
  const mapPath = (value: string): string => {
    const known = paths.get(value);
    if (known !== undefined) return known;
    for (const root of roots) {
      const mapped = relativeInside(value, root);
      if (mapped !== undefined) return mapped;
    }
    return `external/${digest(value)}`;
  };
  return text.replace(/(^|[\s(=:"'`])(?:(["'`])((?:[A-Za-z]:[\\/]|\\\\|\/(?!\/))(?:(?!\2)[^\r\n])+)\2|((?:[A-Za-z]:[\\/]|\\\\|\/(?!\/))[^\s"'`<>),;]+))/g,
    (_, prefix: string, quote: string | undefined, quoted: string | undefined, bare: string | undefined) => {
      if (quoted !== undefined) return `${prefix}${quote}${mapPath(quoted)}${quote}`;
      return prefix + mapPath(bare!);
    });
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
    capsule.project.root = '.'; capsule.git.root = '.';
  }
  const result = mapStrings(capsule, (text, key) => {
    // Never replace paths inside integrity fields or opaque identifiers.
    if (['id', 'source_session_id', 'head', 'dirty_diff_hash', 'created_at', 'schema_version'].includes(key)) return text;
    let value = text;
    if (privacy === 'portable' && key !== 'repository') {
      value = portableText(value, paths, roots.length ? roots : [root]);
    }
    const redacted = redactSecrets(value); count += redacted.count; return redacted.text;
  }) as Capsule;
  result.redaction = { applied: count > 0, count };
  return result;
}
