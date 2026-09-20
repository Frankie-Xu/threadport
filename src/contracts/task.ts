import { z } from 'zod';
import { idSchema, taskRevisionSchema } from './identifiers.js';

const dateSchema = z.string().datetime();
const text = (max: number) => z.string().max(max);

export const taskTitleSchema = text(120).refine(value => value.trim().length > 0);

export const claimSchema = z.object({
  text: z.string(),
  origin: z.enum(['observed', 'user-confirmed', 'derived', 'unknown']),
  evidence: z.array(z.object({ sessionId: idSchema, eventId: idSchema }).strict()),
  updatedAt: dateSchema.nullable(),
}).strict();

export const taskSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  revision: taskRevisionSchema,
  title: z.string().min(1),
  objective: claimSchema,
  constraints: z.array(claimSchema),
  nextAction: claimSchema,
  lifecycle: z.enum(['active', 'paused', 'completed']),
  archived: z.boolean(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
}).strict();

export const taskWriteSchema = taskSchema.extend({
  title: taskTitleSchema,
  objective: claimSchema.extend({ text: text(8000) }),
  constraints: z.array(claimSchema.extend({ text: text(2000) })).max(50),
  nextAction: claimSchema.extend({ text: text(4000) }),
});

export const taskPatchSchema = z.object({
  title: taskTitleSchema.optional(),
  objective: text(8000).optional(),
  constraints: z.array(text(2000)).max(50).optional(),
  nextAction: text(4000).optional(),
  lifecycle: z.enum(['active', 'paused', 'completed']).optional(),
  archived: z.boolean().optional(),
}).strict();

export const createTaskSchema = z.object({
  projectId: idSchema,
  title: taskTitleSchema,
  sessionId: idSchema.optional(),
}).strict();

export type TaskPatch = z.infer<typeof taskPatchSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
