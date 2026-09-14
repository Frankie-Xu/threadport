import type { FastifyInstance } from 'fastify';
import type { SqliteStore } from '../storage/sqlite-store.js';
import { emptyQuery } from './schemas.js';
export interface IndexStatus {running:number;lastRefreshAt:string|null}
export function registerStatus(app:FastifyInstance,store:Pick<SqliteStore,'statusCounts'>,indexStatus:()=>IndexStatus){
 app.get('/api/v1/status',{schema:{querystring:emptyQuery}},async()=>{
  const counts=store.statusCounts();
  return{data:{version:'0.1.0',index:indexStatus(),capacity:{events:counts.events,eventLimit:100000,indexedBytes:counts.indexedBytes,byteLimit:1024*1024*1024},counts:{sources:counts.sources,sessions:counts.sessions,tasks:counts.tasks}}};
 });
}
