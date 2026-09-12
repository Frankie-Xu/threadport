import { z } from "zod";
import type { Capsule } from "./types.js";

const agentSchema = z.enum(["claude", "codex", "cursor", "gemini", "unknown"]);
const statusSchema = z.enum(["active", "blocked", "completed", "paused"]);
const shaSchema = z.string().regex(/^[0-9a-f]{40}$/i, "must be a 40-character Git SHA");

export const capsuleSchema = z.object({
  schema_version: z.literal("1.0"),
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  created_at: z.string().datetime({ offset: true }),
  source_agent: agentSchema,
  source_session_id: z.string().min(1).optional(),
  project: z.object({
    name: z.string().min(1),
    root: z.string().min(1),
    repository: z.string().url().optional()
  }).strict(),
  objective: z.string().min(1),
  acceptance_criteria: z.array(z.string().min(1)),
  status: statusSchema,
  completed: z.array(z.string().min(1)),
  decisions: z.array(z.object({
    decision: z.string().min(1),
    rationale: z.string().optional(),
    evidence: z.array(z.string().min(1)).optional()
  }).strict()),
  constraints: z.array(z.string().min(1)),
  files: z.array(z.object({
    path: z.string().min(1),
    action: z.enum(["added", "modified", "deleted", "renamed", "unknown"]),
    summary: z.string().optional()
  }).strict()),
  commands: z.array(z.object({
    command: z.string().min(1),
    exit_code: z.number().int().optional(),
    summary: z.string().optional()
  }).strict()),
  tests: z.array(z.object({
    command: z.string().min(1),
    status: z.enum(["passed", "failed", "skipped", "unknown"]),
    summary: z.string().optional()
  }).strict()),
  failures: z.array(z.object({
    summary: z.string().min(1),
    resolution: z.string().optional()
  }).strict()),
  next_action: z.string().min(1),
  evidence: z.array(z.object({
    kind: z.enum(["file", "command", "test", "url", "session", "other"]),
    title: z.string().min(1),
    locator: z.string().optional(),
    digest: z.string().optional()
  }).strict()),
  git: z.object({
    root: z.string().min(1),
    branch: z.string().min(1),
    head: shaSchema,
    dirty: z.boolean(),
    dirty_diff_hash: z.string().regex(/^[0-9a-f]{64}$/i),
    changed_files: z.array(z.string().min(1))
  }).strict(),
  redaction: z.object({
    applied: z.boolean(),
    count: z.number().int().nonnegative()
  }).strict().optional()
}).strict();

export function validateCapsule(input: unknown): Capsule {
  return capsuleSchema.parse(input) as Capsule;
}

export function parseCapsule(input: string): Capsule {
  return validateCapsule(JSON.parse(input));
}

export function serializeCapsule(capsule: Capsule): string {
  return `${JSON.stringify(validateCapsule(capsule), null, 2)}\n`;
}
