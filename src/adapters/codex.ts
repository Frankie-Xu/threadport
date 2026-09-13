import type { SessionAdapter } from './types.js';
import type { FileAction } from '../types.js';
import { redactRecords } from '../privacy.js';
import { assembleCapsule, asString, contentText, isRecord, isHiddenType, loadSessionText, parseSessionRecords, resolveCreatedAt, sessionIdFrom, sourceTimestamp, toolResult, tracesFromEvents, type TraceEvent, type ToolResult } from './common.js';

export function createCodexAdapter(): SessionAdapter {
  return { agent: 'codex', async extract(input) {
    const { records, count } = redactRecords(parseSessionRecords(await loadSessionText(input), 'Codex'));
    const items = records.map(r => isRecord(r.payload) ? r.payload : r);
    const outputs = new Map<string, ToolResult & { order: number }>();
    for (const [order, item] of items.entries()) if (['function_call_output', 'custom_tool_call_output'].includes(String(item.type)) && typeof item.call_id === 'string') {
      if (outputs.has(item.call_id)) throw new Error('Duplicate tool result ID in session.');
      outputs.set(item.call_id, { ...toolResult(item.output, item.is_error === true), order });
    }
    const sessionId = sessionIdFrom(records, input.sessionPath, 'codex-session');
    const events: TraceEvent[] = [];
    let contextCwd: string | null = null;
    for (const [order, item] of items.entries()) {
      if (['session_meta', 'turn_context'].includes(String(records[order].type))) {
        contextCwd = asString(item.cwd) ?? null;
        continue;
      }
      if (isHiddenType(asString(item.type))) continue;
      if (item.type === 'message' && (item.role === 'user' || item.role === 'assistant')) {
        const text = contentText(item.content);
        if (text) events.push({ type: item.role, text, order, occurredAt: sourceTimestamp(records[order].timestamp ?? records[order].created_at) });
        continue;
      }
      if (item.type !== 'function_call' && item.type !== 'custom_tool_call') continue;
      const name = (asString(item.name) ?? '').toLowerCase();
      const result = outputs.get(asString(item.call_id) ?? '');
      let args = isRecord(item.arguments) ? item.arguments : {};
      if (typeof item.arguments === 'string') {
        try { const parsed: unknown = JSON.parse(item.arguments); if (isRecord(parsed)) args = parsed; }
        catch { args = { input: item.arguments, command: item.arguments }; }
      }
      if (name === 'apply_patch' || name === 'apply_patch_file') {
        const patch = asString(item.input) ?? asString(args.patch) ?? asString(args.input) ?? '';
        for (const match of patch.matchAll(/^\*\*\* (Add|Update|Delete) File: (.+)\r?$/gm)) {
          const actions: Record<string, FileAction> = { Add: 'added', Update: 'modified', Delete: 'deleted' };
          events.push({ type: 'file', path: match[2].trim(), action: actions[match[1]], outcome: result?.outcome ?? 'unknown', output: result?.text, order: result?.order ?? order });
        }
      } else if (['shell', 'exec_command', 'local_shell', 'bash'].includes(name)) {
        const command = asString(args.command) ?? asString(args.cmd);
        const cwd = 'workdir' in args ? asString(args.workdir) ?? null : 'cwd' in args ? asString(args.cwd) ?? null : contextCwd;
        if (command?.trim()) events.push({ type: 'command', command, cwd, exitCode: result?.exitCode, output: result?.text, order: result?.order ?? order });
      }
    }
    return assembleCapsule({ agent: 'codex', sessionId, traces: tracesFromEvents(events, sessionId), input: { ...input, now: new Date(resolveCreatedAt(input.now, records)) }, evidenceTitle: 'Codex session', redactionCount: count });
  } };
}
