import { writeFile, chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { detectTargets, suggestedLaunch } from '../src/targets.js';
import { temporary } from './helpers.js';

describe('filesystem-only target discovery', () => {
  it('detects executables without launching them', async () => {
    const path = await temporary(); const command = join(path, 'codex');
    await writeFile(command, '#!/bin/sh\nexit 99\n'); await chmod(command, 0o700);
    const targets = await detectTargets({ path, platform: 'linux' });
    expect(targets.find(t => t.agent === 'codex')).toMatchObject({ available: true, launch_supported: false });
    expect(targets.find(t => t.agent === 'claude')?.available).toBe(false);
  });
  it('uses Windows PATH and PATHEXT rules without where.exe', async () => {
    const path = await temporary(); await writeFile(join(path, 'codex.cmd'), 'not executable code');
    const targets = await detectTargets({ path, platform: 'win32', pathExt: '.CMD;.EXE' });
    expect(targets.find(t => t.agent === 'codex')?.available).toBe(true);
  });
  it('does not treat a directory as a command or invent executable launch strings', async () => {
    const path = await temporary(); await mkdir(join(path, 'codex'));
    expect((await detectTargets({ path, platform: 'linux' })).find(t => t.agent === 'codex')?.available).toBe(false);
    expect(() => suggestedLaunch('codex', '/tmp/$(command).md')).toThrow(/not supported/i);
  });
});
