export const AGENTS = ["claude", "codex", "cursor", "gemini", "unknown"] as const;
export type AgentId = (typeof AGENTS)[number];

export const CAPSULE_STATUSES = ["active", "blocked", "completed", "paused"] as const;
export type CapsuleStatus = (typeof CAPSULE_STATUSES)[number];

export type FileAction = "added" | "modified" | "deleted" | "renamed" | "unknown";

export interface CapsuleFile {
  path: string;
  action: FileAction;
  summary?: string;
}

export interface CapsuleDecision {
  decision: string;
  rationale?: string;
  evidence?: string[];
}

export interface CapsuleCommand {
  command: string;
  exit_code?: number;
  summary?: string;
}

export interface CapsuleTest {
  command: string;
  status: "passed" | "failed" | "skipped" | "unknown";
  summary?: string;
}

export interface CapsuleFailure {
  summary: string;
  resolution?: string;
}

export interface CapsuleEvidence {
  kind: "file" | "command" | "test" | "url" | "session" | "other";
  title: string;
  locator?: string;
  digest?: string;
}

export interface GitState {
  root: string;
  branch: string;
  detached?: boolean;
  head: string;
  dirty: boolean;
  dirty_diff_hash: string;
  changed_files: string[];
}

export interface Capsule {
  schema_version: "1.0";
  id: string;
  created_at: string;
  source_agent: AgentId;
  source_session_id?: string;
  project: {
    name: string;
    root: string;
    repository?: string;
  };
  objective: string;
  acceptance_criteria: string[];
  status: CapsuleStatus;
  completed: string[];
  decisions: CapsuleDecision[];
  constraints: string[];
  files: CapsuleFile[];
  commands: CapsuleCommand[];
  tests: CapsuleTest[];
  failures: CapsuleFailure[];
  next_action: string;
  evidence: CapsuleEvidence[];
  git: GitState;
  redaction?: {
    applied: boolean;
    count: number;
  };
}
