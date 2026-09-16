import { registerAssertionRoutes } from './assertion-routes.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID,createHash } from 'node:crypto';
import { lstat,realpath } from 'node:fs/promises';
import { basename,isAbsolute,parse } from 'node:path';
import type { SqliteStore } from '../storage/sqlite-store.js';
import type { IndexService,IndexProgress } from '../indexing/service.js';
import { TaskService } from '../tasks/service.js';
import { createTaskSchema,taskPatchSchema } from '../tasks/contracts.js';
import { SearchService } from '../search/service.js';
import { DomainError } from '../domain/errors.js';
import { detectTargetCapabilities } from '../targets.js';
import { taskDto,eventDto,claimDto,runDto } from './dto.js';
import { publicText } from '../privacy.js';
const id=z.string().min(1).max(512).regex(/^[A-Za-z0-9][A-Za-z0-9:._-]*$/);
const pagination={limit:z.coerce.number().int().min(1).max(100).default(50),cursor:z.string().max(2048).optional()};
const empty=z.object({}).strict();
const p=(request:{params:unknown})=>z.object({id}).strict().parse(request.params).id;
const revision=z.number().int().positive().safe();
async function directory(root:string){if(!isAbsolute(root))throw new DomainError('INVALID_INPUT','Choose an absolute directory.');const info=await lstat(root);if(!info.isDirectory()||info.isSymbolicLink())throw new DomainError('INVALID_INPUT','Choose a physical directory.');const canonical=await realpath(root);if(canonical===parse(canonical).root)throw new DomainError('INVALID_INPUT','Choose a narrower directory.');return canonical;}
export function registerBusinessRoutes(app:FastifyInstance,store:SqliteStore,indexer:IndexService){
 registerAssertionRoutes(app,store);
 const api=store.apiStore(),tasks=new TaskService(store),search=new SearchService(store);
 const jobs=new Map<string,{sourceIds:string[];key:string;results:Map<string,IndexProgress>}>();
 app.get('/api/v1/projects',async request=>{empty.parse(request.query);return{data:api.projects().map(row=>({id:row.id,name:publicText(row.name)}))};});
 app.get('/api/v1/workspaces',async request=>{const q=z.object({projectId:id.optional()}).strict().parse(request.query);return{data:api.workspaces(q.projectId)};});
 app.post('/api/v1/workspaces',async(request,reply)=>{const body=z.object({projectId:id.optional(),root:z.string().max(32768),confirmBinding:z.literal(true)}).strict().parse(request.body);const root=await directory(body.root);return reply.code(201).send({data:api.bindWorkspace(root,body.projectId,basename(root).slice(0,120))});});
 app.get('/api/v1/sources',async request=>{empty.parse(request.query);const rows=[];for(let offset=0;;offset+=100){const page=store.listSources(100,offset);rows.push(...page.map(source=>({id:source.id,agent:source.agent,roots:source.roots,enabled:source.enabled,parserVersion:source.parserVersion})));if(page.length<100)break;}return{data:rows};});
 app.post('/api/v1/sources',async(request,reply)=>{const body=z.object({agent:z.enum(['claude','codex']),root:z.string().max(32768)}).strict().parse(request.body);const root=await directory(body.root);const source={id:'source-'+createHash('sha256').update(body.agent+'\0'+root).digest('hex').slice(0,32),agent:body.agent,roots:[root],enabled:true,parserVersion:`${body.agent}-jsonl-v1`};store.saveSource(source);return reply.code(201).send({data:source});});
 app.delete('/api/v1/sources/:id',async request=>{const source=p(request);z.object({confirmation:z.literal(true)}).strict().parse(request.body);await indexer.cancelAndWait(source);api.revokeSource(source);return{data:{id:source,revoked:true}};});
 app.post('/api/v1/index-jobs',async(request,reply)=>{
  const sourceIds=[...new Set(z.object({sourceIds:z.array(id).min(1).max(20)}).strict().parse(request.body).sourceIds)].sort();
  for(const sourceId of sourceIds)if(!store.getSource(sourceId)?.enabled)throw new DomainError('NOT_FOUND','Enabled source does not exist.');
  const key=JSON.stringify(sourceIds);const existing=[...jobs].find(([,job])=>job.key===key&&job.results.size<job.sourceIds.length);
  if(existing)return reply.code(202).send({data:{jobId:existing[0]}});
  if(jobs.size>=1000){const finished=[...jobs].find(([,job])=>job.results.size===job.sourceIds.length);if(finished)jobs.delete(finished[0]);else throw new DomainError('STORAGE_BUSY','Too many active jobs.');}
  const jobId=randomUUID();const job={sourceIds,key,results:new Map<string,IndexProgress>()};jobs.set(jobId,job);for(const source of sourceIds)void indexer.refresh(source).then(result=>{job.results.set(source,result);}).catch(()=>{job.results.set(source,{sourceId:source,state:'failed',files:0,events:0,failures:1,warnings:['INDEX_FAILED']});});
  return reply.code(202).send({data:{jobId}});
 });
 app.get('/api/v1/index-jobs/:id',async request=>{const jobId=p(request),job=jobs.get(jobId);if(!job)throw new DomainError('NOT_FOUND','Job does not exist.');return{data:{jobId,progress:job.sourceIds.map(sourceId=>{const progress=job.results.get(sourceId)??indexer.progress(sourceId);return{sourceId,state:progress?.state??'queued',files:progress?.files??0,events:progress?.events??0,failures:progress?.failures??0,warnings:progress?.warnings??[]};})}};});
 app.delete('/api/v1/index-jobs/:id',async request=>{const jobId=p(request),job=jobs.get(jobId);if(!job)throw new DomainError('NOT_FOUND','Job does not exist.');if(request.body!==undefined)empty.parse(request.body);await Promise.all(job.sourceIds.filter(source=>!job.results.has(source)).map(source=>indexer.cancelAndWait(source)));return{data:{jobId,cancelled:true}};});
 app.get('/api/v1/tasks',async request=>{const q=z.object({...pagination,q:z.string().max(1024).default(''),projectId:id.optional(),lifecycle:z.enum(['active','paused','completed']).optional(),archived:z.enum(['true','false']).default('false').transform(value=>value==='true')}).strict().parse(request.query);const page=api.taskPage(q);return{data:await Promise.all(page.data.map(async task=>({...taskDto(task),attention:(await tasks.detail(task.id)).resolved.attention,lastActivityAt:api.taskActivity(task.id)}))),nextCursor:page.nextCursor};});
 app.post('/api/v1/tasks',async(request,reply)=>reply.code(201).send({data:taskDto(await tasks.create(createTaskSchema.parse(request.body)))}));
 app.get('/api/v1/tasks/:id',async request=>{const detail=await tasks.detail(p(request));return{data:{task:taskDto(detail.task),sessionIds:detail.sessionIds,sessions:api.taskSessions(detail.task.id),files:(()=>{const value=api.fileEvidence(detail.task.id);return{items:value.items.map(item=>({...item,path:publicText(item.path)})),hasMore:value.hasMore};})(),derived:{objective:detail.derived.objective?claimDto(detail.derived.objective):null,constraints:detail.derived.constraints.map(claimDto),latestRuns:detail.derived.latestRuns.map(runDto),attention:detail.derived.attention},resolved:{objective:detail.resolved.objective?claimDto(detail.resolved.objective):null,constraints:detail.resolved.constraints.map(claimDto),nextAction:detail.resolved.nextAction?claimDto(detail.resolved.nextAction):null,lifecycle:detail.resolved.lifecycle,archived:detail.resolved.archived,attention:detail.resolved.attention}}};});
 app.patch('/api/v1/tasks/:id',async request=>{const body=z.object({expectedRevision:revision,patch:taskPatchSchema}).strict().parse(request.body);return{data:taskDto(await tasks.update(p(request),body.expectedRevision,body.patch))};});
 app.post('/api/v1/tasks/:id/sessions',async request=>{const body=z.object({sessionId:id,expectedRevision:revision}).strict().parse(request.body);return{data:taskDto(await tasks.attachSession(p(request),body.sessionId,body.expectedRevision))};});
 app.delete('/api/v1/tasks/:id/sessions/:sessionId',async request=>{const params=z.object({id,sessionId:id}).strict().parse(request.params);const body=z.object({expectedRevision:revision}).strict().parse(request.body);return{data:taskDto(await tasks.detachSession(params.id,params.sessionId,body.expectedRevision))};});
 app.get('/api/v1/sessions/unassigned',async request=>{const q=z.object({...pagination,projectId:id.optional()}).strict().parse(request.query);return api.unassignedPage(q);});
 app.get('/api/v1/sessions',async request=>{const q=z.object({...pagination,q:z.string().max(1024).optional(),projectId:id.optional(),agent:z.enum(['claude','codex']).optional(),from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional()}).strict().parse(request.query);const page=await search.search(q);return{data:page.items.map(item=>({id:item.id,kind:item.kind,sessionId:item.sessionId,task:item.task?{id:item.task.id,title:publicText(item.task.title)}:null,project:item.project?{id:item.project.id,name:publicText(item.project.name)}:null,workspace:item.workspace?{id:item.workspace.id,displayPath:'.'}:null,agent:item.agent,lastActivityAt:item.lastActivityAt,matches:item.matches.map(match=>({...match,text:publicText(match.text),highlights:publicText(match.text)===match.text?match.highlights:[]}))})),nextCursor:page.nextCursor};});
 app.get('/api/v1/sessions/:id/events',async request=>{
  const sessionId=p(request);if(!store.getSessionBinding(sessionId))throw new DomainError('NOT_FOUND','Session does not exist.');
  const q=z.object({...pagination,eventId:id.optional()}).strict().refine(value=>!(value.eventId&&value.cursor)).parse(request.query);const generation=api.generation();let offset=q.eventId?api.eventOffset(sessionId,q.eventId):0;
  if(q.cursor){try{const value=JSON.parse(Buffer.from(q.cursor,'base64url').toString('utf8'));if(value.generation!==generation)throw new DomainError('SEARCH_STALE','Events changed; restart pagination.');if(value.sessionId!==sessionId||value.limit!==q.limit||!Number.isSafeInteger(value.offset)||value.offset<0)throw new Error();offset=value.offset;}catch(error){if(error instanceof DomainError)throw error;throw new DomainError('INVALID_INPUT','Invalid event cursor.');}}
  const rows=store.listEvents(sessionId,q.limit+1,offset);return{data:rows.slice(0,q.limit).map(eventDto),nextCursor:rows.length>q.limit?Buffer.from(JSON.stringify({generation,sessionId,limit:q.limit,offset:offset+q.limit})).toString('base64url'):null};
 });
 app.get('/api/v1/targets',async request=>{empty.parse(request.query);return{data:await detectTargetCapabilities()};});
}
