import type { FileAction } from "../types.js";
import type { SessionAdapter, SessionExtractInput } from "./types.js";
import {
  assembleCapsule,
  asString,
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
  write_file: "added",
  WriteFile: "added",
  replace: "modified",
  Replace: "modified",
  delete_file: "deleted"
};
const SHELL_TOOLS = new Set(["run_shell_command", "run_shell", "shell"]);

/**
 * Gemini session adapter.
 *
 * Gemini CLI session JSON is treated as an observed local trace, not as a
 * vendor specification. Thought parts are dropped before mapping.
 */
export function createGeminiAdapter(): SessionAdapter {
  return {
    agent: "gemini",
    extract: extractGeminiSession
  };
}

async function extractGeminiSession(input: SessionExtractInput): Promise<import("../types.js").Capsule> {
  const records = parseSessionRecords(await loadSessionText(input), "Gemini");
  const events = eventsFromGemini(records);
  return assembleCapsule({
    agent: "gemini",
    sessionId: sessionIdFrom(records, input.sessionPath, "gemini-session"),
    traces: tracesFromEvents(events),
    input,
    evidenceTitle: "Gemini session"
  });
}

function eventsFromGemini(records: SessionRecord[]): TraceEvent[] {
  const events: TraceEvent[] = [];
  const outputs = indexFunctionResponses(records);
  for (const record of records) {
    const role = asString(record.role);
    const parts = Array.isArray(record.parts) ? record.parts.filter(isRecord) : [];
    if (role === "user") {
      const text = parts.map((part) => asString(part.text) ?? "").join("\n").trim();
      if (text) {
        events.push({ type: "user", text });
      }
      continue;
    }
    if (role !== "model" && role !== "assistant") {
      continue;
    }
    for (const part of parts) {
      if (asString(part.thought) || part.thought === true) {
        continue;
      }
      const text = asString(part.text)?.trim();
      if (text) {
        events.push({ type: "assistant", text });
      }
      const call = isRecord(part.functionCall) ? part.functionCall : isRecord(part.function_call) ? part.function_call : undefined;
      if (!call) {
        continue;
      }
      const name = asString(call.name) ?? "";
      const args = isRecord(call.args) ? call.args : isRecord(call.arguments) ? call.arguments : {};
      const path = asString(args.file_path) ?? asString(args.path);
      const action = FILE_TOOLS[name];
      if (path && action) {
        events.push({ type: "file", path, action });
      }
      if (SHELL_TOOLS.has(name)) {
        const command = asString(args.command)?.trim();
        if (command) {
          const queued = outputs.get(name) ?? [];
          const output = queued.shift();
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

function indexFunctionResponses(records: SessionRecord[]): Map<string, string[]> {
  const outputs = new Map<string, string[]>();
  for (const record of records) {
    const parts = Array.isArray(record.parts) ? record.parts.filter(isRecord) : [];
    for (const part of parts) {
      const response = isRecord(part.functionResponse)
        ? part.functionResponse
        : isRecord(part.function_response) ? part.function_response : undefined;
      if (!response) {
        continue;
      }
      const name = asString(response.name) ?? "unknown";
      const body = isRecord(response.response) ? response.response : response;
      const text = asString(body.output) ?? asString(body.content) ?? JSON.stringify(body);
      const list = outputs.get(name) ?? [];
      list.push(text);
      outputs.set(name, list);
    }
  }
  return outputs;
}
