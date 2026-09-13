import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { validateCapsule } from "../capsule.js";
import { readGitState } from "../git.js";
import { redactSecrets } from "../redact.js";
import type {
  Capsule,
  CapsuleCommand,
  CapsuleDecision,
  CapsuleEvidence,
  CapsuleFailure,
  CapsuleFile,
  CapsuleStatus,
  CapsuleTest,
  FileAction
} from "../types.js";
import type { SessionAdapter, SessionExtractInput } from "./types.js";
import { assembleCapsule } from "./common.js";
import { redactRecords } from '../privacy.js';

const DEFAULT_NEXT_ACTION = "Review the capsule and confirm the next edit.";
const DERIVED_ACCEPTANCE_NOTE =
  "acceptance_criteria is derived from the objective; the session did not state explicit acceptance criteria.";
const TEST_COMMAND = /(?:^|[\s/])(?:npm(?:\s+run)?\s+test|npx\s+vitest|vitest|pytest|go\s+test|cargo\s+test|mvn\s+test|gradle(?:w)?\s+test|jest|bun\s+test)\b/i;
const SPOKEN_DECISION = /^(?:I(?:'ll| will)|Let's|I am going to)\b/i;
const USER_DONE = /^\s*(?:done|completed|that'?s all|finished|lgtm)[.!]?\s*$/i;
const PATCH_FILE = /\*\*\*\s+(Add|Update|Delete)\s+File:\s+(\S+)/g;
const SHELL_TOOLS = new Set(["shell", "exec_command", "local_shell", "bash"]);

/**
 * Codex session adapter.
 *
 * Codex CLI rollouts are treated as observed local traces, not as a
 * vendor specification. Reasoning items are dropped before mapping.
 */
export function createCodexAdapter(): SessionAdapter {
  return {
    agent: "codex",
    extract: extractCodexSession
  };
}

async function extractCodexSession(input: SessionExtractInput): Promise<Capsule> {
  const sessionText = await loadSessionText(input);
  const { records, count } = redactRecords(parseSessionRecords(sessionText));
  const traces = collectTraces(records);
  const sessionId = resolveSessionId(records, input.sessionPath);
  return assembleCapsule({
    agent: "codex",
    sessionId,
    redactionCount: count,
    traces,
    input,
    evidenceTitle: "Codex session"
  });
}

function collectTraces(records: SessionRecord[]): SessionTraces {
  const files = new Map<string, CapsuleFile>();
  const commands: CapsuleCommand[] = [];
  const tests: CapsuleTest[] = [];
  const decisions: CapsuleDecision[] = [];
  const completed: string[] = [];
  const userTexts: string[] = [];
  const outputs = indexOutputs(records);
  let lastUserIndex = -1;
  let lastToolIndex = -1;
  let lastSpokenAfterFailure: string | undefined;
  let sawUnresolvedFailure = false;

  records.forEach((record, index) => {
    const item = payload(record);
    if (isHiddenItem(item)) {
      return;
    }

    const role = messageRole(item);
    if (role === "user") {
      const text = visibleText(item);
      if (text) {
        userTexts.push(text);
        lastUserIndex = index;
      }
      return;
    }

    if (role === "assistant") {
      const text = visibleText(item);
      if (text && SPOKEN_DECISION.test(text)) {
        decisions.push({ decision: firstSentence(text) });
      }
      if (text && sawUnresolvedFailure) {
        lastSpokenAfterFailure = firstSentence(text);
      }
      return;
    }

    if (asString(item.type) !== "function_call") {
      return;
    }
    lastToolIndex = index;
    const name = (asString(item.name) ?? "").toLowerCase();
    const args = parseArguments(item.arguments);
    const callId = asString(item.call_id);
    const result = callId ? outputs.get(callId) : undefined;

    if (name === "apply_patch" || name === "apply_patch_file") {
      for (const file of filesFromPatch(asString(args.patch) ?? asString(args.input) ?? JSON.stringify(args))) {
        if (!files.has(file.path)) {
          files.set(file.path, file);
        }
        completed.push(fileCompletion(file.action, file.path));
      }
      return;
    }

    if (!SHELL_TOOLS.has(name)) {
      return;
    }
    const command = asString(args.command) ?? asString(args.cmd);
    if (!command) {
      return;
    }
    const exitCode = parseExitCode(result);
    const summary = result ? summarize(result) : undefined;
    commands.push({
      command,
      ...(exitCode === undefined ? {} : { exit_code: exitCode }),
      ...(summary ? { summary } : {})
    });
    if (isTestCommand(command)) {
      tests.push({
        command,
        status: testStatus(exitCode),
        ...(summary ? { summary } : {})
      });
    }
    if (exitCode === 0) {
      completed.push(`Ran \`${command}\` (exit 0).`);
      sawUnresolvedFailure = false;
    } else if (exitCode !== undefined) {
      sawUnresolvedFailure = true;
    }
  });

  const objective = firstLine(userTexts[0] ?? "Resume the recorded Codex session.");
  const acceptanceCriteria = extractAcceptance(userTexts[0] ?? "");
  const constraints = extractConstraints(userTexts);
  const failures = collapseFailures(commands);
  const lastUserText = userTexts.at(-1) ?? "";
  const userDeclaredDone = USER_DONE.test(lastUserText);
  const unresolvedFailures = failures.some((item) => !item.resolution);
  const openUserInstruction = lastUserIndex > lastToolIndex && lastUserText && !userDeclaredDone
    ? firstLine(lastUserText)
    : undefined;

  return {
    objective,
    acceptanceCriteria,
    constraints,
    files,
    commands,
    tests,
    failures,
    decisions,
    completed: unique(completed),
    nextAction: openUserInstruction
      ?? (unresolvedFailures ? lastSpokenAfterFailure : undefined)
      ?? DEFAULT_NEXT_ACTION,
    status: userDeclaredDone ? "completed" : unresolvedFailures ? "blocked" : "active"
  };
}

function indexOutputs(records: SessionRecord[]): Map<string, string> {
  const outputs = new Map<string, string>();
  for (const record of records) {
    const item = payload(record);
    if (asString(item.type) !== "function_call_output") {
      continue;
    }
    const id = asString(item.call_id);
    if (id) {
      outputs.set(id, outputText(item.output));
    }
  }
  return outputs;
}

function payload(record: SessionRecord): SessionRecord {
  return isRecord(record.payload) ? record.payload : record;
}

function isHiddenItem(item: SessionRecord): boolean {
  const type = asString(item.type) ?? "";
  return /reasoning|thinking/.test(type);
}

function messageRole(item: SessionRecord): string | undefined {
  if (asString(item.type) === "message") {
    return asString(item.role);
  }
  return undefined;
}

function visibleText(item: SessionRecord): string {
  const content = item.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(isRecord)
    .filter((block) => {
      const type = asString(block.type) ?? "";
      return type === "input_text" || type === "output_text" || type === "text";
    })
    .map((block) => asString(block.text) ?? "")
    .join("\n")
    .trim();
}

function filesFromPatch(patch: string): CapsuleFile[] {
  const files: CapsuleFile[] = [];
  for (const match of patch.matchAll(PATCH_FILE)) {
    const kind = match[1];
    const path = match[2];
    if (!kind || !path) {
      continue;
    }
    const action: FileAction = kind === "Add" ? "added" : kind === "Delete" ? "deleted" : "modified";
    files.push({
      path,
      action,
      summary: action === "added" ? "Created in session." : "Edited in session."
    });
  }
  return files;
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : { command: value };
    } catch {
      return { command: value };
    }
  }
  return {};
}

function outputText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value)) {
    return asString(value.content) ?? asString(value.output) ?? JSON.stringify(value);
  }
  return "";
}

function parseExitCode(text: string | undefined): number | undefined {
  if (!text) {
    return undefined;
  }
  const tagged = text.match(/<exit_code>\s*(-?\d+)\s*<\/exit_code>/i);
  if (tagged?.[1]) {
    return Number(tagged[1]);
  }
  const labeled = text.match(/exit(?:[\s_-]*)code\s*[:=]\s*(-?\d+)/i);
  if (labeled?.[1]) {
    return Number(labeled[1]);
  }
  return undefined;
}

async function loadSessionText(input: SessionExtractInput): Promise<string> {
  if (typeof input.sessionText === "string") {
    return input.sessionText;
  }
  if (!input.sessionPath) {
    throw new Error("SessionExtractInput requires sessionPath or sessionText.");
  }
  return readFile(input.sessionPath, "utf8");
}

function parseSessionRecords(text: string): SessionRecord[] {
  const records: SessionRecord[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) {
        records.push(parsed);
      }
    } catch {
      throw new Error(`Invalid Codex session JSONL at line ${index + 1}.`);
    }
  }
  return records;
}

function resolveSessionId(records: SessionRecord[], sessionPath?: string): string {
  for (const record of records) {
    const item = payload(record);
    const sessionId = asString(item.id) ?? asString(record.sessionId);
    if (sessionId?.trim() && (asString(record.type) === "session_meta" || asString(item.id))) {
      if (asString(record.type) === "session_meta" || asString(item.type) === "session_meta") {
        return sessionId.trim();
      }
    }
  }
  for (const record of records) {
    const item = payload(record);
    if (asString(record.type) === "session_meta") {
      const sessionId = asString(item.id)?.trim();
      if (sessionId) {
        return sessionId;
      }
    }
  }
  if (sessionPath) {
    const fromName = basename(sessionPath).replace(/\.[^.]+$/, "");
    if (fromName) {
      return fromName;
    }
  }
  return "codex-session";
}

function resolveCreatedAt(now: Date | undefined, records: SessionRecord[]): string {
  if (now) {
    return now.toISOString();
  }
  for (const record of records) {
    const timestamp = asString(record.timestamp);
    if (timestamp && !Number.isNaN(Date.parse(timestamp))) {
      return new Date(timestamp).toISOString();
    }
  }
  return new Date().toISOString();
}

function sanitizeCapsuleId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  return cleaned.slice(0, 128) || "codex-session";
}

function extractAcceptance(userText: string): string[] {
  const items: string[] = [];
  let inAcceptance = false;
  for (const line of userText.split(/\r?\n/)) {
    if (/^acceptance(?:\s+criteria)?\s*:/i.test(line.trim())) {
      inAcceptance = true;
      const rest = line.replace(/^acceptance(?:\s+criteria)?\s*:/i, "").trim();
      if (rest) {
        items.push(rest.replace(/^[-*]\s*/, ""));
      }
      continue;
    }
    if (!inAcceptance) {
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (bullet?.[1]) {
      items.push(bullet[1].trim());
      continue;
    }
    if (line.trim()) {
      break;
    }
  }
  return items;
}

function extractConstraints(userTexts: string[]): string[] {
  const constraints: string[] = [];
  for (const text of userTexts) {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim().replace(/^[-*]\s+/, "");
      if (/^do not\b/i.test(trimmed) || /^don't\b/i.test(trimmed)) {
        constraints.push(trimmed);
      }
    }
  }
  return unique(constraints);
}

function collapseFailures(commands: CapsuleCommand[]): CapsuleFailure[] {
  const failures: CapsuleFailure[] = [];
  const seen = new Set<string>();
  for (const [index, command] of commands.entries()) {
    if (command.exit_code === undefined || command.exit_code === 0 || seen.has(command.command)) {
      continue;
    }
    seen.add(command.command);
    const laterPass = commands.slice(index + 1).some((item) => {
      return item.command === command.command && item.exit_code === 0;
    });
    failures.push({
      summary: command.summary ?? `Command failed: ${command.command}`,
      ...(laterPass ? { resolution: `Retried \`${command.command}\` and it passed.` } : {})
    });
  }
  return failures;
}

function buildEvidence(
  sessionPath: string | undefined,
  files: CapsuleFile[],
  commands: CapsuleCommand[]
): CapsuleEvidence[] {
  const evidence: CapsuleEvidence[] = [{
    kind: "session",
    title: "Codex session",
    locator: sessionPath ?? "inline-session"
  }];
  for (const file of files) {
    evidence.push({ kind: "file", title: file.path, locator: file.path });
  }
  for (const command of commands) {
    evidence.push({ kind: "command", title: command.command, locator: command.command });
  }
  return evidence;
}

function isTestCommand(command: string): boolean {
  return TEST_COMMAND.test(command);
}

function testStatus(exitCode: number | undefined): CapsuleTest["status"] {
  if (exitCode === 0) {
    return "passed";
  }
  if (exitCode === undefined) {
    return "unknown";
  }
  return "failed";
}

function fileCompletion(action: FileAction, path: string): string {
  if (action === "added") {
    return `Wrote ${path}.`;
  }
  if (action === "deleted") {
    return `Deleted ${path}.`;
  }
  return `Edited ${path}.`;
}

function redactField(value: string, tally: { count: number }): string {
  const result = redactSecrets(value);
  tally.count += result.count;
  return result.text;
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? text.trim();
}

function firstSentence(text: string): string {
  const match = text.trim().match(/^[\s\S]+?[.!?](?=\s|$)/);
  return (match?.[0] ?? text).trim();
}

function summarize(text: string, max = 180): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SessionRecord = Record<string, unknown>;

interface SessionTraces {
  objective: string;
  acceptanceCriteria: string[];
  constraints: string[];
  files: Map<string, CapsuleFile>;
  commands: CapsuleCommand[];
  tests: CapsuleTest[];
  failures: CapsuleFailure[];
  decisions: CapsuleDecision[];
  completed: string[];
  nextAction: string;
  status: CapsuleStatus;
}
