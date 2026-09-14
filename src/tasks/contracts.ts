import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { redactSecrets } from '../redact.js';
export const taskId = z.string().min(1).max(512);
export const taskRevision = z.number().int().positive().safe();
const text = (max:number) => z.string().max(max);
const title = text(120).refine(value=>value.trim().length>0);
export const taskPatchSchema = z.object({
  title: title.optional(), objective: text(8000).optional(),
  constraints: z.array(text(2000)).max(50).optional(), nextAction: text(4000).optional(),
  lifecycle: z.enum(['active','paused','completed']).optional(), archived: z.boolean().optional(),
}).strict();
export const createTaskSchema = z.object({projectId:taskId,title,sessionId:taskId.optional()}).strict();
export type TaskPatch = z.infer<typeof taskPatchSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export function validateTaskInput<T>(schema:z.ZodType<T>,input:unknown):T {
  const result=schema.safeParse(input);
  if(!result.success)throw new DomainError('INVALID_INPUT',`Invalid task field: ${result.error.issues[0]?.path.join('.') || 'input'}.`);
  return result.data;
}
/** Validate before redacting. Callers present changes, then submit the returned patch. */
export function previewTaskPatch(input:TaskPatch):{patch:TaskPatch;redactedFields:string[]} {
  const patch=validateTaskInput(taskPatchSchema,input);const redactedFields:string[]=[];
  for(const field of ['title','objective','nextAction'] as const){
    const value=patch[field];if(value!==undefined){const result=redactSecrets(value);patch[field]=result.text;if(result.text!==value)redactedFields.push(field);}
  }
  if(patch.constraints)patch.constraints=patch.constraints.map((value,index)=>{const result=redactSecrets(value);if(result.text!==value)redactedFields.push(`constraints.${index}`);return result.text;});
  validateTaskInput(taskPatchSchema,patch);
  return {patch,redactedFields};
}
