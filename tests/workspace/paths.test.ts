import { describe, expect, it } from 'vitest';
import { portablePath } from '../../src/workspace/paths.js';

describe('source-platform portable paths', () => {
  it.each([
    ['posix', '/repo', '/repo/src/a/index.ts', 'src/a/index.ts'],
    ['posix', '/repo', '/repo/src/b/index.ts', 'src/b/index.ts'],
    ['posix', '/repo', 'src/目录/a file.ts', 'src/目录/a file.ts'],
    ['posix', '/repo', 'src/../a.ts', 'a.ts'],
    ['posix', '/repo', '/repo', '.'],
    ['posix', '/repo', 'src/back\\slash.ts', 'src/back\\slash.ts'],
    ['win32', 'C:\\repo', 'c:/repo/src/a/index.ts', 'src/a/index.ts'],
    ['win32', 'C:\\repo', 'src\\目录\\a file.ts', 'src/目录/a file.ts'],
    ['win32', 'C:\\repo', 'C:\\repo\\src\\..\\a.ts', 'a.ts'],
    ['win32', '\\\\server\\share\\repo', '\\\\SERVER\\share\\repo\\src\\a.ts', 'src/a.ts'],
    ['win32', '//server/share/repo', '//server/share/repo/src/a.ts', 'src/a.ts'],
  ] as const)('%s: %s + %s retains relative identity', (platform, root, value, expected) => {
    expect(portablePath(value, root, platform)).toBe(expected);
  });

  it.each([
    ['posix', '/repo', '/repo-other/private/a.ts'],
    ['posix', '/repo', '../private/a.ts'],
    ['posix', '/repo', 'C:\\Users\\synthetic\\private.ts'],
    ['posix', '/repo', 'C:private.ts'],
    ['win32', 'C:\\repo', 'D:\\private\\a.ts'],
    ['win32', 'C:\\repo', 'C:private.ts'],
    ['win32', 'C:\\repo', '\\repo\\private.ts'],
    ['win32', 'C:\\repo', '/repo/private.ts'],
    ['win32', 'C:\\repo', '..\\private\\a.ts'],
    ['win32', '\\\\server\\share\\repo', '\\\\server\\other\\private.ts'],
    ['win32', 'C:\\repo', '\\\\?\\C:\\repo\\private.ts'],
    ['posix', '.', 'private.ts'],
    ['win32', 'repo', 'private.ts'],
    ['win32', '/repo', 'private.ts'],
    ['posix', '/repo', ''],
    ['posix', '/repo', 'bad\0path'],
  ] as const)('%s: %s + %s is opaque when outside or ambiguous', (platform, root, value) => {
    const locator = portablePath(value, root, platform);
    expect(locator).toMatch(/^external\/[a-f0-9]{24}$/);
    expect(portablePath(value, root, platform)).toBe(locator);
  });

  it('distinguishes external relative paths from different source roots', () => {
    expect(portablePath('../private.ts', '/a/repo', 'posix'))
      .not.toBe(portablePath('../private.ts', '/b/repo', 'posix'));
  });
});
