/** One observed execution; missing historical context stays null. Not Capsule v1. */
export interface CommandRun {
  id: string;
  sessionId: string;
  ordinal: number;
  command: string;
  cwd: string | null;
  exitCode: number | null;
  startedAt: string | null;
  completedAt: string | null;
  eventId: string;
  snapshotId: string | null;
}

export type ClaimOrigin = 'observed' | 'user-confirmed' | 'derived' | 'unknown';
export type Lifecycle = 'active' | 'paused' | 'completed';

export interface EvidenceRef {
  sessionId: string;
  eventId: string;
}

export interface Claim {
  text: string;
  origin: ClaimOrigin;
  evidence: EvidenceRef[];
  /** Null when the source provides no timestamp; never substitute the machine clock. */
  updatedAt: string | null;
}

export interface Task {
  id: string;
  projectId: string;
  revision: number;
  title: string;
  objective: Claim;
  constraints: Claim[];
  nextAction: Claim;
  lifecycle: Lifecycle;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedEvent {
  id: string;
  sessionId: string;
  ordinal: number;
  occurredAt: string | null;
  kind: 'user-message' | 'assistant-message' | 'file-change' | 'command' | 'test';
  text: string;
  commandRun: CommandRun | null;
  relativePaths: string[];
  omitted: boolean;
  /** Optional vendor hook result. It is validated at the evidence boundary and never inferred from text. */
  innerObservation?: unknown;
}

export interface DerivedTaskState {
  objective: Claim | null;
  constraints: Claim[];
  latestRuns: CommandRun[];
  attention: string[];
}

/** Read-only presentation: saved fields and live attention have different sources. */
export interface ResolvedTaskState {
  objective: Claim | null;
  constraints: Claim[];
  nextAction: Claim | null;
  lifecycle: Lifecycle | null;
  archived: boolean;
  attention: string[];
}
