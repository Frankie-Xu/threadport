import type { ControlEvent } from './contracts.js';
import type { CoverageReport } from './coverage.js';
import type { ControlPlaneStore } from '../storage/control-plane-store.js';
export interface SourceCandidate { sourceId: string; path?: string; sessionId?: string; vendorSessionId?: string|null; agent: 'claude'|'codex'|'otel'|'threadport'; metadata?: Record<string, unknown> }
export interface ReadCursor { token: string; offset: number; identity?: string|null }
export interface ControlEventSource { readonly agent: SourceCandidate['agent']; readonly parserVersion: string; readonly capabilities: ReadonlySet<string>; discover(roots: readonly string[], signal: AbortSignal): AsyncIterable<SourceCandidate>; read(candidate: SourceCandidate, cursor: ReadCursor|null, signal: AbortSignal): Promise<{ events: ControlEvent[]; cursor: ReadCursor; coverage: CoverageReport }> }
export interface IngestResult { inserted: string[]; duplicate: string[]; cursor: ReadCursor; coverage: CoverageReport }
export async function ingestCandidate(store: ControlPlaneStore, source: ControlEventSource, candidate: SourceCandidate, cursor: ReadCursor|null = null, signal = new AbortController().signal): Promise<IngestResult> { const result = await source.read(candidate,cursor,signal); const appended = store.appendEvents(result.events); return { ...appended, cursor:result.cursor, coverage:result.coverage }; }
export async function ingestRoots(store: ControlPlaneStore, source: ControlEventSource, roots: readonly string[], signal = new AbortController().signal): Promise<IngestResult[]> { const results:IngestResult[]=[]; for await (const candidate of source.discover(roots,signal)) results.push(await ingestCandidate(store,source,candidate,null,signal)); return results; }
