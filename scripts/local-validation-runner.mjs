import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { access, mkdir, writeFile, readFile, rename, readdir, lstat, readlink } from 'node:fs/promises';
import { platform, arch, release } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

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

export function npmCommand(npmPath = process.env.npm_execpath) {
  if (!npmPath) {
    try { npmPath = createRequire(import.meta.url).resolve('npm/bin/npm-cli.js'); }
    catch { npmPath = join(dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js'); }
  }
  return { executable: process.execPath, args: [npmPath] };
}

function sourceSteps({ cwd = process.cwd(), packageOutput = process.env.THREADPORT_PACKAGE_OUTPUT ?? join(cwd, 'output', `package-local-validation-${randomUUID()}`) } = {}) {
  const npm = npmCommand();
  const script = (name) => ({ executable: npm.executable, args: [...npm.args, 'run', name] });
  return [
    { id: 'source-check', title: 'Source typecheck, build, tests, and docs', ...script('check') },
    { id: 'browser-e2e', title: 'Production browser flow', ...script('test:e2e'), requires: 'chrome', env: { THREADPORT_TEST_CHROME: '1' } },
    { id: 'package-smoke', title: 'Isolated package smoke test', ...script('test:package'), requires: 'chrome', env: { THREADPORT_TEST_CHROME: '1', THREADPORT_PACKAGE_OUTPUT: packageOutput } },
    { id: 'linux-container', title: 'Linux Node 24 container check', executable: 'docker', args: ['run', '--rm', '-v', `${resolve(cwd)}:/source:ro`, 'node:24-bookworm', 'node', '/source/scripts/local-validation-container.mjs'], requires: 'docker' },
  ];
}

export const defaultSteps = sourceSteps;

function commandLabel(step) {
  return [step.executable, ...step.args].map(value => JSON.stringify(value)).join(' ');
}

/** Execute one argv command. `shell` is always false so input cannot become shell syntax. */
export function executeArgv(step, { cwd = process.cwd(), timeoutMs = step.timeoutMs ?? DEFAULT_TIMEOUT_MS } = {}) {
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

export async function chromeAvailable({ locate = commandAvailable, exists = access, host = process.platform } = {}) {
  const names = host === 'win32'
    ? ['chrome.exe']
    : process.platform === 'darwin'
      ? ['google-chrome']
      : ['google-chrome'];
  if ((await Promise.all(names.map(name => locate(name)))).some(Boolean)) return true;
  if (host === 'darwin') {
    for (const path of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) {
      try { await exists(path); return true; } catch { /* unavailable */ }
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
    const command = npmCommand();
    const result = await execFileAsync(command.executable, [...command.args, '--version'], { timeout: 3000, windowsHide: true });
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

export async function sourceDigest(cwd) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { maxBuffer: 16 * 1024 * 1024 });
  const hash = createHash('sha256');
  for (const path of [...new Set(stdout.split('\0').filter(Boolean))].sort()) {
    if (/^(output|node_modules|dist)\//.test(path)) continue;
    hash.update(path + '\0');
    try {
      const absolute = join(cwd, path);
      const stat = await lstat(absolute);
      hash.update(String(stat.mode) + '\0');
      hash.update(stat.isSymbolicLink() ? await readlink(absolute) : await readFile(absolute));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update('<deleted>');
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function packageDigests(step) {
  const directory = step.env?.THREADPORT_PACKAGE_OUTPUT;
  if (!directory) return [];
  try {
    const files = await readdir(directory);
    return await Promise.all(files.filter(name => name.endsWith('.tgz')).sort().map(async name => ({ filename: name, sha256: sha256(await readFile(join(directory, name))) })));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
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
  sourceHash,
  now = isoNow,
  reportPath,
  writeReport: writeReportFn = writeValidationReport,
} = {}) {
  const actualProbes = probes ?? { chrome: await chromeAvailable(), docker: await dockerAvailable() };
  const actualCandidateSha = candidateSha === undefined ? await collectCandidateSha(cwd) : candidateSha;
  const actualWorkingTree = workingTree ?? await collectWorkingTree(cwd);
  const actualRuntime = runtime ?? await runtimeInfo();
  const records = [];
  const path = reportPath ?? defaultReportPath(cwd);
  const report = {
    schema: REPORT_SCHEMA, collectedAt: now(), candidateSha: actualCandidateSha,
    workingTree: actualWorkingTree, sourceHash: sourceHash ?? await sourceDigest(cwd),
    runtime: actualRuntime, probes: actualProbes, steps: records,
    summary: { passed: 0, failed: 0, skipped: 0, status: 'running' },
  };
  const persist = async (complete = false) => {
    const passed = records.filter(step => step.status === 'passed').length;
    const failed = records.filter(step => step.status === 'failed').length;
    const skipped = records.filter(step => step.status === 'skipped').length;
    report.summary = { passed, failed, skipped, status: complete ? (failed ? 'failed' : skipped ? 'incomplete' : 'passed') : 'running' };
    await writeReportFn(path, report);
  };
  await persist();
  for (const step of steps) {
    const startedAt = now();
    if (!requirementAvailable(step, actualProbes)) {
      records.push({
        id: step.id,
        title: step.title,
        command: { executable: redactArgs([step.executable], cwd)[0], args: redactArgs(step.args, cwd) },
        status: 'skipped',
        exitCode: null,
        startedAt,
        finishedAt: now(),
        stdoutDigest: sha256(''),
        stderrDigest: sha256(''),
        skipReason: `${step.requires} unavailable`,
      });
      await persist();
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
      command: { executable: redactArgs([step.executable], cwd)[0], args: redactArgs(step.args, cwd) },
      status: result.status,
      exitCode: result.exitCode,
      startedAt,
      finishedAt: now(),
      stdoutDigest: sha256(result.stdout ?? ''),
      stderrDigest: sha256(result.stderr ?? ''),
      packages: await packageDigests(step),
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    });
    await persist();
  }
  await persist(true);
  return { report, reportPath: path, exitCode: report.summary.failed ? 1 : 0 };
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
  const temporary = `${absolute}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
  await rename(temporary, absolute);
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`local validation failed before report creation: ${error?.message ?? error}\n`);
    process.exitCode = 1;
  });
}
