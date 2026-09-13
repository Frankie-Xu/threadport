import type { SessionAdapter } from './types.js';
import { messageAdapter } from './message-events.js';

/** Observed Claude message traces, not a guarantee of all vendor transcript versions. */
export function createClaudeAdapter(): SessionAdapter { return messageAdapter('claude'); }
