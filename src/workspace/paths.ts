import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';

export type SourcePlatform = 'posix' | 'win32';

/** Legacy callers have a local root; explicit source adapters should pass their platform. */
export function sourcePlatformForRoot(root: string): SourcePlatform {
  return /^(?:[A-Za-z]:|[\\/]{2})/.test(root) ? 'win32' : 'posix';
}

function fullyQualifiedWindows(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(value);
}

/** Lexical identity only: no filesystem access, symlink resolution, cwd, or drive environment. */
export function relativeInside(value: string, sourceRoot: string, sourcePlatform: SourcePlatform): string | undefined {
  if (!value || !sourceRoot || /\0/.test(value + sourceRoot)) return undefined;
  const api = sourcePlatform === 'win32' ? win32 : posix;
  if (sourcePlatform === 'win32') {
    // Device namespaces and drive-relative/root-relative paths need information we do not have.
    if (/^[\\/]{2}[?.][\\/]/.test(value) || /^[\\/]{2}[?.][\\/]/.test(sourceRoot)) return undefined;
    if (!fullyQualifiedWindows(sourceRoot)) return undefined;
    if (/^(?:[A-Za-z]:|[\\/])/.test(value) && !fullyQualifiedWindows(value)) return undefined;
  } else {
    if (!posix.isAbsolute(sourceRoot) || /^[A-Za-z]:|^\\\\/.test(value)) return undefined;
  }
  const root = api.normalize(sourceRoot);
  const absolute = api.isAbsolute(value) ? api.normalize(value) : api.join(root, value);
  const relative = api.relative(root, absolute);
  if (relative === '..' || relative.startsWith(`..${api.sep}`) || api.isAbsolute(relative)) return undefined;
  return relative.split(api.sep).join('/') || '.';
}

/** External relative locators include source context so unrelated roots cannot share identity. */
export function portablePath(value: string, sourceRoot: string, sourcePlatform: SourcePlatform): string {
  const relative = relativeInside(value, sourceRoot, sourcePlatform);
  if (relative !== undefined) return relative;
  // Preserve existing opaque IDs for absolute paths; ambiguous/relative paths need a namespace.
  const absolute = fullyQualifiedWindows(value) || posix.isAbsolute(value);
  const identity = absolute ? value : JSON.stringify([sourcePlatform, sourceRoot, value]);
  return `external/${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}
