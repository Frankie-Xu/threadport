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

const DEFAULT_NEXT_ACTION = "Review the capsule and confirm the next edit.";
const DERIVED_ACCEPTANCE_NOTE =
  "acceptance_criteria is derived from the objective; the session did not state explicit acceptance criteria.";

const FILE_TOOL_ACTIONS: Record<string, FileAction> = {
  Write: "added",
  write: "added",
  write_file: "added",
  Create: "added",
  Edit: "modified",
  edit: "modified",
  edit_file: "modified",
  StrReplace: "modified",
  NotebookEdit: "modified",
  Delete: "deleted",
  delete_file: "deleted"
};

const SHELL_TOOLS = new Set(["Bash", "bash", "Shell", "shell"]);
const TEST_COMMAND = /(?:^|[\s/])(?:npm(?:\s+run)?\s+test|npx\s+vitest|vitest|pytest|go\s+test|cargo\s+test|mvn\s+test|gradle(?:w)?\s+test|jest|bun\s+test)\b/i;
const SPOKEN_DECISION = /^(?:I(?:'ll| will)|Let's|I am going to)\b/i;
const USER_DONE = /^\s*(?:done|completed|that'?s all|finished|lgtm)[.!]?\s*$/i;
const HIDDEN_BLOCK = /thinking|reasoning/i;

/**
 * Claude Code session adapter.
 *
 * The on-disk transcript is treated as an observed local trace, not as a
 * vendor specification. Only user text, spoken assistant text, and tool
 * calls are copied into Capsule fields. Thinking / redacted-reasoning
 * blocks are dropped before mapping.
 */
export function createClaudeAdapter(): SessionAdapter {
  return {
    agent: "claude",
    extract: extractClaudeSession
  };
}

async function extractClaudeSession(input: SessionExtractInput): Promise<Capsule> {
  const sessionText = await loadSessionText(input);
  const records = parseSessionRecords(sessionText);
  const traces = collectTraces(records);
  const sessionId = resolveSessionId(records, input.sessionPath);
  const createdAt = resolveCreatedAt(input.now, records);
  const tally = { count: 0 };

  const objective = redactField(traces.objective, tally);
  const acceptance = traces.acceptanceCriteria.length > 0
    ? traces.acceptanceCriteria.map((item) => redactField(item, tally))
    : [redactField(`The objective is satisfied: ${traces.objective}`, tally)];

  const constraints = traces.constraints.map((item) => redactField(item, tally));
  if (traces.acceptanceCriteria.length === 0) {
    constraints.push(DERIVED_ACCEPTANCE_NOTE);
  }

  const files = [...traces.files.values()].map((file) => ({
    path: redactField(file.path, tally),
    action: file.action,
    ...(file.summary ? { summary: redactField(file.summary, tally) } : {})
  }));

  const commands = traces.commands.map((command) => ({
    command: redactField(command.command, tally),
    ...(command.exit_code === undefined ? {} : { exit_code: command.exit_code }),
    ...(command.summary ? { summary: redactField(command.summary, tally) } : {})
  }));

  const tests = traces.tests.map((item) => ({
    command: redactField(item.command, tally),
    status: item.status,
    ...(item.summary ? { summary: redactField(item.summary, tally) } : {})
  }));

  const failures = traces.failures.map((item) => ({
    summary: redactField(item.summary, tally),
    ...(item.resolution ? { resolution: redactField(item.resolution, tally) } : {})
  }));

  const decisions = traces.decisions.map((item) => ({
    decision: redactField(item.decision, tally),
    ...(item.rationale ? { rationale: redactField(item.rationale, tally) } : {})
  }));

  const completed = traces.completed.map((item) => redactField(item, tally));
  const nextAction = redactField(traces.nextAction, tally);
  const evidence = buildEvidence(input.sessionPath, files, commands).map((item) => ({
    kind: item.kind,
    title: redactField(item.title, tally),
    ...(item.locator ? { locator: redactField(item.locator, tally) } : {})
  }));

  return validateCapsule({
    schema_version: "1.0",
    id: sanitizeCapsuleId(sessionId),
    created_at: createdAt,
    source_agent: "claude",
    source_session_id: sessionId,
    project: {
      name: input.project.name,
      root: input.project.root,
      ...(input.project.repository ? { repository: input.project.repository } : {})
    },
    objective,
    acceptance_criteria: acceptance,
    status: traces.status,
    completed,
    decisions,
    constraints,
    files,
    commands,
    tests,
    failures,
    next_action: nextAction,
    evidence,
    git: await readGitState(input.project.root),
    redaction: {
      applied: tally.count > 0,
      count: tally.count
    }
  });
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
      throw new Error(`Invalid Claude session JSONL at line ${index + 1}.`);
    }
  }
  return records;
}

/**
 * Flatten JSONL records into the observable traces Capsule v1 can store.
 * Hidden reasoning is excluded here so later steps cannot leak it.
 */
function collectTraces(records: SessionRecord[]): SessionTraces {
  const files = new Map<string, CapsuleFile>();
  const commands: CapsuleCommand[] = [];
  const tests: CapsuleTest[] = [];
  const decisions: CapsuleDecision[] = [];
  const completed: string[] = [];
  const userTexts: string[] = [];
  const resultByToolId = indexToolResults(records);

  let lastUserIndex = -1;
  let lastToolIndex = -1;
  let lastSpokenAfterFailure: string | undefined;
  let sawUnresolvedFailure = false;

  records.forEach((record, index) => {
    const role = asString(asRecord(record.message)?.role) ?? asString(record.type);
    const blocks = contentBlocks(asRecord(record.message)?.content);

    if (role === "user" && !isToolResultOnly(blocks)) {
      const text = visibleText(blocks);
      if (text) {
        userTexts.push(text);
        lastUserIndex = index;
      }
      return;
    }

    if (role !== "assistant") {
      return;
    }

    for (const block of blocks) {
      if (isHiddenBlock(block)) {
        continue;
      }
      if (block.type === "text") {
        const text = asString(block.text)?.trim();
        if (text && SPOKEN_DECISION.test(text)) {
          decisions.push({ decision: firstSentence(text) });
        }
        if (text && sawUnresolvedFailure) {
          lastSpokenAfterFailure = firstSentence(text);
        }
        continue;
      }
      if (block.type !== "tool_use") {
        continue;
      }

      lastToolIndex = index;
      const name = asString(block.name) ?? "";
      const input = isRecord(block.input) ? block.input : {};
      const toolId = asString(block.id);
      const result = toolId ? resultByToolId.get(toolId) : undefined;

      const filePath = toolPath(input);
      const fileAction = FILE_TOOL_ACTIONS[name];
      if (filePath && fileAction) {
        if (!files.has(filePath)) {
          files.set(filePath, {
            path: filePath,
            action: fileAction,
            summary: fileAction === "added" ? "Created in session." : "Edited in session."
          });
        }
        completed.push(fileCompletion(fileAction, filePath));
      }

      if (!SHELL_TOOLS.has(name)) {
        continue;
      }
      const command = asString(input.command)?.trim();
      if (!command) {
        continue;
      }
      const exitCode = parseExitCode(result);
      const summary = result?.text ? summarize(result.text) : undefined;
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
    }
  });

  const objective = firstLine(userTexts[0] ?? "Resume the recorded Claude Code session.");
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

function indexToolResults(records: SessionRecord[]): Map<string, ToolResult> {
  const results = new Map<string, ToolResult>();
  for (const record of records) {
    const blocks = contentBlocks(asRecord(record.message)?.content);
    for (const block of blocks) {
      if (block.type !== "tool_result") {
        continue;
      }
      const id = asString(block.tool_use_id);
      if (!id) {
        continue;
      }
      results.set(id, {
        text: blockText(block.content),
        isError: block.is_error === true
      });
    }
  }
  return results;
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
    title: "Claude Code session",
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

function resolveSessionId(records: SessionRecord[], sessionPath?: string): string {
  for (const record of records) {
    const sessionId = asString(record.sessionId)?.trim();
    if (sessionId) {
      return sessionId;
    }
  }
  if (sessionPath) {
    const fromName = basename(sessionPath).replace(/\.[^.]+$/, "");
    if (fromName) {
      return fromName;
    }
  }
  return "claude-session";
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
  return cleaned.slice(0, 128) || "claude-session";
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

function contentBlocks(content: unknown): ContentBlock[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter(isRecord);
}

function visibleText(blocks: ContentBlock[]): string {
  return blocks
    .filter((block) => block.type === "text" || block.type === undefined)
    .map((block) => asString(block.text) ?? "")
    .join("\n")
    .trim();
}

function isToolResultOnly(blocks: ContentBlock[]): boolean {
  return blocks.length > 0 && blocks.every((block) => block.type === "tool_result");
}

function isHiddenBlock(block: ContentBlock): boolean {
  return typeof block.type === "string" && HIDDEN_BLOCK.test(block.type);
}

function toolPath(input: Record<string, unknown>): string | undefined {
  for (const key of ["file_path", "path", "target_file", "filePath"]) {
    const value = asString(input[key])?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function parseExitCode(result: ToolResult | undefined): number | undefined {
  if (!result) {
    return undefined;
  }
  const tagged = result.text.match(/<exit_code>\s*(-?\d+)\s*<\/exit_code>/i);
  if (tagged?.[1]) {
    return Number(tagged[1]);
  }
  const labeled = result.text.match(/exit(?:[\s_-]*)code\s*[:=]\s*(-?\d+)/i);
  if (labeled?.[1]) {
    return Number(labeled[1]);
  }
  if (result.isError) {
    return 1;
  }
  return undefined;
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

function blockText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (isRecord(item)) {
          return asString(item.text) ?? blockText(item.content);
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SessionRecord = Record<string, unknown>;
type ContentBlock = Record<string, unknown>;

interface ToolResult {
  text: string;
  isError: boolean;
}

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
