import { z } from 'zod';
import { capsuleSchema } from './capsule.js';
import type { Capsule } from './types.js';

export const targetAgentSchema = z.enum(['claude', 'codex', 'cursor', 'gemini']);
export type TargetAgent = z.infer<typeof targetAgentSchema>;
export const handoffSchema = z.object({
  protocol: z.literal('threadport.handoff.v1'),
  target_agent: targetAgentSchema,
  capsule: capsuleSchema,
  safety: z.object({ execute_commands: z.literal(false), modify_workspace: z.literal(false) }).strict()
}).strict();
export type HandoffEnvelope = z.infer<typeof handoffSchema>;
export function createHandoff(capsule: Capsule, target: TargetAgent): HandoffEnvelope {
  return handoffSchema.parse({ protocol: 'threadport.handoff.v1', target_agent: target, capsule, safety: { execute_commands: false, modify_workspace: false } });
}
export function parseHandoff(text: string): HandoffEnvelope { return handoffSchema.parse(JSON.parse(text)); }
