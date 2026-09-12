import type { FileAction } from "../types.js";
import type { SessionAdapter, SessionExtractInput } from "./types.js";
import {
  assembleCapsule,
  asString,
  contentText,
  isHiddenType,
  isRecord,
  loadSessionText,
  parseExitCode,
  parseSessionRecords,
  sessionIdFrom,
  tracesFromEvents,
  type SessionRecord,
  type TraceEvent
} from "./common.js";

const FILE_TOOLS: Record<string, FileAction> = {
  Write: "added",
  write: "added",
  StrReplace: "modified",
  Edit: "modified",
  Delete: "deleted",
  delete: "deleted"
};
const SHELL_TOOLS = new Set(["Shell", "shell", "Bash", "bash"]);

/**
 * Cursor session adapter.
 *
 * Agent-transcript JSONL is treated as an observed local trace, not as a
 * vendor specification. Thinking blocks are dropped before mapping.
 */
export function createCursorAdapter(): SessionAdapter {
  return {
    agent: "cursor",
    extract: extractCursorSession
  };
}

async function extractCursorSession(input: SessionExtractInput): Promise<import("../types.js").Capsule> {
  const records = parseSessionRecords(await loadSessionText(input), "Cursor");
  const events = eventsFromCursor(records);
  return assembleCapsule({
    agent: "cursor",
    sessionId: sessionIdFrom(records, input.sessionPath, "cursor-session"),
    traces: tracesFromEvents(events),
    input,
    evidenceTitle: "Cursor session"
  });
}

function eventsFromCursor(records: SessionRecord[]): TraceEvent[] {
  const outputs = indexToolResults(records);
  const events: TraceEvent[] = [];
  for (const record of records) {
    const message = isRecord(record.message) ? record.message : record;
    const role = asString(record.role) ?? asString(message.role);
    const blocks = contentBlocks(message.content ?? record.content);
    if (role === "user" && !isToolResultOnly(blocks)) {
      const text = contentText(blocks);
      if (text) {
        events.push({ type: "user", text });
      }
      continue;
    }
    if (role !== "assistant" && asString(record.type) !== "assistant") {
      continue;
    }
    for (const block of blocks) {
      const type = asString(block.type);
      if (isHiddenType(type)) {
        continue;
      }
      if (type === "text" || type === undefined) {
        const text = asString(block.text)?.trim();
        if (text) {
          events.push({ type: "assistant", text });
        }
        continue;
      }
      if (type !== "tool_use" && type !== "tool_call") {
        continue;
      }
      const name = asString(block.name) ?? "";
      const args = isRecord(block.input) ? block.input : isRecord(block.arguments) ? block.arguments : {};
      const path = asString(args.path) ?? asString(args.file_path) ?? asString(args.target_file);
      const action = FILE_TOOLS[name];
      if (path && action) {
        events.push({ type: "file", path, action });
      }
      if (SHELL_TOOLS.has(name)) {
        const command = asString(args.command)?.trim();
        if (command) {
          const output = asString(block.id) ? outputs.get(asString(block.id) ?? "") : undefined;
          events.push({
            type: "command",
            command,
            exitCode: parseExitCode(output),
            output
          });
        }
      }
    }
  }
  return events;
}

function indexToolResults(records: SessionRecord[]): Map<string, string> {
  const outputs = new Map<string, string>();
  for (const record of records) {
    const message = isRecord(record.message) ? record.message : record;
    for (const block of contentBlocks(message.content ?? record.content)) {
      if (asString(block.type) !== "tool_result") {
        continue;
      }
      const id = asString(block.tool_use_id);
      if (id) {
        outputs.set(id, typeof block.content === "string" ? block.content : contentText(block.content));
      }
    }
  }
  return outputs;
}

function contentBlocks(content: unknown): SessionRecord[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter(isRecord);
}

function isToolResultOnly(blocks: SessionRecord[]): boolean {
  return blocks.length > 0 && blocks.every((block) => asString(block.type) === "tool_result");
}
