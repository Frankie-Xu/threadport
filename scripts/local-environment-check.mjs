import { execFileSync, spawnSync } from 'node:child_process';
import { platform, arch, release } from 'node:os';

function run(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 3000,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout ?? '').trim();
}

function version(command, args = ['--version']) {
  const output = run(command, args);
  return output ? output.split(/\r?\n/, 1)[0].slice(0, 160) : null;
}

function available(command) {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const args = [command];
  return Boolean(run(locator, args));
}

function gitValue(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const docker = available('docker')
  ? { available: true, version: version('docker'), server: run('docker', ['info', '--format', '{{.ServerVersion}} {{.OSType}}/{{.Architecture}}']) }
  : { available: false, version: null, server: null };

const result = {
  schema: 'threadport.local-environment.v1',
  collectedAt: new Date().toISOString(),
  candidateSha: gitValue(['rev-parse', 'HEAD']),
  runtime: { node: process.version, npm: version('npm'), platform: platform(), arch: arch(), kernel: release() },
  tools: {
    docker,
    codex: { available: available('codex'), version: version('codex') },
    claude: { available: available('claude'), version: version('claude') },
  },
  localChecks: {
    source: 'npm run check',
    browser: 'THREADPORT_TEST_CHROME=1 npm run test:e2e',
    package: 'THREADPORT_TEST_CHROME=1 npm run test:package',
    linuxContainer: 'git archive HEAD | docker run --rm -i -w /work node:24-bookworm bash -lc "tar -x && npm ci && npm run check"',
  },
  externalOnly: ['windows-node24-ci', 'real-agent-continuation', 'original-36-scenario-attachment', 'external-user-observation'],
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`candidate ${result.candidateSha ?? 'unknown'}\n`);
  process.stdout.write(`runtime ${result.runtime.node} ${result.runtime.platform}/${result.runtime.arch}\n`);
  process.stdout.write(`docker ${docker.server ?? 'unavailable'}\n`);
  process.stdout.write(`codex ${result.tools.codex.version ?? 'unavailable'}\n`);
  process.stdout.write(`claude ${result.tools.claude.version ?? 'unavailable'}\n`);
}
