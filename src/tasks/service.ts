import { randomUUID } from 'node:crypto';
import type { Claim, Task } from '../domain/models.js';
import { deriveTask, resolveTaskState } from '../domain/derive-task.js';
import { DomainError } from '../domain/errors.js';
import type { SqliteStore } from '../storage/sqlite-store.js';
import { createTaskSchema, previewTaskPatch, taskId as idSchema, taskRevision, validateTaskInput, type CreateTaskInput, type TaskPatch } from './contracts.js';
export { previewTaskPatch } from './contracts.js';
export type { TaskPatch, CreateTaskInput } from './contracts.js';
export type TaskPort=Pick<SqliteStore,'listTasks'|'getTask'|'saveTask'|'sessionIds'|'readTaskContext'>;
/** User mutations only; indexing cannot call this service implicitly. */
export class TaskService {
  constructor(private readonly store:TaskPort){}
  async list(limit=100,offset=0,includeArchived=false):Promise<Task[]>{return this.store.listTasks(limit,offset,includeArchived);}
  async create(input:CreateTaskInput):Promise<Task>{
    const parsed=validateTaskInput(createTaskSchema,input);this.confirmed({title:parsed.title});
    const now=new Date().toISOString();const unknown:Claim={text:'',origin:'unknown',evidence:[],updatedAt:null};
    return this.store.saveTask({id:randomUUID(),projectId:parsed.projectId,revision:1,title:parsed.title,objective:unknown,constraints:[],nextAction:unknown,lifecycle:'active',archived:false,createdAt:now,updatedAt:now},0,parsed.sessionId?[parsed.sessionId]:[]);
  }
  async update(id:string,expectedRevision:number,input:TaskPatch):Promise<Task>{
    const patch=this.confirmed(input);const task=this.current(id,expectedRevision);const now=new Date().toISOString();
    const claim=(value:string):Claim=>({text:value,origin:'user-confirmed',evidence:[],updatedAt:now});
    const updated:Task={...task,revision:task.revision+1,updatedAt:now};
    for(const key of ['title','lifecycle','archived'] as const)if(patch[key]!==undefined)Object.assign(updated,{[key]:patch[key]});
    if(patch.objective!==undefined)updated.objective=claim(patch.objective);
    if(patch.nextAction!==undefined)updated.nextAction=claim(patch.nextAction);
    if(patch.constraints!==undefined)updated.constraints=patch.constraints.map(claim);
    return this.store.saveTask(updated,expectedRevision);
  }
  async attachSession(taskId:string,sessionId:string,expectedRevision:number):Promise<Task>{
    validateTaskInput(idSchema,sessionId);const task=this.current(taskId,expectedRevision);
    const sessions=this.store.sessionIds(taskId);
    if(sessions.includes(sessionId))throw new DomainError('INVALID_INPUT','Session is already attached to this task.');
    return this.store.saveTask({...task,revision:task.revision+1,updatedAt:new Date().toISOString()},expectedRevision,[...sessions,sessionId]);
  }
  async detachSession(taskId:string,sessionId:string,expectedRevision:number):Promise<Task>{
    validateTaskInput(idSchema,sessionId);const task=this.current(taskId,expectedRevision);const sessions=this.store.sessionIds(taskId);
    if(!sessions.includes(sessionId))throw new DomainError('NOT_FOUND','Session is not attached to this task.');
    return this.store.saveTask({...task,revision:task.revision+1,updatedAt:new Date().toISOString()},expectedRevision,sessions.filter(id=>id!==sessionId));
  }
  async detail(id:string){
    validateTaskInput(idSchema,id);const context=this.store.readTaskContext(id);const derived=deriveTask(context.events);
    if(context.newActivity)derived.attention.push('ACTIVITY_AFTER_COMPLETION');
    return {task:context.task,sessionIds:context.sessionIds,derived,resolved:resolveTaskState(context.task,derived)};
  }
  private current(id:string,revision:number):Task{
    validateTaskInput(idSchema,id);validateTaskInput(taskRevision,revision);
    const task=this.store.getTask(id);if(!task)throw new DomainError('NOT_FOUND','Task does not exist.');
    if(task.revision!==revision)throw new DomainError('REVISION_CONFLICT','Task revision changed; reload before saving.');return task;
  }
  private confirmed(input:TaskPatch):TaskPatch{
    const preview=previewTaskPatch(input);
    if(preview.redactedFields.length)throw new DomainError('REDACTION_REQUIRED',`Review redacted task fields before saving: ${preview.redactedFields.join(', ')}.`);
    return preview.patch;
  }
}
