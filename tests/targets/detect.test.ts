import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CodexRunner } from '../../src/targets/codex.js';

const HELP = 'Usage: codex [OPTIONS] [PROMPT]\nOptions: --cd <DIR>\n';
const RESUME_HELP = 'Usage: codex resume [OPTIONS] [SESSION_ID] [PROMPT]\nOptions: --cd <DIR>\n';

async function fakeCodexRoot() {
  const root = await mkdtemp(join(tmpdir(), 'threadport-target-detect-'));
  const executable = join(root, process.platform === 'win32' ? 'codex.exe' : 'codex');
  await writeFile(executable, 'synthetic executable');
  await chmod(executable, 0o755);
  return root;
}

function probe(version: string) {
  return async (_executable: string, args: string[]) => {
    if (args[0] === '--version') return `codex-cli ${version}\n`;
    if (args[0] === 'resume') return RESUME_HELP;
    return HELP;
  };
}

it('accepts the current Codex 0.155 interface and native resume help', async () => {
  const root = await fakeCodexRoot();
  const capability = await new CodexRunner({ path: root, probe: probe('0.155.0-alpha.9') }).detect();
  expect(capability).toMatchObject({
    installed: true,
    version: '0.155.0-alpha.9',
    newSessionWithContext: true,
    nativeResume: true,
    reason: null,
  });
});

it('keeps an unknown Codex version unverified even when its executable exists', async () => {
  const root = await fakeCodexRoot();
  const capability = await new CodexRunner({ path: root, probe: probe('0.156.0-alpha.1') }).detect();
  expect(capability).toMatchObject({ installed: true, version: '0.156.0-alpha.1', reason: 'unverified_version' });
  expect(capability.newSessionWithContext).toBe(false);
  expect(capability.nativeResume).toBe(false);
});
