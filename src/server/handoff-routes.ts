import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SqliteStore } from '../storage/sqlite-store.js';
import { HandoffService } from '../handoff/prepare.js';
import { prepareSchema,confirmSchema } from '../handoff/contracts.js';
import { exportHandoff } from '../handoff/export.js';
const empty=z.object({}).strict();
const id=(params:unknown)=>z.object({id:z.string().uuid()}).strict().parse(params).id;
export function registerHandoffRoutes(app:FastifyInstance,store:SqliteStore){
 const service=new HandoffService(store);
 app.post('/api/v1/handoffs',async(request,reply)=>{empty.parse(request.query);return reply.code(201).send({data:await service.prepareHandoff(prepareSchema.parse(request.body))});});
 app.get('/api/v1/handoffs/:id',async request=>{empty.parse(request.query);return {data:service.get(id(request.params))};});
 app.post('/api/v1/handoffs/:id/confirm',async request=>{empty.parse(request.query);const body=confirmSchema.omit({id:true}).parse(request.body);return {data:await service.confirmHandoff({...body,id:id(request.params)})};});
 app.post('/api/v1/handoffs/:id/export',async(request,reply)=>{
  empty.parse(request.query);const handoff=service.get(id(request.params)).handoff;const {format}=z.object({format:z.enum(['markdown','json'])}).strict().parse(request.body);
  return reply.header('content-disposition',`attachment; filename="handoff-${handoff.id}.${format==='json'?'json':'md'}"`).type(format==='json'?'application/json; charset=utf-8':'text/markdown; charset=utf-8').send(exportHandoff(handoff,format));
 });
}
