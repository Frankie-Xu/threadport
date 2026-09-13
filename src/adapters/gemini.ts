import type { FileAction } from "../types.js";
import { redactRecords } from '../privacy.js';
import type { SessionAdapter, SessionExtractInput } from "./types.js";
import {
  assembleCapsule,
  asString,
  isRecord,
  loadSessionText,
  toolResult,
  resolveCreatedAt,
  parseSessionRecords,
  sessionIdFrom,
  sourceTimestamp,
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
  const { records, count } = redactRecords(parseSessionRecords(await loadSessionText(input), "Gemini"));
  const events = eventsFromGemini(records);
  const sessionId = sessionIdFrom(records, input.sessionPath, "gemini-session");
  return assembleCapsule({
    agent: "gemini",
    redactionCount: count,
    sessionId,
    traces: tracesFromEvents(events, sessionId),
    input: { ...input, now: new Date(resolveCreatedAt(input.now, records)) },
    evidenceTitle: "Gemini session"
  });
}

function eventsFromGemini(records: SessionRecord[]): TraceEvent[] {
  const events: TraceEvent[] = [];
  const outputs = indexFunctionResponses(records);
  for (const [recordIndex, record] of records.entries()) {
    const role = asString(record.role);
    const parts = Array.isArray(record.parts) ? record.parts.filter(isRecord) : [];
    if (role === "user") {
      const text = parts.map((part) => asString(part.text) ?? "").join("\n").trim();
      if (text) {
        events.push({ type: "user", text, order: recordIndex, occurredAt: sourceTimestamp(record.timestamp ?? record.created_at) });
      }
      continue;
    }
    if (role !== "model" && role !== "assistant") {
      continue;
    }
    for (const [partIndex, part] of parts.entries()) {
      const order = recordIndex + (partIndex + 1) / (parts.length + 1);
      if (asString(part.thought) || part.thought === true) {
        continue;
      }
      const text = asString(part.text)?.trim();
      if (text) {
        events.push({ type: "assistant", text, order, occurredAt: sourceTimestamp(record.timestamp ?? record.created_at) });
      }
      const call = isRecord(part.functionCall) ? part.functionCall : isRecord(part.function_call) ? part.function_call : undefined;
      if (!call) {
        continue;
      }
      const name = asString(call.name) ?? "";
      const args = isRecord(call.args) ? call.args : isRecord(call.arguments) ? call.arguments : {};
      const path = asString(args.file_path) ?? asString(args.path);
      const action = FILE_TOOLS[name];
      const result = outputs.get(call);
      if (path && action) {
        events.push({ type: "file", path, action, outcome: result?.outcome ?? 'unknown', output: result?.text, order: result?.order ?? order });
      }
      if (SHELL_TOOLS.has(name)) {
        const command = asString(args.command);
        if (command?.trim()) {
          events.push({
            type: "command",
            command,
            cwd: 'cwd' in args ? asString(args.cwd) ?? null : asString(record.cwd) ?? null,
            order: result?.order ?? order,
            exitCode: result?.exitCode,
            output: result?.text
          });
        }
      }
    }
  }
  return events;
}

function indexFunctionResponses(records: SessionRecord[]): Map<SessionRecord, ReturnType<typeof toolResult> & { order: number }> {
  const outputs = new Map<SessionRecord, ReturnType<typeof toolResult> & { order: number }>();
  const pending = new Set<SessionRecord>();
  const ids = new Map<string, SessionRecord>();
  for (const [recordIndex, record] of records.entries()) {
    const parts = Array.isArray(record.parts) ? record.parts.filter(isRecord) : [];
    for (const [partIndex, part] of parts.entries()) {
      if (part.thought === true || typeof part.thought === 'string') continue;
      const call = isRecord(part.functionCall) ? part.functionCall : isRecord(part.function_call) ? part.function_call : undefined;
      if (call) {
        pending.add(call);
        if (typeof call.id === 'string') {
          if (ids.has(call.id)) throw new Error('Duplicate Gemini call ID.');
          ids.set(call.id, call);
        }
      }
      const response = isRecord(part.functionResponse)
        ? part.functionResponse
        : isRecord(part.function_response) ? part.function_response : undefined;
      if (!response) {
        continue;
      }
      const name = asString(response.name) ?? "unknown";
      const body = isRecord(response.response) ? response.response : response;
      const candidates = [...pending].filter(item => item.name === name && item.id === undefined);
      const matched = typeof response.id === 'string' ? ids.get(response.id) : candidates.length === 1 ? candidates[0] : undefined;
      if (!matched) {
        // Never pair concurrent ID-less results by arrival order.
        for (const candidate of candidates) pending.delete(candidate);
        continue;
      }
      if (!pending.has(matched) || outputs.has(matched)) throw new Error('Duplicate or out-of-order Gemini result.');
      outputs.set(matched, { ...toolResult(body, body.is_error === true || body.error !== undefined), order: recordIndex + (partIndex + 1) / (parts.length + 1) });
      pending.delete(matched);
    }
  }
  return outputs;
}
