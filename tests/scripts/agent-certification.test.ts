import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const script = resolve('scripts/agent-certification/cli.mjs');
const candidate = 'a'.repeat(40);
const sum = 'export function sum(a, b) {\n  return a + b;\n}\n';
const multiply = '\nexport function multiply(a, b) {\n  return a * b;\n}\n';
let root: string;
let tarball: string;
let counter = 0;
const sha = (label: string): string => createHash('sha256').update(label).digest('hex');

function cli(args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 5000 });
  expect(result.error).toBeUndefined();
  return { code: result.status, stdout: result.stdout, stderr: result.stderr,
    json: result.stdout.startsWith('{') ? JSON.parse(result.stdout) : null };
}
async function setup(scenario = 'A', cross = false) {
  const dir = join(root, `run-${++counter}`);
  const result = cli(['prepare', '--dir', dir, '--scenario', scenario, '--candidate', candidate, '--tarball', tarball,
    '--source-agent', 'codex', '--source-version', '0.155.0-alpha.9', '--target-agent', cross ? 'claude' : 'codex',
    '--target-version', cross ? '2.1.270' : '0.155.0-alpha.9', '--mode', cross ? 'new-session' : 'native-resume']);
  expect(result.code, result.stderr).toBe(0);
  return dir;
}
function judgment(dir: string, phase = 'final') { return cli(['judge', '--dir', dir, '--phase', phase]); }
function validation(dir: string, expectedCandidate = candidate, archive = tarball, name = 'evidence.json') {
  return cli(['validate', '--dir', dir, '--evidence', name, '--candidate', expectedCandidate, '--tarball', archive]);
}
async function template(dir: string) { return JSON.parse(await readFile(join(dir, 'evidence.template.json'), 'utf8')); }
async function save(dir: string, record: unknown) { await writeFile(join(dir, 'evidence.json'), JSON.stringify(record)); }

// These are explicitly synthetic observations. Acceptance by the format checker
// must leave trustEffect=none, even with every observation filled in by a user.
async function completed(scenario = 'A', cross = false) {
  const dir = await setup(scenario, cross);
  if (scenario === 'C') expect(cli(['drift', '--dir', dir]).code).toBe(0);
  await writeFile(join(dir, 'workspace', 'sum.mjs'), sum + (scenario === 'B' ? multiply : ''));
  const final = judgment(dir);
  expect(final.code, final.stderr).toBe(0);
  const record = await template(dir);
  const prepared = JSON.parse(await readFile(join(dir, 'preparation.json'), 'utf8'));
  record.state = 'observed_pass';
  record.startedAt = prepared.preparedAt;
  record.endedAt = prepared.preparedAt;
  record.artifactReportDigest = final.json.reportDigest;
  record.process = { state: 'exited', exitCode: 0 };
  record.observations = {
    handoffDigest: sha('handoff'), previewDigest: sha('preview'), launchPlanDigest: sha('plan'), taskRevision: 2,
    workspaceDigest: sha('workspace'), sourceSessionDigest: sha('source'), targetSessionDigest: sha(cross ? 'target' : 'source'),
    targetRunDigest: sha('run'), reviewedArgvDigest: sha('argv'), actualArgvDigest: sha('argv'),
    sessionRelation: cross ? 'new-target-session' : 'same-source-session', environmentScope: 'host-runtime-only',
    checks: { workspaceIdentity: 'passed', cwd: 'passed', humanContext: 'passed', argv: 'passed',
      sourceUnchanged: 'passed', inputObservation: 'unknown' },
  };
  record.warnings = ['input-unobservable', 'environment-unknown'];
  if (scenario === 'C') record.drift = {
    stalePreviewDigest: sha('stale-preview'), staleLaunchPlanDigest: sha('stale-plan'), freshPreviewDigest: sha('preview'),
    freshLaunchPlanDigest: sha('plan'), staleErrorCode: 'REVISION_CONFLICT', staleRejected: true,
    staleLaunchCount: 0, totalLaunchCount: 1, reprepared: true,
    humanChangeDigest: sha(await readFile(join(dir, 'workspace', 'NOTES.md'), 'utf8')),
  };
  await save(dir, record);
  return { dir, record };
}

beforeAll(async () => {
  const parent = process.env.THREADPORT_CERT_TEST_ROOT ?? resolve('output/agent-certification-tests');
  await mkdir(parent, { recursive: true });
  root = await realpath(await mkdtemp(join(parent, 'suite-')));
  tarball = join(root, 'synthetic-not-an-installation-package.tgz');
  await writeFile(tarball, gzipSync('Synthetic unit-test bytes only; not an installation package.'));
});
afterAll(async () => { if (!process.env.THREADPORT_CERT_TEST_ROOT) await rm(root, { recursive: true, force: true }); });

describe('CERT-01 preparation and deterministic artifacts', () => {
  it('defaults to help and rejects launch, unknown/duplicate arguments and non-exact versions', async () => {
    expect(cli([]).code).toBe(0);
    expect(cli([]).stdout).toContain('no Agent execution');
    for (const args of [['run'], ['judge', '--dir', root, '--phase', 'final', '--exec', 'node'],
      ['judge', '--dir', root, '--dir', root], ['judge', '--dir', root, '--phase', 'anything']])
      expect(cli(args).code).toBe(2);
    const dir = join(root, 'invalid-version');
    expect(cli(['prepare', '--dir', dir, '--scenario', 'A', '--candidate', candidate, '--tarball', tarball,
      '--source-agent', 'codex', '--source-version', 'latest', '--target-agent', 'codex', '--target-version', '0.155.0',
      '--mode', 'native-resume']).code).toBe(2);
    expect(existsSync(dir)).toBe(false);
  });

  it.each(['A', 'B', 'C'])('prepares isolated %s with real known failing Node tests and never overwrites a run', async scenario => {
    const dir = await setup(scenario);
    const initial = judgment(dir, 'baseline');
    expect(initial.code).toBe(0);
    expect(initial.json.tests.some((item: { status: string }) => item.status === 'failed')).toBe(true);
    const test = spawnSync(process.execPath, ['--test', 'sum.test.mjs'], { cwd: join(dir, 'workspace'), encoding: 'utf8' });
    expect(test.status).toBe(1);
    expect(judgment(dir).code).not.toBe(0);
    expect(await readFile(join(dir, 'task.json'), 'utf8')).toMatch(/objectiveZh/);
    expect(await readFile(join(dir, 'task.json'), 'utf8')).toMatch(/objectiveEn/);
    const prior = await readFile(join(dir, 'preparation.json'));
    expect(cli(['prepare', '--dir', dir, '--scenario', scenario, '--candidate', candidate, '--tarball', tarball,
      '--source-agent', 'codex', '--source-version', '0.155.0-alpha.9', '--target-agent', 'codex',
      '--target-version', '0.155.0-alpha.9', '--mode', 'native-resume']).code).toBe(2);
    expect(await readFile(join(dir, 'preparation.json'))).toEqual(prior);
  });

  it.each(['A', 'B', 'C'])('judges the exact %s fix without executing workspace code; fixed real Node tests agree', async scenario => {
    const { dir } = await completed(scenario);
    expect(judgment(dir).json.workspaceCodeExecuted).toBe(false);
    expect(spawnSync(process.execPath, ['--test', 'sum.test.mjs'], { cwd: join(dir, 'workspace') }).status).toBe(0);
    const accepted = validation(dir);
    expect(accepted.code, accepted.stderr).toBe(0);
    expect(accepted.json).toMatchObject({ state: 'complete-unverified', independentReview: 'required',
      trustEffect: 'none', receiptAttestationCreated: false });
    expect(judgment(dir, 'baseline').code).toBe(1);
  });

  it.each(['package.json', 'package-lock.json', 'PROTECTED.md', 'cases.json', 'sum.test.mjs'])(
    'rejects protected byte changes to %s even when functional vectors pass', async name => {
      const { dir } = await completed('B');
      await writeFile(join(dir, 'workspace', name), (await readFile(join(dir, 'workspace', name), 'utf8')) + '\n');
      const result = judgment(dir);
      expect(result.code).toBe(1);
      expect(result.json.tests.every((item: { status: string }) => item.status === 'passed')).toBe(true);
      expect(result.json.checks).toContainEqual({ id: 'protected-bytes-and-dependencies', passed: false });
    });

  it('rejects missing artifacts, extra files/directories, altered context and a forged baseline report', async () => {
    const { dir } = await completed();
    await rm(join(dir, 'workspace', 'sum.mjs'));
    expect(judgment(dir).code).toBe(1);
    await writeFile(join(dir, 'workspace', 'sum.mjs'), sum);
    await mkdir(join(dir, 'workspace', 'unexpected-private-logs'));
    await writeFile(join(dir, 'workspace', 'unexpected-private-logs', 'log.txt'), 'must never be read');
    const unexpected = judgment(dir);
    expect(unexpected.code).toBe(1);
    expect(unexpected.stdout).not.toContain('unexpected-private-logs');
    expect(unexpected.json.unexpectedEntries).toBe(1);
    await rm(join(dir, 'workspace', 'unexpected-private-logs'), { recursive: true });
    await writeFile(join(dir, 'task.json'), '{}');
    expect(judgment(dir).json.checks).toContainEqual({ id: 'bilingual-context', passed: false });
    await writeFile(join(dir, 'baseline-report.json'), '{}');
    expect(judgment(dir).json.checks).toContainEqual({ id: 'baseline-report-intact', passed: false });
  });

  it('rejects arbitrary workspace JS and shell text without running either', async () => {
    const { dir } = await completed();
    const marker = join(dir, 'must-not-exist');
    const malicious = `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed');\n`;
    await writeFile(join(dir, 'workspace', 'sum.mjs'), malicious + sum);
    const result = judgment(dir);
    expect(result.code).toBe(1);
    expect(result.json.workspaceCodeExecuted).toBe(false);
    expect(existsSync(marker)).toBe(false);
    await writeFile(join(dir, 'workspace', 'sum.mjs'), '$(touch must-not-exist) `touch must-not-exist`\n');
    expect(judgment(dir).code).toBe(1);
    expect(existsSync(marker)).toBe(false);
    await writeFile(join(dir, 'workspace', 'sum.mjs'), sum + multiply);
    expect(judgment(dir).code).toBe(1); // A permits only the one-operator repair.
  });

  it('applies C drift once, preserves the baseline, and requires the human bytes and fresh plan observations', async () => {
    const dir = await setup('C');
    const before = await readFile(join(dir, 'preparation.json'));
    expect(cli(['drift', '--dir', dir]).code).toBe(0);
    expect(await readFile(join(dir, 'preparation.json'))).toEqual(before);
    const note = await readFile(join(dir, 'workspace', 'NOTES.md'));
    expect(cli(['drift', '--dir', dir]).code).toBe(2);
    expect(await readFile(join(dir, 'workspace', 'NOTES.md'))).toEqual(note);
    await writeFile(join(dir, 'workspace', 'sum.mjs'), sum);
    expect(judgment(dir).code).toBe(0);
    await writeFile(join(dir, 'workspace', 'NOTES.md'), 'Agent overwrote the human edit.\n');
    expect(judgment(dir).code).toBe(1);
    expect(cli(['drift', '--dir', await setup('A')]).code).toBe(2);
  });
});

describe('CERT-01 evidence binding and trust boundary', () => {
  it('returns incomplete for the generated not_run template', async () => {
    const dir = await setup();
    const result = validation(dir, candidate, tarball, 'evidence.template.json');
    expect(result.code).toBe(3);
    expect(result.json).toMatchObject({ state: 'incomplete-unverified', evidenceState: 'not_run', trustEffect: 'none' });
  });

  it('accepts a cross-Agent observation only with a different target session and correct binding', async () => {
    const { dir, record } = await completed('B', true);
    expect(validation(dir).code).toBe(0);
    record.observations.targetSessionDigest = record.observations.sourceSessionDigest;
    await save(dir, record);
    expect(validation(dir).code).toBe(2);
  });

  it.each(['candidateSha', 'tarballSha256', 'fixtureDigest', 'harnessDigest', 'scenario', 'platform', 'arch', 'node',
    'osRelease', 'source', 'target', 'mode'])('rejects missing binding field %s', async field => {
    const { dir, record } = await completed();
    delete record.binding[field];
    await save(dir, record);
    expect(validation(dir).code).toBe(2);
  });

  it('rejects old candidates, a different archive, wrong run/preview/argv/session and mismatched preparation', async () => {
    const { dir, record } = await completed();
    expect(validation(dir, 'b'.repeat(40)).code).toBe(2);
    const oldTarball = join(root, 'other-candidate.tgz');
    await writeFile(oldTarball, gzipSync('a different package'));
    expect(validation(dir, candidate, oldTarball).code).toBe(2);
    for (const mutate of [
      (r: typeof record) => { r.runId = '11111111-1111-4111-8111-111111111111'; },
      (r: typeof record) => { r.binding.target.version = '2.0.0'; },
      (r: typeof record) => { r.observations.previewDigest = null; },
      (r: typeof record) => { r.observations.actualArgvDigest = sha('unreviewed'); },
      (r: typeof record) => { r.observations.targetSessionDigest = sha('other-session'); },
      (r: typeof record) => { r.artifactReportDigest = sha('forged-report'); },
      (r: typeof record) => { r.observations.checks.cwd = 'unknown'; },
    ]) {
      const changed = structuredClone(record); mutate(changed); await save(dir, changed);
      expect(validation(dir).code).toBe(2);
    }
    const prepared = JSON.parse(await readFile(join(dir, 'preparation.json'), 'utf8'));
    prepared.binding.fixtureDigest = sha('other-fixture');
    await writeFile(join(dir, 'preparation.json'), JSON.stringify(prepared));
    expect(judgment(dir).code).toBe(2);
  });

  it('does not count exit 0, self-report or a forged report as task satisfaction', async () => {
    const { dir, record } = await completed();
    await writeFile(join(dir, 'workspace', 'sum.mjs'), 'export function sum(a, b) {\n  return a - b;\n}\n');
    record.artifactReportDigest = judgment(dir).json.reportDigest;
    await save(dir, record);
    const result = validation(dir);
    expect(result.code).toBe(1);
    expect(result.json.state).toBe('artifact-failed');
    expect(result.json.receiptAttestationCreated).toBe(false);
  });

  it.each(['authority', 'attestationId', 'receipt', 'verified-complete', 'command'])(
    'rejects user-supplied %s instead of granting trust or executing it', async field => {
      const { dir, record } = await completed();
      record[field] = 'runtime-verified; $(touch marker)';
      await save(dir, record);
      expect(validation(dir).code).toBe(2);
      expect(existsSync(join(dir, 'marker'))).toBe(false);
    });

  it('requires retained first failures and keeps observed_with_issue incomplete', async () => {
    const { dir, record } = await completed();
    record.firstFailure = { category: 'redacted-command', exitCode: 127, retainedLocally: true, diagnosticDigest: sha('first failure') };
    record.warnings.push('first-attempt-failed');
    await save(dir, record);
    expect(validation(dir).code).toBe(2);
    record.state = 'observed_with_issue';
    await save(dir, record);
    expect(validation(dir).code).toBe(3);
    record.firstFailure.retainedLocally = false;
    await save(dir, record);
    expect(validation(dir).code).toBe(2);
  });

  it('rejects missing required observations, reversed time and an unretained budget overrun', async () => {
    const { dir, record } = await completed();
    for (const mutate of [
      (r: typeof record) => { delete r.observations.launchPlanDigest; },
      (r: typeof record) => { delete r.process.exitCode; },
      (r: typeof record) => { r.endedAt = '2020-01-01T00:00:00.000Z'; },
      (r: typeof record) => { r.process.exitCode = 7; },
      (r: typeof record) => { r.endedAt = new Date(Date.parse(r.startedAt) + 601_000).toISOString(); },
      (r: typeof record) => { r.warnings = []; },
      (r: typeof record) => { r.observations.checks.authority = 'runtime-verified'; },
    ]) {
      const changed = structuredClone(record); mutate(changed); await save(dir, changed);
      expect(validation(dir).code).toBe(2);
    }
  });

  it.each(['failed', 'interrupted', 'unknown'])('retains %s observations without marking a functional pass', async state => {
    const dir = await setup();
    const record = await template(dir);
    record.state = state;
    record.process = { state: state === 'interrupted' ? 'cancelled' : state, exitCode: null };
    await save(dir, record);
    expect(validation(dir).code).toBe(3);
  });

  it.each(['staleLaunchCount', 'totalLaunchCount', 'stalePreviewDigest', 'freshLaunchPlanDigest', 'humanChangeDigest'])(
    'rejects C with incorrect %s', async field => {
      const { dir, record } = await completed('C');
      record.drift[field] = field === 'staleLaunchCount' ? 1 : field === 'totalLaunchCount' ? 2
        : field === 'stalePreviewDigest' ? record.drift.freshPreviewDigest : sha('incorrect');
      await save(dir, record);
      expect(validation(dir).code).toBe(2);
    });
});

describe('CERT-01 bounded read-only inputs', () => {
  it('rejects path traversal, absolute evidence paths and oversized/malformed JSON without echoing input', async () => {
    const { dir } = await completed();
    for (const name of ['../outside.json', '/private/outside.json', 'workspace/../../outside.json', 'workspace\\outside.json'])
      expect(validation(dir, candidate, tarball, name).code).toBe(2);
    const secret = 'synthetic-private-sentinel';
    await writeFile(join(dir, 'evidence.json'), '{' + secret);
    const malformed = validation(dir);
    expect(malformed.code).toBe(2);
    expect(malformed.stderr).not.toContain(secret);
    expect(malformed.stderr).not.toContain(dir);
    await writeFile(join(dir, 'evidence.json'), secret.repeat(5000));
    expect(validation(dir).code).toBe(2);
    await writeFile(join(dir, 'evidence.json'), Buffer.from([0xff, 0xfe]));
    expect(validation(dir).code).toBe(2);
  });

  it('rejects directories, oversized artifacts/tarballs, invalid archives, and hard-linked inputs', async () => {
    const { dir } = await completed();
    const savedEvidence = await readFile(join(dir, 'evidence.json'));
    await rm(join(dir, 'evidence.json'));
    await mkdir(join(dir, 'evidence.json'));
    expect(validation(dir).stderr).toContain('UNSAFE_FILE');
    await rm(join(dir, 'evidence.json'), { recursive: true });
    await writeFile(join(dir, 'evidence.json'), savedEvidence);
    await writeFile(join(dir, 'workspace', 'sum.mjs'), 'x'.repeat(65537));
    expect(judgment(dir).stderr).toContain('INPUT_TOO_LARGE');
    await writeFile(join(dir, 'workspace', 'sum.mjs'), sum);
    const large = join(root, 'oversized.tgz');
    await writeFile(large, ''); await truncate(large, 64 * 1024 * 1024 + 1);
    expect(validation(dir, candidate, large).stderr).toContain('INPUT_TOO_LARGE');
    const invalid = join(root, 'invalid.tgz'); await writeFile(invalid, 'not gzip');
    expect(validation(dir, candidate, invalid).stderr).toContain('INVALID_TARBALL');
    const linked = join(root, 'hardlink.tgz'); await link(tarball, linked);
    expect(validation(dir, candidate, linked).stderr).toContain('UNSAFE_FILE');
    await rm(linked);
  });

  it('rejects file symlinks without following evidence or workspace code', async () => {
    const { dir } = await completed();
    const evidence = await readFile(join(dir, 'evidence.json'));
    await rm(join(dir, 'evidence.json'));
    const outside = join(root, 'outside.json'); await writeFile(outside, evidence);
    await symlink(outside, join(dir, 'evidence.json'), 'file');
    expect(validation(dir).stderr).toContain('UNSAFE_FILE');
    await rm(join(dir, 'workspace', 'sum.mjs'));
    await symlink(outside, join(dir, 'workspace', 'sum.mjs'), 'file');
    expect(judgment(dir).stderr).toContain('UNSAFE_FILE');
  });

  it('rejects directory symlinks/junctions at roots and ancestors on every platform', async () => {
    const { dir } = await completed();
    const alias = join(root, 'alias');
    await symlink(dir, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(judgment(alias).stderr).toContain('UNSAFE_PATH');
    const inside = join(dir, 'linked-parent');
    await symlink(dir, inside, process.platform === 'win32' ? 'junction' : 'dir');
    expect(validation(dir, candidate, tarball, 'linked-parent/evidence.json').stderr).toContain('UNSAFE_PATH');
  });

  it.skipIf(process.platform === 'win32')('rejects POSIX FIFO evidence without blocking', async () => {
    const { dir } = await completed();
    await rm(join(dir, 'evidence.json'));
    execFileSync('mkfifo', [join(dir, 'evidence.json')]);
    expect(validation(dir).stderr).toContain('UNSAFE_FILE');
  });
});
