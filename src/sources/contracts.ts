import type { NormalizedEvent } from '../domain/models.js';
export interface SourceCandidate { sourceId: string; path: string; agent: 'claude' | 'codex' }
export interface PendingCall { id: string; command: string; cwd: string | null; startedAt: string | null }
export interface ReadCursor {
  fileIdentity: string; byteOffset: number; nextOrdinal: number; parserVersion: string;
  checkpoint?: { headLength: number; headHash: string; tailHash: string };
  blockOffset?: number;
  recognized?: boolean;
  warnings?: string[];
  pendingCalls?: PendingCall[];
  metadata?: { sessionId?: string; vendorSessionId: string | null; formatVersion: string | null; lastEventAt: string | null };
}
export interface SourceSession {
  id: string; sourceId: string; agent: 'claude' | 'codex'; vendorSessionId: string | null;
  projectId: string | null; workspaceId: string | null; sourcePath: string; parserVersion: string;
  formatVersion: string | null; lastEventAt: string | null;
  status: 'ready' | 'partial' | 'unsupported' | 'missing' | 'error';
}
export interface SourceReadResult { session: SourceSession; events: NormalizedEvent[]; cursor: ReadCursor; warnings: string[]; hasMore: boolean }
export interface SourceAdapter {
  readonly agent: 'claude' | 'codex'; readonly parserVersion: string;
  readonly diagnostics: readonly SourceDiagnostic[];
  discover(roots: readonly string[], signal: AbortSignal): AsyncIterable<SourceCandidate>;
  read(input: { candidate: SourceCandidate; cursor: ReadCursor | null; maxEvents: number; signal: AbortSignal }): Promise<SourceReadResult>;
}
export interface SourceDiagnostic { sourceId: string; rootIndex: number; code: string }
