import type { FileAction } from '../types.js';
import type { SessionAdapter } from './types.js';
import { redactRecords } from '../privacy.js';
import { CURSOR_INCOMPLETE_WARNING, cursorReviewAction, cursorUserText } from './cursor-evidence.js';
import { assembleCapsule, asString, contentText, isRecord, loadSessionText, parseSessionRecords, resolveCreatedAt, sessionIdFrom, sourceTimestamp, toolResult, tracesFromEvents, type TraceEvent, type ToolResult, type SessionRecord } from './common.js';

const FILE_TOOLS: Record<string, FileAction> = {
  write: 'added', write_file: 'added', create: 'added', edit: 'modified', edit_file: 'modified', strreplace: 'modified', notebookedit: 'modified', delete: 'deleted', delete_file: 'deleted'
};
const shells = new Set(['bash', 'shell']);
function blocks(record: SessionRecord): SessionRecord[] {
  const message = isRecord(record.message) ? record.message : record;
  const content = message.content;
  return typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content.filter(isRecord) : [];
}

export function messageAdapter(agent: 'claude' | 'cursor'): SessionAdapter {
  return { agent, async extract(input) {
    const { records, count } = redactRecords(parseSessionRecords(await loadSessionText(input), agent));
    const outputs = new Map<string, ToolResult & { order: number }>();
    const calls = new Map<string, number>();
    for (const record of records) {
      const message = isRecord(record.message) ? record.message : record;
      const role = asString(record.role) ?? asString(message.role) ?? asString(record.type);
      if (role !== 'assistant') continue;
      for (const block of blocks(record)) {
        if ((block.type === 'tool_use' || block.type === 'tool_call') && typeof block.id === 'string' && block.id.trim()) {
          calls.set(block.id, (calls.get(block.id) ?? 0) + 1);
        }
      }
    }
    for (const [recordIndex, record] of records.entries()) {
      const content = blocks(record);
      for (const [blockIndex, block] of content.entries()) {
        if (block.type === 'tool_result' && typeof block.tool_use_id === 'string' && block.tool_use_id.trim()) {
          if (outputs.has(block.tool_use_id)) throw new Error('Duplicate tool result ID in session.');
          outputs.set(block.tool_use_id, { ...toolResult(block.content, block.is_error === true), order: recordIndex + (blockIndex + 1) / (content.length + 1) });
        }
      }
    }
    const sessionId = sessionIdFrom(records, input.sessionPath, `${agent}-session`);
    const events: TraceEvent[] = [];
    let incomplete = false;
    for (const [recordIndex, record] of records.entries()) {
      const message = isRecord(record.message) ? record.message : record;
      const role = asString(record.role) ?? asString(message.role) ?? asString(record.type);
      const content = blocks(record);
      if (role === 'user') {
        const rawText = contentText(content);
        const text = agent === 'cursor' ? cursorUserText(rawText) : rawText;
        if (text) events.push({ type: 'user', text, order: recordIndex, occurredAt: sourceTimestamp(record.timestamp ?? record.created_at) });
        continue;
      }
      if (role !== 'assistant') continue;
      for (const [blockIndex, block] of content.entries()) {
        const order = recordIndex + (blockIndex + 1) / (content.length + 1);
        if (block.type === 'text' || block.type === undefined) {
          const text = asString(block.text)?.trim();
          if (text) events.push({ type: 'assistant', text, order, occurredAt: sourceTimestamp(record.timestamp ?? record.created_at) });
          continue;
        }
        if (block.type !== 'tool_use' && block.type !== 'tool_call') continue;
        const name = (asString(block.name) ?? '').toLowerCase();
        const args = isRecord(block.input) ? block.input : isRecord(block.arguments) ? block.arguments : {};
        const id = asString(block.id);
        const candidate = id && calls.get(id) === 1 ? outputs.get(id) : undefined;
        // A preceding result cannot prove a future call completed. Keep it
        // unknown instead of borrowing success from reordered/stale evidence.
        const result = candidate && candidate.order > order ? candidate : undefined;
        if (!result) incomplete = true;
        const path = asString(args.file_path) ?? asString(args.path) ?? asString(args.target_file) ?? asString(args.filePath);
        if (path && FILE_TOOLS[name]) events.push({ type: 'file', path, action: FILE_TOOLS[name], outcome: result?.outcome ?? 'unknown', output: result?.text, order: result?.order ?? order });
        const command = asString(args.command);
        const cwd = 'workdir' in args ? asString(args.workdir) ?? null : 'cwd' in args ? asString(args.cwd) ?? null : asString(record.cwd) ?? null;
        if (command?.trim() && shells.has(name)) events.push({ type: 'command', command, cwd, exitCode: result?.exitCode, output: result?.text, order: result?.order ?? order });
        if ((path && FILE_TOOLS[name] && result?.outcome === 'unknown') || (command && shells.has(name) && result?.exitCode === undefined)) incomplete = true;
      }
    }
    const traces = tracesFromEvents(events, sessionId);
    if (agent === 'cursor' && incomplete) {
      traces.constraints.push(CURSOR_INCOMPLETE_WARNING);
      if (traces.status !== 'blocked') traces.status = 'paused';
      const ordered = [...events].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      let lastUser = -1;
      let lastTool = -1;
      let lastDialogue = -1;
      ordered.forEach((event, index) => {
        if (event.type === 'user') lastUser = index;
        if (event.type === 'file' || event.type === 'command') lastTool = index;
        else lastDialogue = index;
      });
      const latest = ordered[lastUser > lastTool ? lastUser : lastDialogue];
      if (latest?.type === 'user' || latest?.type === 'assistant') traces.nextAction = cursorReviewAction(latest);
    }
    return assembleCapsule({ agent, sessionId, traces, input: { ...input, now: new Date(resolveCreatedAt(input.now, records)) }, evidenceTitle: `${agent} session`, redactionCount: count });
  } };
}
