import { z } from 'zod';
import type { SessionRecord } from './common.js';

export const CURSOR_NATIVE_FORMAT = 'threadport.cursor-native.v1';
export const CURSOR_NATIVE_NOTE = 'Experimental selected Cursor database evidence, not a vendor export contract. Tool completion alone does not establish success. Exact Node test exit-capture wrappers are normalized to their inner test command; other unreported exits remain unknown. Current Git state is not a historical test snapshot.';

const optionalString = z.string().nullish();
const toolSchema = z.object({
  name: z.string(), toolCallId: z.string().min(1), status: z.string(),
  params: z.object({ command: optionalString, cwd: optionalString, relativeWorkspacePath: optionalString }).nullish(),
  result: z.object({ output: optionalString, rejected: z.boolean().nullish(), notInterrupted: z.boolean().nullish(), beforeContentId: optionalString, afterContentId: optionalString }).nullish(),
  error: optionalString
});
const bubbleSchema = z.object({
  bubbleId: z.string().min(1), type: z.union([z.literal(1), z.literal(2)]),
  createdAt: z.string().datetime({ offset: true }),
  startedAtMs: z.number().int().nonnegative().nullish(), completedAtMs: z.number().int().nonnegative().nullish(),
  omitted: z.boolean().optional(), text: optionalString, tool: toolSchema.nullish()
});
const envelopeSchema = z.object({
  format: z.literal(CURSOR_NATIVE_FORMAT), sessionId: z.string().uuid(),
  createdAt: z.number().int().nonnegative(), bubbles: z.array(bubbleSchema).min(1).max(10000)
});

/** Pure conversion of a selected, allowlisted export. Never opens a database. */
export function cursorNativeRecords(value: unknown): SessionRecord[] {
  const envelope = envelopeSchema.parse(value);
  const timeline: { time: number; record: SessionRecord }[] = [];
  const ids = new Set<string>();
  const calls = new Set<string>();
  const push = (time: number, record: SessionRecord) => {
    if (!Number.isFinite(time) || Number.isNaN(new Date(time).getTime())) throw new Error('Invalid Cursor event timestamp.');
    timeline.push({ time, record: { ...record, timestamp: new Date(time).toISOString() } });
  };
  for (const bubble of envelope.bubbles) {
    if (ids.has(bubble.bubbleId)) throw new Error('Duplicate Cursor bubble ID.');
    ids.add(bubble.bubbleId);
    if (bubble.omitted) continue;
    const start = bubble.startedAtMs ?? Date.parse(bubble.createdAt);
    if (bubble.text?.trim()) push(start, { role: bubble.type === 1 ? 'user' : 'assistant', content: bubble.text });
    const tool = bubble.tool;
    if (!tool) continue;
    if (bubble.type !== 2 || !tool.toolCallId.trim() || calls.has(tool.toolCallId)) throw new Error('Invalid or duplicate Cursor tool call ID.');
    calls.add(tool.toolCallId);
    const end = bubble.completedAtMs;
    if (end != null && end < start) throw new Error('Cursor result precedes its call.');
    const params = tool.params;
    const result = tool.result;
    const finished = end != null && tool.status === 'completed' && !result?.rejected && result?.notInterrupted !== false;
    let name = tool.name;
    let input: SessionRecord = {};
    let output: SessionRecord | undefined;
    let error = false;
    if (name === 'run_terminal_command_v2') {
      name = 'shell';
      input = { command: params?.command ?? '', cwd: params?.cwd ?? null };
      if (end != null && result?.rejected) output = { output: 'Cursor rejected this command request; it was not executed.' };
      else if (end != null && result?.notInterrupted === false) output = { output: 'Cursor command was interrupted; exit status is unknown.' };
      // Only the exact source wrapper proves the last marker reports the inner
      // test exit. It must NOT become the exit code of the whole shell wrapper.
      if (finished && params?.command?.trim() === 'node --test; echo "EXIT_CODE=$?"') {
        const marker = result?.output?.match(/(?:^|\n)EXIT_CODE=(-?\d+)\s*$/);
        const exit = marker ? Number(marker[1]) : NaN;
        if (Number.isSafeInteger(exit) && exit >= 0 && exit <= 255) {
          input = { command: 'node --test', cwd: params?.cwd ?? null };
          output = { exit_code: exit, output: result?.output ?? '' };
        }
      }
      // No numeric exit in the observed native terminal format. Neither a
      // completed shell nor arbitrary success prose is enough to infer exit 0.
    } else if (name === 'edit_file_v2') {
      name = 'edit'; input = { path: params?.relativeWorkspacePath ?? '' };
      if (end != null && (tool.status === 'error' || result?.rejected)) {
        error = true; output = { output: tool.error || 'Cursor edit rejected or failed.' };
      } else if (finished && result?.beforeContentId && result.afterContentId && result.beforeContentId !== result.afterContentId) {
        output = { output: 'Edited file; Cursor recorded before/after content references.' };
      }
    } else if (name === 'read_file_v2' && finished) {
      output = { output: 'Read completed; file contents omitted.' };
    }
    push(start, { role: 'assistant', content: [{ type: 'tool_use', id: tool.toolCallId, name, input }] });
    if (output && end != null) push(end, { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.toolCallId, is_error: error, content: output }] });
  }
  timeline.sort((a, b) => a.time - b.time);
  return [{ sessionId: envelope.sessionId, timestamp: new Date(envelope.createdAt).toISOString() }, ...timeline.map(event => event.record)];
}
