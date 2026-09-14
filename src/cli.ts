#!/usr/bin/env node
import { readFile, realpath, mkdir, lstat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { basename, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createClaudeAdapter } from './adapters/claude.js';
import { createCodexAdapter } from './adapters/codex.js';
import { createCursorAdapter } from './adapters/cursor.js';
import { CURSOR_TRANSCRIPT_WARNING } from './adapters/cursor-markdown.js';
import { CURSOR_INCOMPLETE_WARNING } from './adapters/cursor-evidence.js';
import { CURSOR_NATIVE_NOTE } from './adapters/cursor-native.js';
import { createGeminiAdapter } from './adapters/gemini.js';
import { parseCapsule, serializeCapsule } from './capsule.js';
import { renderCapsuleMarkdown } from './markdown.js';
import { detectTargets } from './targets.js';
import { assertDestination, writeArtifact } from './storage.js';
import { createHandoff, parseHandoff } from './handoff.js';

/** Local artifact export only: never launches an agent or executes next_action. */
export interface CliIo {
  stdout: { write(text: string): void };
  stderr: { write(text: string): void };
  cwd: () => string;
}
const adapters = { claude: createClaudeAdapter, codex: createCodexAdapter, cursor: createCursorAdapter, gemini: createGeminiAdapter };
type Target = keyof typeof adapters;
function target(value: string | undefined): Target {
  if (value && Object.hasOwn(adapters, value)) return value as Target;
  throw new Error('Supported agents: claude, codex, cursor, gemini.');
}
function fingerprint(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 24); }

/** Strict, order-independent parser. Every option may occur at most once. */
function options(argv: string[], values: string[], flags: string[] = []) {
  const named: Record<string, string> = {};
  const enabled = new Set<string>();
  const positional: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (!item.startsWith('-')) { positional.push(item); continue; }
    const key = item.slice(2);
    if (!item.startsWith('--') || (!values.includes(key) && !flags.includes(key))) throw new Error(`Unknown option: ${item}`);
    if (seen.has(key)) throw new Error(`Duplicate option: ${item}`);
    seen.add(key);
    if (flags.includes(key)) { enabled.add(key); continue; }
    const value = argv[++i];
    if (!value || value.startsWith('-')) throw new Error(`Missing value for ${item}`);
    named[key] = value;
  }
  return { named, enabled, positional };
}

function singleInput(positional: string[]): string {
  if (positional.length !== 1) throw new Error('Exactly one input path is required.');
  return positional[0];
}

async function defaultRoot(): Promise<string> {
  const user = process.getuid ? String(process.getuid()) : fingerprint(homedir());
  const root = join(tmpdir(), `threadport-${user}`);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Unsafe default output directory; use --out.');
  return root;
}

function usage(): string {
  return [
    'threadport extract --from claude|codex|cursor|gemini --session <path> --project <root> [--privacy portable|local] [--out <file>] [--force]',
    'threadport validate [--handoff] <capsule-or-envelope.json>',
    'threadport render <capsule.json>',
    'threadport handoff --to claude|codex|cursor|gemini <capsule.json> [--format markdown|json] [--out <file>] [--force]',
    'threadport targets'
  ].join('\n');
}

export async function runCli(argv: string[], io: CliIo = { stdout: process.stdout, stderr: process.stderr, cwd: () => process.cwd() }): Promise<number> {
  try {
    const [command, ...rest] = argv;
    if (command === undefined || command === '--help' || command === '-h') {
      io.stdout.write(`${usage()}\n`); return command ? 0 : 1;
    }
    if (command === 'targets') {
      if (rest.length) throw new Error('targets accepts no arguments.');
      io.stdout.write(`${JSON.stringify(await detectTargets(), null, 2)}\n`); return 0;
    }
    if (command === 'validate' || command === 'render') {
      const parsed = options(rest, [], command === 'validate' ? ['handoff'] : []);
      const text = await readFile(resolve(io.cwd(), singleInput(parsed.positional)), 'utf8');
      if (parsed.enabled.has('handoff')) { parseHandoff(text); io.stdout.write('valid\n'); return 0; }
      const capsule = parseCapsule(text);
      io.stdout.write(command === 'validate' ? 'valid\n' : `${renderCapsuleMarkdown(capsule)}\n`); return 0;
    }
    if (command === 'extract') {
      const { named, enabled, positional } = options(rest, ['from', 'session', 'project', 'out', 'privacy'], ['force']);
      if (positional.length || !named.project || !named.session) throw new Error('extract requires --session and --project, with no positional arguments.');
      const agent = target(named.from);
      const privacy = named.privacy ?? 'portable';
      if (privacy !== 'portable' && privacy !== 'local') throw new Error('--privacy must be portable or local.');
      const projectRoot = resolve(io.cwd(), named.project);
      const canonicalRoot = await realpath(projectRoot);
      const capsule = await adapters[agent]().extract({ sessionPath: resolve(io.cwd(), named.session), project: { name: basename(projectRoot) || 'project', root: projectRoot }, privacy });
      if (agent === 'cursor') for (const warning of [CURSOR_TRANSCRIPT_WARNING, CURSOR_INCOMPLETE_WARNING, CURSOR_NATIVE_NOTE]) {
        if (capsule.constraints.includes(warning)) io.stderr.write(`Warning: ${warning}\n`);
      }
      const output = named.out ? resolve(io.cwd(), named.out) : join(await defaultRoot(), `${fingerprint(canonicalRoot)}-${agent}`, `${capsule.id}.json`);
      if (!named.out) {
        const rel = relative(canonicalRoot, await realpath(await defaultRoot()));
        if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw new Error('Default output would be inside the project; choose --out outside it.');
      }
      const markdown = output.toLowerCase().endsWith('.json') ? `${output.slice(0, -5)}.md` : `${output}.md`;
      const force = enabled.has('force');
      // Reject invalid types or existing files before publishing either artifact.
      await assertDestination(output, force); await assertDestination(markdown, force);
      await writeArtifact(output, serializeCapsule(capsule), force);
      io.stdout.write(`${output}\n`);
      try {
        await writeArtifact(markdown, `${renderCapsuleMarkdown(capsule)}\n`, force);
        io.stdout.write(`${markdown}\n`);
      } catch (error) {
        io.stderr.write(`Capsule JSON saved; Markdown cache failed and can be regenerated with render: ${message(error)}\n`);
      }
      return 0;
    }
    if (command === 'handoff') {
      const { named, enabled, positional } = options(rest, ['to', 'format', 'out'], ['force']);
      const agent = target(named.to);
      const format = named.format ?? 'markdown';
      if (format !== 'markdown' && format !== 'json') throw new Error('--format must be markdown or json.');
      const input = resolve(io.cwd(), singleInput(positional));
      const capsule = parseCapsule(await readFile(input, 'utf8'));
      const output = named.out ? resolve(io.cwd(), named.out) : join(await defaultRoot(), 'handoff', fingerprint(await realpath(input)), `${capsule.id}.${agent}.${format === 'json' ? 'json' : 'md'}`);
      const prompt = `You are taking over a coding task from ThreadPort.\n\n${renderCapsuleMarkdown(capsule)}\n\nTarget agent: ${agent}\nReview the evidence and confirm the next action with the user. Do not execute commands until confirmed.\n`;
      const envelope = createHandoff(capsule, agent);
      await writeArtifact(output, format === 'json' ? `${JSON.stringify(envelope, null, 2)}\n` : prompt, enabled.has('force'));
      io.stdout.write(`${output}\n`); return 0;
    }
    throw new Error(`Unknown command: ${command}\n${usage()}`);
  } catch (error) { io.stderr.write(`${message(error)}\n`); return 1; }
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function isEntryPoint(): boolean {
  try { return Boolean(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url; }
  catch { return false; }
}
if (isEntryPoint()) {
  runCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
