import type { SessionAdapter } from './types.js';
import { messageAdapter } from './message-events.js';
import { redactRecords } from '../privacy.js';
import { assembleCapsule, loadSessionText, sessionIdFrom, tracesFromEvents } from './common.js';
import { CURSOR_TRANSCRIPT_WARNING, parseCursorMarkdown } from './cursor-markdown.js';
import { cursorReviewAction } from './cursor-evidence.js';
import { CURSOR_NATIVE_FORMAT, CURSOR_NATIVE_NOTE, cursorNativeRecords } from './cursor-native.js';
import { validateCapsule } from '../capsule.js';

/** Observed Cursor message traces, not a guarantee of all vendor transcript versions. */
export function createCursorAdapter(): SessionAdapter {
  const structured = messageAdapter('cursor');
  return { agent: 'cursor', async extract(input) {
    const text = await loadSessionText(input);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { /* JSONL/Markdown use their existing parsers. */ }
    if (parsed && typeof parsed === 'object' && 'format' in parsed && parsed.format === CURSOR_NATIVE_FORMAT) {
      const capsule = await structured.extract({ ...input, sessionText: JSON.stringify(cursorNativeRecords(parsed)) });
      capsule.constraints.push(CURSOR_NATIVE_NOTE);
      return validateCapsule(capsule);
    }
    if (!text.trimStart().startsWith('#')) return structured.extract({ ...input, sessionText: text });

    const { records: messages, count } = redactRecords(parseCursorMarkdown(text));
    // User objectives/constraints are visible instructions. Assistant claims are
    // review context only, never tool events, decisions or completion signals.
    const traces = tracesFromEvents(messages.filter(message => message.type === 'user'));
    traces.status = 'paused';
    traces.constraints.push(CURSOR_TRANSCRIPT_WARNING);
    const latest = messages.at(-1)!;
    traces.nextAction = cursorReviewAction(latest);
    return assembleCapsule({
      agent: 'cursor', sessionId: sessionIdFrom([], input.sessionPath, 'cursor-transcript'),
      traces, input, evidenceTitle: 'Cursor Copy Transcript (Markdown; transcript-only)', redactionCount: count
    });
  } };
}
