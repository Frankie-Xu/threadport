import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { platform, arch, release } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPORT_SCHEMA = 'threadport.local-validation.v1';
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/** @typedef {'chrome'|'docker'} Requirement */
/** @typedef {{ id: string, title: string, executable: string, args: string[], requires?: Requirement, env?: Record<string, string>, timeoutMs?: number }} ValidationStep */
/** @typedef {{ status: 'passed'|'failed', exitCode: number|null, stdout: string, stderr: string, errorCode?: string }} CommandResult */

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isoNow() {
  return new Date().toISOString();
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function sourceSteps({ cwd = process.cwd(), packageOutput = 'output/package-local-validation' } = {}) {
  const npm = npmExecutable();
  return [
    { id: 'source-check', title: 'Source typecheck, build, tests, and docs', executable: npm, args: ['run', 'check'] },
    { id: 'browser-e2e', title: 'Production browser flow', executable: npm, args: ['run', 'test:e2e'], requires: 'chrome', env: { THREADPORT_TEST_CHROME: '1' } },
    { id: 'package-smoke', title: 'Isolated package smoke test', executable: npm, args: ['run', 'test:package'], requires: 'chrome', env: { THREADPORT_TEST_CHROME: '1', THREADPORT_PACKAGE_OUTPUT: packageOutput } },
    // The mounted working tree lets this command remain an argv-only invocation. It is intentionally
    // a user-state check; a clean CI-style archive is recorded separately by the Linux CI job.
    { id: 'linux-container', title: 'Linux Node 24 container check', executable: 'docker', args: ['run', '--rm', '-v', `${resolve(cwd)}:/work:ro`, '-w', '/work', 'node:24-bookworm', 'npm', 'run', 'check'], requires: 'docker' },
  ];
}

export const defaultSteps = sourceSteps;

function commandLabel(step) {
  return [step.executable, ...step.args].map(value => JSON.stringify(value)).join(' ');
}

/** Execute one argv command. `shell` is always false so input cannot become shell syntax. */
export function executeArgv(step, { cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise(resolvePromise => {
    const child = spawn(step.executable, step.args, {
      cwd,
      env: { ...process.env, ...(step.env ?? {}) },
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.once('error', error => finish({ status: 'failed', exitCode: null, stdout, stderr: `${stderr}${error.message}`, errorCode: 'SPAWN_FAILED' }));
    child.once('close', code => finish({ status: code === 0 ? 'passed' : 'failed', exitCode: typeof code === 'number' ? code : null, stdout, stderr, ...(code === 0 ? {} : { errorCode: `EXIT_${code ?? 'UNKNOWN'}` }) }));
    const timer = setTimeout(() => {
      child.kill();
      finish({ status: 'failed', exitCode: null, stdout, stderr: `${stderr}command timed out after ${timeoutMs}ms\n`, errorCode: 'TIMEOUT' });
    }, timeoutMs);
    timer.unref?.();
  });
}

async function commandAvailable(command) {
  const candidates = process.platform === 'win32' ? ['where.exe'] : ['which'];
  for (const locator of candidates) {
    try {
      await execFileAsync(locator, [command], { timeout: 3000, windowsHide: true });
      return true;
    } catch {
      // Keep probing other locators. A missing locator is equivalent to unavailable.
    }
  }
  return false;
}

async function chromeAvailable() {
  const names = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : process.platform === 'darwin'
      ? ['google-chrome', 'chromium', 'chromium-browser']
      : ['google-chrome', 'chromium', 'chromium-browser'];
  if (await Promise.any(names.map(name => commandAvailable(name))).then(() => true, () => false)) return true;
  if (process.platform === 'darwin') {
    for (const path of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']) {
      try { await access(path); return true; } catch { /* unavailable */ }
    }
  }
  return false;
}

async function dockerAvailable() {
  if (!await commandAvailable('docker')) return false;
  try {
    await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 5000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function runtimeInfo() {
  let npm = null;
  try {
    const result = await execFileAsync(npmExecutable(), ['--version'], { timeout: 3000, windowsHide: true });
    npm = String(result.stdout).trim().split(/\r?\n/, 1)[0] || null;
  } catch { /* npm version is optional metadata */ }
  return { node: process.version, npm, platform: platform(), arch: arch(), kernel: release() };
}

async function gitOutput(cwd, args) {
  try {
    const result = await execFileAsync('git', ['-C', cwd, ...args], { timeout: 3000, windowsHide: true });
    return String(result.stdout).trim();
  } catch {
    return null;
  }
}

async function collectWorkingTree(cwd) {
  const status = await gitOutput(cwd, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status === null) return { state: 'unknown', dirty: null, statusDigest: null };
  return { state: status ? 'dirty' : 'clean', dirty: Boolean(status), statusDigest: sha256(status) };
}

async function collectCandidateSha(cwd) {
  const value = await gitOutput(cwd, ['rev-parse', 'HEAD']);
  return value && /^[0-9a-f]{40}$/i.test(value) ? value : null;
}

function requirementAvailable(step, probes) {
  if (!step.requires) return true;
  return Boolean(probes[step.requires]);
}

/**
 * Run the local validation matrix and always return its report, including when a step fails.
 * Injecting execute/probes/metadata makes this function deterministic and keeps tests from
 * starting browsers, Docker, or real Agent sessions.
 */
export async function runValidation({
  cwd = process.cwd(),
  steps = sourceSteps({ cwd }),
  execute = step => executeArgv(step, { cwd }),
  probes,
  candidateSha,
  workingTree,
  runtime,
  now = isoNow,
  reportPath,
  writeReport: writeReportFn = writeValidationReport,
} = {}) {
  const actualProbes = probes ?? { chrome: await chromeAvailable(), docker: await dockerAvailable() };
  const actualCandidateSha = candidateSha === undefined ? await collectCandidateSha(cwd) : candidateSha;
  const actualWorkingTree = workingTree ?? await collectWorkingTree(cwd);
  const actualRuntime = runtime ?? await runtimeInfo();
  const records = [];
  for (const step of steps) {
    const startedAt = now();
    if (!requirementAvailable(step, actualProbes)) {
      records.push({
        id: step.id,
        title: step.title,
        command: { executable: step.executable, args: redactArgs(step.args, cwd) },
        status: 'skipped',
        exitCode: null,
        startedAt,
        finishedAt: now(),
        stdoutDigest: sha256(''),
        stderrDigest: sha256(''),
        skipReason: `${step.requires} unavailable`,
      });
      continue;
    }
    let result;
    try {
      result = await execute(step);
    } catch (error) {
      result = { status: 'failed', exitCode: null, stdout: '', stderr: String(error?.message ?? error), errorCode: 'EXECUTOR_FAILED' };
    }
    records.push({
      id: step.id,
      title: step.title,
      command: { executable: step.executable, args: redactArgs(step.args, cwd) },
      status: result.status,
      exitCode: result.exitCode,
      startedAt,
      finishedAt: now(),
      stdoutDigest: sha256(result.stdout ?? ''),
      stderrDigest: sha256(result.stderr ?? ''),
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    });
  }
  const passed = records.filter(step => step.status === 'passed').length;
  const failed = records.filter(step => step.status === 'failed').length;
  const skipped = records.filter(step => step.status === 'skipped').length;
  const report = {
    schema: REPORT_SCHEMA,
    collectedAt: now(),
    candidateSha: actualCandidateSha,
    workingTree: actualWorkingTree,
    runtime: actualRuntime,
    probes: actualProbes,
    steps: records,
    summary: { passed, failed, skipped, status: failed ? 'failed' : 'passed' },
  };
  const path = reportPath ?? defaultReportPath(cwd);
  await writeReportFn(path, report);
  return { report, reportPath: path, exitCode: failed ? 1 : 0 };
}

function defaultReportPath(cwd) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return join(cwd, 'docs', 'verification', `local-validation-${date}.json`);
}

function redactArgs(args, cwd) {
  const absoluteCwd = resolve(cwd);
  return args.map(arg => arg === absoluteCwd
    ? '<workspace>'
    : arg.startsWith(`${absoluteCwd}:`)
      ? `<workspace>${arg.slice(absoluteCwd.length)}`
      : arg.startsWith(`${absoluteCwd}/`)
        ? `<workspace>/${arg.slice(absoluteCwd.length + 1)}`
        : arg);
}

export async function writeValidationReport(path, report) {
  const absolute = isAbsolute(path) ? path : resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') options.output = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write('Usage: node scripts/local-validation-runner.mjs [--output <report.json>] [--json]\n');
    return 0;
  }
  const result = await runValidation({ reportPath: options.output });
  if (options.json) process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  else {
    process.stdout.write(`local validation ${result.report.summary.status}; report ${result.reportPath}\n`);
    for (const step of result.report.steps) process.stdout.write(`- ${step.id}: ${step.status}${step.skipReason ? ` (${step.skipReason})` : ''}\n`);
  }
  return result.exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`local validation failed before report creation: ${error?.message ?? error}\n`);
    process.exitCode = 1;
  });
}
