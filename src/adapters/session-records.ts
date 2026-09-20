import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { CommandRun, DerivedTaskState, NormalizedEvent } from '../domain/models.js';
import type { CapsuleCommand, CapsuleDecision, CapsuleFailure, CapsuleFile, CapsuleStatus, CapsuleTest, FileAction } from '../types.js';
import type { SessionExtractInput } from './types.js';

export const DEFAULT_NEXT_ACTION = 'Review the capsule and confirm the next edit.';
export const DERIVED_ACCEPTANCE_NOTE = 'acceptance_criteria is derived from the objective; the session did not state explicit acceptance criteria.';
export const TEST_COMMAND = /^(?![\s\S]*[;&|<>`$\r\n])\s*(?:(?:\/(?:[^\s/]+\/)*|[A-Za-z]:\\(?:[^\s\\]+\\)*)?node(?:\.exe)?\s+--test|(?:npm|pnpm|yarn)(?:\s+run)?\s+test(?::[\w:-]+)?|(?:npx|pnpm\s+exec|yarn)\s+(?:vitest|jest)|vitest|pytest|go\s+test|cargo\s+test|mvn\s+test|(?:\.\/)?gradle(?:w)?\s+test|jest|bun\s+test)(?=\s|$)/;
export const HISTORICAL_TEST_NOTE = 'Historical result; current workspace validity unknown.';
export const USER_DONE = /^\s*(?:done|completed|that'?s all|finished|lgtm)[.!]?\s*$/i;

export type SessionRecord = Record<string, unknown>;
export type TraceEvent = (
  | { type: 'user'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'file'; path: string; action: FileAction; outcome?: 'succeeded' | 'failed' | 'unknown'; output?: string }
  | { type: 'command'; command: string; exitCode?: number | null; cwd?: string | null; sessionId?: string; output?: string }
) & { innerObservation?: unknown; order?: number; occurredAt?: string | null };

export interface SessionTraces {
  objective: string; acceptanceCriteria: string[]; constraints: string[]; files: Map<string, CapsuleFile>;
  commands: CapsuleCommand[]; commandRuns: CommandRun[]; normalizedEvents: NormalizedEvent[];
  derived: DerivedTaskState; tests: CapsuleTest[]; failures: CapsuleFailure[]; decisions: CapsuleDecision[];
  completed: string[]; nextAction: string; status: CapsuleStatus;
}

export async function loadSessionText(input: SessionExtractInput): Promise<string> {
  if (typeof input.sessionText === 'string') return input.sessionText;
  if (!input.sessionPath) throw new Error('SessionExtractInput requires sessionPath or sessionText.');
  return readFile(input.sessionPath, 'utf8');
}

export function parseSessionRecords(text: string, label: string): SessionRecord[] {
  const trimmed = text.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter(isRecord);
    if (isRecord(parsed)) {
      const messages = parsed.messages;
      if (Array.isArray(messages)) return [parsed, ...messages.filter(isRecord)];
      return [parsed];
    }
  } catch { /* JSONL transcripts fall through. */ }
  const records: SessionRecord[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) records.push(parsed);
    } catch { throw new Error(`Invalid ${label} session JSONL at line ${index + 1}.`); }
  }
  return records;
}

export function sessionIdFrom(records: SessionRecord[], sessionPath: string | undefined, fallback: string): string {
  const ids = new Set<string>();
  for (const record of records) {
    const sessionId = asString(record.sessionId) ?? asString(record.session_id);
    if (sessionId?.trim()) ids.add(sessionId.trim());
    if (asString(record.type) === 'session_meta') {
      const nested = isRecord(record.payload) ? asString(record.payload.id) : undefined;
      const id = nested ?? asString(record.id);
      if (id?.trim()) ids.add(id.trim());
    }
  }
  if (ids.size > 1) throw new Error('Multiple session IDs in one transcript; extract each session separately.');
  if (ids.size) return [...ids][0];
  if (sessionPath) {
    const fromName = basename(sessionPath).replace(/\.[^.]+$/, '');
    if (fromName && fromName !== 'session-basic') return fromName;
  }
  return fallback;
}

export function sourceTimestamp(value: unknown): string | null {
  const parsed = z.string().datetime({ offset: true }).safeParse(value);
  return parsed.success ? new Date(parsed.data).toISOString() : null;
}

export function resolveCreatedAt(now: Date | undefined, records: SessionRecord[] = []): string {
  if (now) return now.toISOString();
  let earliest = Infinity;
  for (const record of records) {
    const timestamp = asString(record.timestamp) ?? asString(record.created_at);
    if (timestamp && !Number.isNaN(Date.parse(timestamp))) earliest = Math.min(earliest, Date.parse(timestamp));
  }
  return new Date(Number.isFinite(earliest) ? earliest : Date.now()).toISOString();
}

export function asString(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
export function isRecord(value: unknown): value is SessionRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
