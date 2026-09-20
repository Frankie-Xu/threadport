import type { FastifyInstance } from 'fastify';
import type { SqliteStore } from '../storage/sqlite-store.js';
import { z } from 'zod';
import { assertionInput } from '../assertions/contracts.js';
import { assertionDto } from '../assertions/presentation.js';
const id=z.string().min(1).max(512);
const revision=z.number().int().positive().safe();
export function registerAssertionRoutes(app:FastifyInstance,store:SqliteStore){
 const ledger=store.assertionStore();
 const task=(params:unknown)=>z.object({id}).strict().parse(params).id;
 app.post('/api/v1/tasks/:id/assertion-conflicts',async request=>{const body=z.object({expectedRevision:revision,ids:z.tuple([z.string().uuid(),z.string().uuid()])}).strict().parse(request.body);ledger.declareConflict(task(request.params),body.expectedRevision,body.ids);return {data:{recorded:true}};});
 app.get('/api/v1/tasks/:id/assertions',async request=>{
  z.object({}).strict().parse(request.query);const taskId=task(request.params),view=ledger.view(taskId);
  return {data:{entries:view.entries.map(assertionDto),history:view.history.map(assertionDto),conflicts:view.conflicts.map(c=>({...c,topic:assertionDto(view.entries.find(e=>e.id===c.ids[0])!).topic})),taskRevision:store.getTask(taskId)!.revision}};
 });
 app.post('/api/v1/tasks/:id/assertions',async(request,reply)=>{
  const body=z.object({expectedRevision:revision,assertion:assertionInput}).strict().parse(request.body);const taskId=task(request.params);
  const value=ledger.append(taskId,body.expectedRevision,body.assertion);return reply.code(201).send({data:assertionDto({...value,sourceAvailability:value.source?'indexed-only':'none'})});
 });
 app.post('/api/v1/tasks/:id/assertions/:assertionId',async request=>{
  const params=z.object({id,assertionId:z.string().uuid()}).strict().parse(request.params);const body=z.object({expectedRevision:revision,state:z.enum(['confirmed','rejected'])}).strict().parse(request.body);
  const value=ledger.transition(params.id,body.expectedRevision,params.assertionId,body.state);return {data:assertionDto({...value,sourceAvailability:value.source?'indexed-only':'none'})};
 });
}
