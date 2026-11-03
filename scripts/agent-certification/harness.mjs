import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import * as contracts from './contracts.mjs';
import { canonicalDirectory, digest, entries, HarnessError, jsonBytes, readJson, readRegular,
  requireInput, scopedPath, tarballDigest, utf8, valueDigest } from './io.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../../tests/fixtures/agent-certification');
const commonNames = ['package.json', 'package-lock.json', 'PROTECTED.md', 'sum.test.mjs'];
const sourcePattern = /^export function sum\(a, b\) \{\n  return a ([+-]) b;\n\}\n(\nexport function multiply\(a, b\) \{\n  return a \* b;\n\}\n)?$/;
const taskSchema = z.object({ scenario: contracts.scenario, objectiveZh: z.string().max(1000),
  objectiveEn: z.string().max(1000), constraints: z.array(z.string().max(1000)).max(10),
  allowedChanges: z.tuple([z.literal('sum.mjs')]),
  reviewableTestArgv: z.tuple([z.literal('node'), z.literal('--test'), z.literal('sum.test.mjs')]),
}).strict();
const casesSchema = z.array(z.object({ id: z.string().regex(/^[a-z-]{1,50}$/),
  operation: z.enum(['sum', 'multiply']), args: z.tuple([z.number().finite(), z.number().finite()]),
  expected: z.number().finite() }).strict()).min(1).max(16);

async function fingerprint(root, names) {
  const items = [];
  for (const name of [...names].sort()) items.push([name, digest(await readRegular(scopedPath(root, name)))]);
  return valueDigest(items);
}
async function harnessDigest() {
  return fingerprint(here, ['cli.mjs', 'contracts.mjs', 'harness.mjs', 'io.mjs']);
}
async function fixture(id) {
  requireInput(contracts.scenario.safeParse(id).success);
  const files = new Map();
  for (const name of commonNames) files.set(name, await readRegular(join(fixtures, 'common', name)));
  for (const name of ['sum.mjs', 'cases.json', ...(id === 'C' ? ['NOTES.md'] : [])])
    files.set(name, await readRegular(join(fixtures, id, name)));
  const context = await readRegular(join(fixtures, id, 'task.json'));
  const task = await readJson(join(fixtures, id, 'task.json'), taskSchema);
  requireInput(task.scenario === id, 'FIXTURE_MISMATCH');
  const cases = await readJson(join(fixtures, id, 'cases.json'), casesSchema);
  const afterDrift = id === 'C' ? await readRegular(join(fixtures, id, 'NOTES.after-drift.md')) : null;
  const hashes = [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, bytes]) => [name, digest(bytes)]);
  return { id, files, context, cases, afterDrift,
    digest: valueDigest([...hashes, ['task.json', digest(context)], ...(afterDrift ? [['NOTES.after-drift.md', digest(afterDrift)]] : [])]) };
}

// A deliberately tiny language, not a JS sandbox. All other code is rejected.
// No import/eval/vm/child process is used for artifact judgment. A task can only
// repair the sum operator or append the prescribed multiply function.
function modelTests(bytes, cases) {
  const match = bytes ? sourcePattern.exec(utf8(bytes)) : null;
  return { grammar: Boolean(match), hasMultiply: Boolean(match?.[2]), tests: cases.map(item => {
    let actual = null;
    if (match && item.operation === 'sum') actual = match[1] === '+' ? item.args[0] + item.args[1] : item.args[0] - item.args[1];
    if (match?.[2] && item.operation === 'multiply') actual = item.args[0] * item.args[1];
    return { id: item.id, expected: item.expected, actual, status: actual === item.expected ? 'passed' : 'failed' };
  }) };
}
function report(f, current, phase, { unexpected = 0, contextIntact = true, driftIntact = false, baselineIntact = true } = {}) {
  const modeled = modelTests(current.get('sum.mjs'), f.cases);
  const files = [...f.files.keys()].sort().map(name => {
    const baselineSha256 = digest(f.files.get(name));
    const actualSha256 = current.has(name) ? digest(current.get(name)) : null;
    const expected = name === 'NOTES.md' && phase === 'final' ? f.afterDrift : f.files.get(name);
    return { path: name, baselineSha256, actualSha256, allowedTargetEdit: name === 'sum.mjs',
      protectedMatch: name === 'sum.mjs' ? null : actualSha256 === digest(expected) };
  });
  const baselineMatch = files.every(item => item.actualSha256 === item.baselineSha256);
  const checks = phase === 'baseline' ? [
    { id: 'baseline-bytes', passed: baselineMatch && unexpected === 0 && contextIntact },
    { id: 'known-failing-tests', passed: modeled.grammar && modeled.tests.some(test => test.status === 'failed') },
  ] : [
    { id: 'required-artifact', passed: current.has('sum.mjs') },
    { id: 'restricted-source-grammar', passed: modeled.grammar && modeled.hasMultiply === (f.id === 'B') },
    { id: 'functional-test-vectors', passed: modeled.tests.every(test => test.status === 'passed') },
    { id: 'allowed-edit-present', passed: files.some(item => item.allowedTargetEdit && item.actualSha256 !== null && item.actualSha256 !== item.baselineSha256) },
    { id: 'file-scope', passed: unexpected === 0 },
    { id: 'protected-bytes-and-dependencies', passed: files.every(item => item.allowedTargetEdit || item.protectedMatch) },
    { id: 'bilingual-context', passed: contextIntact },
    { id: 'baseline-report-intact', passed: baselineIntact },
    ...(f.id === 'C' ? [{ id: 'human-drift-retained', passed: driftIntact }] : []),
  ];
  const body = { schema: 'threadport.agent-certification.artifacts.v1', scenario: f.id, phase,
    fixtureDigest: f.digest, method: 'restricted-arithmetic-model-v1',
    reviewableTestArgv: ['node', '--test', 'sum.test.mjs'], workspaceCodeExecuted: false,
    status: checks.every(item => item.passed) ? 'satisfied' : 'unsatisfied',
    checks, tests: modeled.tests, files, unexpectedEntries: unexpected };
  return { ...body, reportDigest: valueDigest(body) };
}
function baseline(f) { return report(f, f.files, 'baseline'); }

async function preparedRun(directory) {
  const root = await canonicalDirectory(directory);
  const prepared = await readJson(join(root, 'preparation.json'), contracts.preparation);
  const f = await fixture(prepared.binding.scenario);
  requireInput(prepared.binding.harnessDigest === await harnessDigest()
    && prepared.binding.fixtureDigest === f.digest && prepared.contextDigest === digest(f.context)
    && prepared.baselineReportDigest === baseline(f).reportDigest, 'PREPARATION_MISMATCH');
  return { root, prepared, f };
}
async function maybeRead(path) {
  try { return await readRegular(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function inspect(run, phase) {
  requireInput(['baseline', 'final'].includes(phase));
  const { root, prepared, f } = run;
  const workspace = await canonicalDirectory(join(root, 'workspace'));
  const names = await entries(workspace);
  // Git metadata is intentionally neither traversed nor executed. Everything
  // else outside the exact fixture file list is counted, never opened/echoed.
  if (names.includes('.git')) {
    const git = await lstat(join(workspace, '.git'));
    requireInput(!git.isSymbolicLink() && (git.isDirectory() || (git.isFile() && git.nlink === 1)), 'UNSAFE_PATH');
  }
  const unexpected = names.filter(name => name !== '.git' && !f.files.has(name)).length;
  const current = new Map();
  for (const name of f.files.keys()) {
    const bytes = await maybeRead(join(workspace, name));
    if (bytes !== null) current.set(name, bytes);
  }
  const context = await maybeRead(join(root, 'task.json'));
  const savedBaseline = await maybeRead(join(root, 'baseline-report.json'));
  let driftIntact = false;
  if (f.id === 'C' && phase === 'final') {
    try {
      const drift = await readJson(join(root, 'drift.json'), contracts.driftRecord);
      driftIntact = drift.runId === prepared.runId && drift.preparationDigest === valueDigest(prepared)
        && drift.humanChangeDigest === digest(f.afterDrift);
    } catch (error) { if (error.code !== 'INVALID_JSON') throw error; }
  }
  return report(f, current, phase, { unexpected, contextIntact: context !== null && digest(context) === digest(f.context),
    baselineIntact: savedBaseline !== null && digest(savedBaseline) === digest(jsonBytes(baseline(f))), driftIntact });
}
export async function judge(directory, phase) { return inspect(await preparedRun(directory), phase); }

export async function prepare(options) {
  const f = await fixture(options.scenario);
  const bound = contracts.binding.safeParse({
    candidateSha: options.candidate, tarballSha256: await tarballDigest(options.tarball),
    harnessDigest: await harnessDigest(), fixtureDigest: f.digest, scenario: f.id,
    platform: process.platform, arch: process.arch, node: process.versions.node, osRelease: release(),
    source: { agent: options['source-agent'], version: options['source-version'] },
    target: { agent: options['target-agent'], version: options['target-version'] }, mode: options.mode,
  });
  requireInput(bound.success, 'INVALID_BINDING');
  const destination = resolve(options.dir);
  await canonicalDirectory(dirname(destination));
  // No recursive creation or overwrite of a pre-existing experiment.
  await mkdir(destination, { mode: 0o700 });
  const root = await canonicalDirectory(destination);
  await mkdir(join(root, 'workspace'), { mode: 0o700 });
  await mkdir(join(root, 'source'), { mode: 0o700 });
  for (const [name, bytes] of f.files) await writeFile(join(root, 'workspace', name), bytes, { flag: 'wx', mode: 0o600 });
  await writeFile(join(root, 'task.json'), f.context, { flag: 'wx', mode: 0o600 });
  const initial = baseline(f);
  requireInput(initial.status === 'satisfied', 'FIXTURE_MISMATCH');
  const prepared = contracts.preparation.parse({
    schema: 'threadport.agent-certification.preparation.v1', runId: randomUUID(), preparedAt: new Date().toISOString(),
    binding: bound.data, contextDigest: digest(f.context), baselineReportDigest: initial.reportDigest,
  });
  for (const [name, value] of [['baseline-report.json', initial], ['evidence.template.json', contracts.evidenceTemplate(prepared)],
    ['preparation.json', prepared]]) await writeFile(join(root, name), jsonBytes(value), { flag: 'wx', mode: 0o600 });
  return { schema: prepared.schema, runId: prepared.runId, state: 'prepared-not-run', binding: prepared.binding,
    baselineReportDigest: prepared.baselineReportDigest, trustEffect: 'none' };
}

export async function drift(directory) {
  const run = await preparedRun(directory);
  requireInput(run.f.id === 'C', 'DRIFT_REQUIRES_C');
  requireInput((await inspect(run, 'baseline')).status === 'satisfied', 'BASELINE_CHANGED');
  try { await lstat(join(run.root, 'drift.json')); throw new HarnessError('DRIFT_ALREADY_APPLIED'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const path = join(run.root, 'workspace', 'NOTES.md');
  const original = await readRegular(path);
  const before = await lstat(path);
  const file = await open(path, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await file.stat();
    requireInput(info.isFile() && info.nlink === 1 && info.ino === before.ino && info.dev === before.dev
      && info.size === original.length && info.mtimeMs === before.mtimeMs, 'INPUT_CHANGED');
    const observed = Buffer.alloc(original.length + 1);
    let length = 0;
    while (length < observed.length) {
      const { bytesRead } = await file.read(observed, length, observed.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    requireInput(digest(observed.subarray(0, length)) === digest(run.f.files.get('NOTES.md')), 'BASELINE_CHANGED');
    let written = 0;
    while (written < run.f.afterDrift.length) {
      const { bytesWritten } = await file.write(run.f.afterDrift, written, run.f.afterDrift.length - written, written);
      requireInput(bytesWritten > 0, 'INPUT_CHANGED');
      written += bytesWritten;
    }
    await file.truncate(run.f.afterDrift.length);
  } finally { await file.close(); }
  const record = { schema: 'threadport.agent-certification.drift.v1', runId: run.prepared.runId,
    preparationDigest: valueDigest(run.prepared), humanChangeDigest: digest(run.f.afterDrift) };
  await writeFile(join(run.root, 'drift.json'), jsonBytes(record), { flag: 'wx', mode: 0o600 });
  return { ...record, state: 'human-drift-applied', staleApprovalMustBeRejected: true, trustEffect: 'none' };
}

function completeClaims(record, run) {
  const o = record.observations;
  requireInput(record.startedAt !== null && record.endedAt !== null
    && Date.parse(record.startedAt) >= Date.parse(run.prepared.preparedAt)
    && Date.parse(record.endedAt) >= Date.parse(record.startedAt), 'INCOMPLETE_OBSERVATIONS');
  if (Date.parse(record.endedAt) - Date.parse(record.startedAt) > record.budget.seconds * 1000)
    requireInput(record.state === 'observed_with_issue' && record.warnings.includes('budget-exceeded'), 'BUDGET_EXCEEDED');
  for (const name of ['handoffDigest', 'previewDigest', 'launchPlanDigest', 'workspaceDigest', 'sourceSessionDigest',
    'targetSessionDigest', 'targetRunDigest', 'reviewedArgvDigest', 'actualArgvDigest', 'taskRevision'])
    requireInput(o[name] !== null, 'INCOMPLETE_OBSERVATIONS');
  requireInput(o.actualArgvDigest === o.reviewedArgvDigest, 'ARGV_MISMATCH');
  requireInput(['workspaceIdentity', 'cwd', 'humanContext', 'argv', 'sourceUnchanged']
    .every(name => o.checks[name] === 'passed'), 'INCOMPLETE_OBSERVATIONS');
  requireInput(['passed', 'unknown'].includes(o.checks.inputObservation), 'INCOMPLETE_OBSERVATIONS');
  requireInput(o.environmentScope !== 'unknown', 'INCOMPLETE_OBSERVATIONS');
  if (o.checks.inputObservation === 'unknown') requireInput(record.warnings.includes('input-unobservable'), 'MISSING_WARNING');
  if (o.environmentScope === 'host-runtime-only') requireInput(record.warnings.includes('environment-unknown'), 'MISSING_WARNING');
  const native = record.binding.mode === 'native-resume';
  requireInput(o.sessionRelation === (native ? 'same-source-session' : 'new-target-session')
    && (native ? o.sourceSessionDigest === o.targetSessionDigest : o.sourceSessionDigest !== o.targetSessionDigest), 'SESSION_MISMATCH');
  requireInput(record.process.state === 'exited' && record.process.exitCode === 0, 'PROCESS_MISMATCH');
  if (record.state === 'observed_pass') requireInput(record.firstFailure === null
    && !record.warnings.some(value => ['redacted-command', 'budget-exceeded', 'authentication-failed',
      'service-unreachable', 'first-attempt-failed'].includes(value)), 'ISSUE_MUST_BE_RETAINED');
  if (record.state === 'observed_with_issue') requireInput(record.firstFailure?.retainedLocally === true, 'MISSING_FIRST_FAILURE');
  if (run.f.id === 'C') {
    const d = record.drift;
    requireInput(d !== null && d.staleRejected && d.staleLaunchCount === 0 && d.totalLaunchCount === 1 && d.reprepared
      && d.stalePreviewDigest !== d.freshPreviewDigest && d.staleLaunchPlanDigest !== d.freshLaunchPlanDigest
      && d.freshPreviewDigest === o.previewDigest && d.freshLaunchPlanDigest === o.launchPlanDigest
      && d.humanChangeDigest === digest(run.f.afterDrift), 'DRIFT_OBSERVATION_MISMATCH');
  } else requireInput(record.drift === null, 'DRIFT_OBSERVATION_MISMATCH');
}

export async function validate(options) {
  requireInput(contracts.candidate.safeParse(options.candidate).success, 'INVALID_BINDING');
  const run = await preparedRun(options.dir);
  requireInput(typeof options.evidence === 'string' && options.evidence.endsWith('.json'), 'INVALID_INPUT');
  const record = await readJson(scopedPath(run.root, options.evidence), contracts.evidence);
  requireInput(record.runId === run.prepared.runId && valueDigest(record.binding) === valueDigest(run.prepared.binding)
    && record.binding.candidateSha === options.candidate && record.binding.tarballSha256 === await tarballDigest(options.tarball), 'BINDING_MISMATCH');
  const complete = ['observed_pass', 'observed_with_issue'].includes(record.state);
  let artifacts = null;
  if (complete) {
    completeClaims(record, run);
    artifacts = await inspect(run, 'final');
    requireInput(record.artifactReportDigest === artifacts.reportDigest, 'ARTIFACT_REPORT_MISMATCH');
  } else if (record.state === 'not_run') {
    requireInput(record.process.state === 'not_run' && record.process.exitCode === null
      && record.startedAt === null && record.endedAt === null && record.artifactReportDigest === null
      && record.firstFailure === null && record.drift === null, 'INCONSISTENT_NOT_RUN');
  }
  const status = artifacts?.status === 'unsatisfied' ? 'artifact-failed'
    : record.state === 'observed_pass' ? 'complete-unverified' : 'incomplete-unverified';
  return { schema: 'threadport.agent-certification.validation.v1', runId: record.runId, state: status,
    evidenceState: record.state, artifacts, independentReview: 'required', trustEffect: 'none', receiptAttestationCreated: false };
}
