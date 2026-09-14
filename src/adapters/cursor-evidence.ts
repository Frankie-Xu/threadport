export const CURSOR_INCOMPLETE_WARNING = 'Cursor session has incomplete tool evidence: missing or ambiguous call IDs/results or unrecognized outcomes. Unmatched operations remain unknown; assistant claims and turn completion do not verify edits or tests. Review the original session before continuing.';

/** Native transcript wrappers are metadata, not the task objective. */
export function cursorUserText(text: string): string {
  const wrapped = text.trim().match(/^(?:<timestamp>[^\r\n]*<\/timestamp>\s*)?<user_query>\s*([\s\S]*?)\s*<\/user_query>$/);
  return wrapped ? wrapped[1] : text;
}

/** Called only with already-redacted visible text, never tool payloads/reasoning. */
export function cursorReviewAction(message: { type: 'user' | 'assistant'; text: string }): string {
  const context = message.text.length > 4000 ? `${message.text.slice(0, 4000)}\n[Truncated; review the original transcript.]` : message.text;
  return message.type === 'user'
    ? `Review the latest user instruction before continuing:\n${context}`
    : `Review this unverified Cursor assistant context with the user before choosing the next action:\n${context}`;
}
