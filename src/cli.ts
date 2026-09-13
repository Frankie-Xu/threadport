#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { createClaudeAdapter } from "./adapters/claude.js";
import { createCodexAdapter } from "./adapters/codex.js";
import { createCursorAdapter } from "./adapters/cursor.js";
import { createGeminiAdapter } from "./adapters/gemini.js";
import type { SessionAdapter } from "./adapters/types.js";
import { parseCapsule, serializeCapsule, validateCapsule } from "./capsule.js";
import { renderCapsuleMarkdown } from "./markdown.js";

/**
 * Read-only ThreadPort handoff CLI.
 *
 * extract / validate / render only. There is no apply, exec, or resume
 * command, and next_action is never executed.
 */
export interface CliIo {
  stdout: { write(text: string): void };
  stderr: { write(text: string): void };
  cwd: () => string;
}

export async function runCli(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  const command = argv[0];
  try {
    if (command === "extract") {
      return await extractCommand(argv.slice(1), io);
    }
    if (command === "validate") {
      return await validateCommand(argv.slice(1), io);
    }
    if (command === "render") {
      return await renderCommand(argv.slice(1), io);
    }
    if (command === "handoff") {
      return await handoffCommand(argv.slice(1), io);
    }
    if (command === "--help" || command === "-h" || command === undefined) {
      io.stdout.write(`${usage()}\n`);
      return command ? 0 : 1;
    }
    io.stderr.write(`Unknown command: ${command}\n${usage()}\n`);
    return 1;
  } catch (error) {
    io.stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }
}

function defaultIo(): CliIo {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    cwd: () => process.cwd()
  };
}

function usage(): string {
  return [
    "threadport extract --from claude|codex|cursor|gemini --session <path> --project <root> [--out <file>] [--force]",
    "threadport validate <capsule.json>",
    "threadport render <capsule.json>",
    "threadport handoff --to claude|codex|cursor|gemini <capsule.json> [--out <file>] [--force]"
  ].join("\n");
}

async function extractCommand(argv: string[], io: CliIo): Promise<number> {
  const flags = parseExtractFlags(argv);
  const adapter = adapterFor(flags.from);
  if (!flags.session || !flags.project) {
    throw new Error("extract requires --session and --project.");
  }

  const projectRoot = resolve(io.cwd(), flags.project);
  const capsule = await adapter.extract({
    sessionPath: resolve(io.cwd(), flags.session),
    project: {
      name: basename(projectRoot) || "project",
      root: projectRoot
    }
  });
  validateCapsule(capsule);

  let jsonPath = flags.out
    ? resolvePath(io.cwd(), flags.out)
    : join(io.cwd(), ".threadport", `${capsule.id}.json`);
  if (!flags.out) {
    try {
      const existing = parseCapsule(await readFile(jsonPath, "utf8"));
      if (existing.project.root !== capsule.project.root) {
        jsonPath = join(io.cwd(), ".threadport", projectFingerprint(projectRoot), `${capsule.id}.json`);
      }
    } catch {
      // No readable existing capsule; use the conventional path.
    }
  }
  const markdownPath = siblingMarkdown(jsonPath);
  await assertWritable(jsonPath, flags.force);
  await assertWritable(markdownPath, flags.force === true);
  await mkdir(dirname(jsonPath), { recursive: true });
  await atomicWrite(jsonPath, serializeCapsule(capsule));
  await atomicWrite(markdownPath, `${renderCapsuleMarkdown(capsule)}\n`);
  io.stdout.write(`${jsonPath}\n${markdownPath}\n`);
  return 0;
}

function projectFingerprint(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 12);
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, "utf8");
    const { rename } = await import("node:fs/promises");
    await rename(temporary, path);
  } catch (error) {
    const { unlink } = await import("node:fs/promises");
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function validateCommand(argv: string[], io: CliIo): Promise<number> {
  const file = argv[0];
  if (!file || argv.length !== 1) {
    throw new Error("validate requires a single Capsule JSON path.");
  }
  parseCapsule(await readFile(resolvePath(io.cwd(), file), "utf8"));
  io.stdout.write("valid\n");
  return 0;
}

async function renderCommand(argv: string[], io: CliIo): Promise<number> {
  const file = argv[0];
  if (!file || argv.length !== 1) {
    throw new Error("render requires a single Capsule JSON path.");
  }
  const capsule = parseCapsule(await readFile(resolvePath(io.cwd(), file), "utf8"));
  io.stdout.write(`${renderCapsuleMarkdown(capsule)}\n`);
  return 0;
}

async function handoffCommand(argv: string[], io: CliIo): Promise<number> {
  const toIndex = argv.indexOf("--to");
  const target = toIndex >= 0 ? argv[toIndex + 1] : undefined;
  const force = argv.includes("--force");
  const outIndex = argv.indexOf("--out");
  const input = argv.find((item, index) => !item.startsWith("--") && index !== toIndex + 1 && index !== outIndex + 1);
  if (!target || !["claude", "codex", "cursor", "gemini"].includes(target) || !input) {
    throw new Error("handoff requires --to claude|codex|cursor|gemini and a Capsule JSON path.");
  }
  const capsule = parseCapsule(await readFile(resolvePath(io.cwd(), input), "utf8"));
  const output = outIndex >= 0 && argv[outIndex + 1]
    ? resolvePath(io.cwd(), argv[outIndex + 1])
    : join(io.cwd(), ".threadport", `${capsule.id}.${target}.md`);
  await assertWritable(output, force);
  await mkdir(dirname(output), { recursive: true });
  const prompt = `You are taking over a coding task from ThreadPort.\n\n${renderCapsuleMarkdown(capsule)}\n\nTarget agent: ${target}\nReview the evidence above, confirm the next action with the user, and do not execute commands until confirmed.`;
  await atomicWrite(output, prompt);
  io.stdout.write(`${output}\n`);
  return 0;
}

function adapterFor(from: string | undefined): SessionAdapter {
  if (from === "claude") {
    return createClaudeAdapter();
  }
  if (from === "codex") {
    return createCodexAdapter();
  }
  if (from === "cursor") {
    return createCursorAdapter();
  }
  if (from === "gemini") {
    return createGeminiAdapter();
  }
  throw new Error("Unsupported --from value. Supported: claude, codex, cursor, gemini.");
}

function parseExtractFlags(argv: string[]): {
  from?: string;
  session?: string;
  project?: string;
  out?: string;
  force: boolean;
} {
  const flags: {
    from?: string;
    session?: string;
    project?: string;
    out?: string;
    force: boolean;
  } = { force: false };
  const keys = new Set(["from", "session", "project", "out"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--force") {
      flags.force = true;
      continue;
    }
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (!keys.has(key)) {
      throw new Error(`Unknown option: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    flags[key as "from" | "session" | "project" | "out"] = value;
    index += 1;
  }
  return flags;
}

async function assertWritable(path: string, force: boolean): Promise<void> {
  try {
    await stat(path);
  } catch {
    return;
  }
  if (!force) {
    throw new Error(`Refusing to overwrite ${path} without --force.`);
  }
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function siblingMarkdown(jsonPath: string): string {
  return jsonPath.toLowerCase().endsWith(".json")
    ? `${jsonPath.slice(0, -5)}.md`
    : `${jsonPath}.md`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && pathToFileURL(resolve(entry)).href === import.meta.url;
}

if (isMainModule()) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
