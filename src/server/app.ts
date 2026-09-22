import {registerDataRoutes} from './data-routes.js';
import {applicationDataDir} from '../platform/paths.js';
import Fastify, { type FastifyError } from 'fastify';
import { randomBytes,randomUUID } from 'node:crypto';
import { openStore, type SqliteStore } from '../storage/sqlite-store.js';
import { IndexService } from '../indexing/service.js';
import { installAuth,fail } from './auth.js';
import { registerStatus,type IndexStatus } from './routes.js';
import { registerBusinessRoutes } from './business-routes.js';
import { DomainError } from '../domain/errors.js';
import { ZodError } from 'zod';
import { registerHandoffRoutes } from './handoff-routes.js';
import { registerBootstrap } from './bootstrap.js';
import { errorBody } from './error-response.js';
import { registerControlPlaneRoutes } from './control-plane-routes.js';
/** Internal composition point for later routes and lifecycle tests. Owns these resources. */
export function createLocalApp(store:Pick<SqliteStore,'statusCounts'|'close'>,indexer:Pick<IndexService,'stop'>,token:string,indexStatus:()=>IndexStatus){
 const app=Fastify({logger:false,trustProxy:false,bodyLimit:1024*1024,requestTimeout:30000,connectionTimeout:30000,forceCloseConnections:true,requestIdHeader:false,genReqId:()=>randomUUID(),ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 const json=app.getDefaultJsonParser('error','error');
 app.removeContentTypeParser('application/json');
 app.addContentTypeParser('application/json',{parseAs:'string'},(request,body,done)=>{if(request.method==='DELETE'&&body==='')done(null,undefined);else json(request,body.toString(),done);});
 installAuth(app,token);
 app.setErrorHandler((error,request,reply)=>{
  if(error instanceof ZodError)return fail(reply,request,400,'INVALID_INPUT','Invalid request fields.');
  if(error instanceof DomainError){
   const statuses:Partial<Record<DomainError['code'],number>>={INVALID_INPUT:400,NOT_FOUND:404,REVISION_CONFLICT:409,PROJECT_MISMATCH:409,SEARCH_STALE:409,REDACTION_REQUIRED:422,STORAGE_BUSY:503,INDEX_LIMIT:409,TARGET_UNSUPPORTED:422,CONTEXT_BUDGET_EXCEEDED:422,WORKSPACE_BUSY:409,LAUNCH_STATE_UNKNOWN:409,ASSERTION_CONFLICT:409,NEXT_ACTION_REVIEW_REQUIRED:422,RECEIPT_DIGEST_MISMATCH:409,RECEIPT_TARGET_MISMATCH:409,STOP_UNAVAILABLE:409,CONTROL_COVERAGE_GAP:409,RECEIPT_NONCE_CONFLICT:409,TAKEOVER_CONFLICT:409};
   return reply.code(statuses[error.code]??500).send({error:{...errorBody(error.code,error.message,error.retryable),requestId:request.id}});
  }
  const code=(error as FastifyError).statusCode;
  const status=typeof code==='number'&&code>=400&&code<500?code:500;
  return fail(reply,request,status,status===413?'BODY_TOO_LARGE':status<500?'INVALID_INPUT':'INTERNAL_ERROR',status<500?'Invalid request.':'Request failed.');
 });
 app.setNotFoundHandler((request,reply)=>fail(reply,request,404,'NOT_FOUND','Route not found.'));
 registerStatus(app,store,indexStatus);
 app.addHook('onClose',async()=>{try{await indexer.stop();}finally{store.close();}});
 return app;
}
export interface LocalServer {origin:string;token:string;closed:Promise<void>;close():Promise<void>}
// autoRefresh can be disabled by deterministic benchmark workers; production defaults remain enabled.
/** Only loopback and OS-assigned ports; no import-time DB, listener, scanner or logging. */
export async function startLocalServer(options:{dataDir?:string;demo?:boolean;autoRefresh?:boolean}={}):Promise<LocalServer>{
 const store=await openStore(options);
 const running=new Set<string>();let lastRefreshAt:string|null=null;
 const indexer=new IndexService(store,{onProgress:progress=>{
  if(progress.state==='running'||progress.state==='queued')running.add(progress.sourceId);else running.delete(progress.sourceId);
  if(progress.state==='completed'||progress.state==='partial')lastRefreshAt=new Date().toISOString();
 }});
 const token=randomBytes(32).toString('hex');
 const app=createLocalApp(store,indexer,token,()=>({running:running.size,lastRefreshAt}));
 let closing:Promise<void>|undefined;const close=()=>closing??=app.close();
 let resolveClosed!:()=>void;const closed=new Promise<void>(resolve=>{resolveClosed=resolve;});app.addHook('onClose',async()=>{resolveClosed();});
 registerBusinessRoutes(app,store,indexer);
 registerHandoffRoutes(app,store);
 registerControlPlaneRoutes(app,store);
 registerDataRoutes(app,store,applicationDataDir(options),indexer,close);
 try{
  store.maintenance().prune();
  const retention=setInterval(()=>{try{store.maintenance().prune();}catch{/* Retry next hour; never discard user data after a failed transaction. */}},3600000);retention.unref();
  app.addHook('onClose',async()=>{clearInterval(retention);});
  await registerBootstrap(app,options.demo??false);
  const origin=await app.listen({host:'127.0.0.1',port:0});if(options.autoRefresh!==false)indexer.start();
  return{origin,token,closed,close};
 }catch(error){await app.close();throw error;}
}
