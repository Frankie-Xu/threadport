/** Deliberately narrower than a general Markdown parser: dialogue, never tool evidence. */
export const CURSOR_TRANSCRIPT_WARNING = 'Cursor Markdown import is transcript-only: tool calls/results, exit codes and edit outcomes are not verified. Assistant text is unverified context, not completed work. Markdown role headings are ambiguous and unauthenticated. Code, tool, hidden and unsupported sections are omitted. Review the original session and current Git state before continuing.';

export interface CursorDialogue {
  type: 'user' | 'assistant';
  text: string;
}

export function parseCursorMarkdown(text: string): CursorDialogue[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split('\n');
  const invalid = () => new Error('Unsupported or incomplete Cursor Copy Transcript Markdown: expected a title and non-empty User dialogue with balanced code fences.');
  if (!/^# [^#\s].*$/.test(lines.shift() ?? '')) throw invalid();

  const messages: CursorDialogue[] = [];
  let role: CursorDialogue['type'] | undefined;
  let body: string[] = [];
  let suppressed = false;
  let fence: { marker: string; length: number } | undefined;
  const flush = () => {
    const content = body.join('\n').trim();
    if (role === 'user' && !content) throw invalid();
    if (role && content) messages.push({ type: role, text: content });
    body = [];
  };

  for (const line of lines) {
    if (fence) {
      const close = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) fence = undefined;
      continue;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) { fence = { marker: open[1][0], length: open[1].length }; continue; }

    const heading = line.match(/^## (User|Assistant)[ \t]*$/);
    if (heading) {
      flush();
      role = heading[1] === 'User' ? 'user' : 'assistant';
      suppressed = false;
      continue;
    }
    // Tool bodies can contain arbitrary text/JSON. Do not harvest even claimed
    // successes or exit codes. Unknown/hidden sections stay omitted until a role.
    if (/^ {0,3}#{1,6}(?:\s|$)/.test(line) || /<\/?[A-Za-z!]/.test(line)) suppressed = true;
    if (!role && line.trim() && !suppressed) throw invalid();
    if (role && !suppressed && !/^(?: {4}|\t| {0,3}>)/.test(line)) body.push(line);
  }
  if (fence) throw invalid();
  flush();
  if (messages[0]?.type !== 'user') throw invalid();
  return messages;
}
