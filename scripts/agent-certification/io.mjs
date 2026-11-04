import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const JSON_LIMIT = 64 * 1024;
export const FILE_LIMIT = 64 * 1024;
export const TARBALL_LIMIT = 64 * 1024 * 1024;

export class HarnessError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function requireInput(condition, code = 'INVALID_INPUT') {
  if (!condition) throw new HarnessError(code);
}
export function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function jsonBytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n'); }
export function valueDigest(value) { return digest(jsonBytes(value)); }

// Explicit local inputs only. Reject links in every component, including the
// root, instead of accepting a realpath that silently leaves the chosen scope.
export async function canonicalDirectory(path) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    requireInput(info.isDirectory() && !info.isSymbolicLink(), 'UNSAFE_PATH');
  }
  requireInput(await realpath(absolute) === absolute, 'UNSAFE_PATH');
  return absolute;
}
export function scopedPath(root, name) {
  requireInput(typeof name === 'string' && name.length <= 240 && !isAbsolute(name)
    && name.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/.test(part)), 'UNSAFE_PATH');
  const path = resolve(root, name);
  requireInput(relative(root, path) !== '' && !relative(root, path).startsWith('..' + sep), 'UNSAFE_PATH');
  return path;
}

// O_NONBLOCK avoids a FIFO swap blocking open. O_NOFOLLOW, identity checks and
// bounded descriptor reads cover links, devices, growth and replacement. This
// is best-effort local inspection, not an atomic snapshot of a hostile host.
export async function readRegular(path, limit = FILE_LIMIT) {
  await canonicalDirectory(dirname(path));
  const before = await lstat(path);
  requireInput(before.isFile() && !before.isSymbolicLink() && before.nlink === 1, 'UNSAFE_FILE');
  requireInput(before.size <= limit, 'INPUT_TOO_LARGE');
  const file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await file.stat();
    requireInput(info.isFile() && info.nlink === 1 && info.dev === before.dev && info.ino === before.ino
      && info.size === before.size, 'INPUT_CHANGED');
    const bytes = Buffer.alloc(Math.min(limit, info.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    requireInput(length <= limit, 'INPUT_TOO_LARGE');
    const after = await file.stat();
    const pathAfter = await lstat(path);
    requireInput(length === info.size && info.size === after.size && info.mtimeMs === after.mtimeMs
      && info.ctimeMs === after.ctimeMs && pathAfter.dev === info.dev && pathAfter.ino === info.ino
      && !pathAfter.isSymbolicLink(), 'INPUT_CHANGED');
    return bytes.subarray(0, length);
  } finally { await file.close(); }
}
export function utf8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new HarnessError('INVALID_UTF8'); }
}
export async function readJson(path, schema) {
  let value;
  try { value = JSON.parse(utf8(await readRegular(path, JSON_LIMIT))); }
  catch (error) {
    if (error instanceof HarnessError) throw error;
    // Never reflect paths, input, Zod issues, or native error messages.
    throw new HarnessError('INVALID_JSON');
  }
  const result = schema.safeParse(value);
  requireInput(result.success, 'INVALID_RECORD');
  return result.data;
}
export async function entries(path) {
  await canonicalDirectory(path);
  const result = [];
  const directory = await opendir(path);
  for await (const entry of directory) {
    requireInput(result.length < 64, 'TOO_MANY_ENTRIES');
    result.push(entry.name);
  }
  return result.sort();
}
export async function tarballDigest(path) {
  requireInput(typeof path === 'string' && path.endsWith('.tgz'), 'INVALID_TARBALL');
  const bytes = await readRegular(resolve(path), TARBALL_LIMIT);
  requireInput(bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 8, 'INVALID_TARBALL');
  // Hash only. Do not extract, install, load modules or execute lifecycle hooks.
  return digest(bytes);
}
