import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { redactSecrets } from '../redact.js';
import { idSchema, taskRevisionSchema } from '../contracts/identifiers.js';
import { createTaskSchema, taskPatchSchema, taskTitleSchema, type CreateTaskInput, type TaskPatch } from '../contracts/task.js';

export { createTaskSchema, taskPatchSchema } from '../contracts/task.js';
export type { CreateTaskInput, TaskPatch } from '../contracts/task.js';
export const taskId = idSchema;
export const taskRevision = taskRevisionSchema;
export const taskTitle = taskTitleSchema;
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
