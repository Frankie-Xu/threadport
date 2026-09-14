import Fastify, { type FastifyError } from 'fastify';
import { randomBytes,randomUUID } from 'node:crypto';
import { openStore, type SqliteStore } from '../storage/sqlite-store.js';
import { IndexService } from '../indexing/service.js';
import { installAuth,fail } from './auth.js';
import { registerStatus,type IndexStatus } from './routes.js';
/** Internal composition point for later routes and lifecycle tests. Owns these resources. */
export function createLocalApp(store:Pick<SqliteStore,'statusCounts'|'close'>,indexer:Pick<IndexService,'stop'>,token:string,indexStatus:()=>IndexStatus){
 const app=Fastify({logger:false,trustProxy:false,bodyLimit:1024*1024,requestTimeout:30000,connectionTimeout:30000,forceCloseConnections:true,requestIdHeader:false,genReqId:()=>randomUUID(),ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 installAuth(app,token);
 app.setErrorHandler((error,request,reply)=>{
  const code=(error as FastifyError).statusCode;
  const status=typeof code==='number'&&code>=400&&code<500?code:500;
  return fail(reply,request,status,status===413?'BODY_TOO_LARGE':status<500?'INVALID_INPUT':'INTERNAL_ERROR',status<500?'Invalid request.':'Request failed.');
 });
 app.setNotFoundHandler((request,reply)=>fail(reply,request,404,'NOT_FOUND','Route not found.'));
 registerStatus(app,store,indexStatus);
 app.addHook('onClose',async()=>{try{await indexer.stop();}finally{store.close();}});
 return app;
}
export interface LocalServer {origin:string;token:string;close():Promise<void>}
/** Only loopback and OS-assigned ports; no import-time DB, listener, scanner or logging. */
export async function startLocalServer(options:{dataDir?:string}={}):Promise<LocalServer>{
 const store=await openStore(options);
 const running=new Set<string>();let lastRefreshAt:string|null=null;
 const indexer=new IndexService(store,{onProgress:progress=>{
  if(progress.state==='running'||progress.state==='queued')running.add(progress.sourceId);else running.delete(progress.sourceId);
  if(progress.state==='completed'||progress.state==='partial')lastRefreshAt=new Date().toISOString();
 }});
 const token=randomBytes(32).toString('hex');
 const app=createLocalApp(store,indexer,token,()=>({running:running.size,lastRefreshAt}));
 try{
  const origin=await app.listen({host:'127.0.0.1',port:0});indexer.start();
  let closing:Promise<void>|undefined;
  return{origin,token,close:()=>closing??=app.close()};
 }catch(error){await app.close();throw error;}
}
