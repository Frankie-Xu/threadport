import type { SessionAdapter } from './types.js';
import { messageAdapter } from './message-events.js';

/** Observed Cursor message traces, not a guarantee of all vendor transcript versions. */
export function createCursorAdapter(): SessionAdapter { return messageAdapter('cursor'); }
