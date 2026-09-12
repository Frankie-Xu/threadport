import type { AgentId, Capsule } from "../types.js";

/**
 * Project identity supplied by the caller.
 *
 * Adapter code reads Git from `root` and does not trust session-local
 * claims about branch or dirty state.
 */
export interface SessionProjectInput {
  name: string;
  root: string;
  repository?: string;
}

/**
 * Input to a session adapter.
 *
 * Provide a local session file, already-read text, or both. When both are
 * set, `sessionText` is parsed and `sessionPath` is kept as the evidence
 * locator. Tests must pass a synthetic fixture path rather than a live
 * user session.
 */
export interface SessionExtractInput {
  sessionPath?: string;
  sessionText?: string;
  project: SessionProjectInput;
  /**
   * Clock used for `created_at`. When omitted, the adapter prefers the
   * earliest timestamp in the session, then `new Date()`.
   */
  now?: Date;
}

/**
 * Read-only port for turning a local agent session into Capsule v1.
 *
 * Implementations must call `readGitState`, run `redactSecrets` on every
 * string copied from the session, and return `validateCapsule` output.
 * They must not execute `next_action`.
 */
export interface SessionAdapter {
  readonly agent: AgentId;
  extract(input: SessionExtractInput): Promise<Capsule>;
}
