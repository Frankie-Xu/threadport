import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors.js';
import type { NormalizedEvent } from '../domain/models.js';
import type { SourceAdapter, SourceCandidate, SourceReadResult, ReadCursor } from '../sources/contracts.js';
import { createSourceRegistry } from '../sources/registry.js';
import type { IndexStore } from '../storage/index-store.js';
import { ReadSlots, scheduleRefresh } from './scheduler.js';
export interface IndexProgress { sourceId:string;state:'queued'|'running'|'completed'|'partial'|'cancelled'|'failed'|'busy';files:number;events:number;failures:number;warnings:string[] }
export type IndexPort=Pick<IndexStore,'getSource'|'listSources'|'acquireIndexLease'|'renewIndexLease'|'releaseIndexLease'|'getIndexedSession'|'listIndexedSessions'|'commitIndexPage'>;
export class IndexService {
 private readonly jobs=new Map<string,{controller:AbortController;promise:Promise<IndexProgress>;progress:IndexProgress}>();
 private readonly slots=new ReadSlots();private stopTimer:(()=>void)|undefined;private stopping=false;
 constructor(private readonly store:IndexPort,private readonly options:{onProgress?:(progress:IndexProgress)=>void;adapterFactory?:(sourceId:string)=>SourceAdapter}={}){}
 progress(sourceId:string):IndexProgress|undefined{const p=this.jobs.get(sourceId)?.progress;return p?structuredClone(p):undefined;}
 cancel(sourceId:string):void{this.jobs.get(sourceId)?.controller.abort();}
 start():void{if(this.stopping)throw new DomainError('INVALID_INPUT','Indexer is stopped.');if(!this.stopTimer)this.stopTimer=scheduleRefresh(()=>this.refreshAll());}
 async stop():Promise<void>{this.stopping=true;this.stopTimer?.();this.stopTimer=undefined;for(const job of this.jobs.values())job.controller.abort();await Promise.allSettled([...this.jobs.values()].map(job=>job.promise));}
 async refreshAll():Promise<IndexProgress[]>{const promises:Promise<IndexProgress>[]=[];for(let offset=0;;offset+=100){const configs=this.store.listSources(100,offset);for(const config of configs)if(config.enabled)promises.push(this.refresh(config.id));if(configs.length<100)break;}return Promise.all(promises);}
 refresh(sourceId:string):Promise<IndexProgress>{
  if(this.stopping)return Promise.reject(new DomainError('INVALID_INPUT','Indexer is stopped.'));
  const existing=this.jobs.get(sourceId);if(existing&&['queued','running'].includes(existing.progress.state))return existing.promise;
  const controller=new AbortController();const progress:IndexProgress={sourceId,state:'queued',files:0,events:0,failures:0,warnings:[]};
  // Defer work until the job is registered so simultaneous calls coalesce.
  const promise=Promise.resolve().then(()=>this.run(sourceId,controller.signal,progress));this.jobs.set(sourceId,{controller,promise,progress});return promise;
 }
 private notify(progress:IndexProgress){try{this.options.onProgress?.(structuredClone(progress));}catch{/* Observers cannot interrupt or undo an index commit. */}}
 private warn(progress:IndexProgress,code:string){if(progress.warnings.length<32&&!progress.warnings.includes(code))progress.warnings.push(code);}
 private async run(sourceId:string,signal:AbortSignal,progress:IndexProgress):Promise<IndexProgress>{
  let release:(()=>void)|undefined;let leased=false;let heartbeat:ReturnType<typeof setInterval>|undefined;const owner=randomUUID();
  try{
   release=await this.slots.acquire(signal);signal.throwIfAborted();
   const config=this.store.getSource(sourceId);if(!config||!config.enabled)throw new DomainError('INVALID_INPUT','Source is missing or disabled.');
   if(!this.store.acquireIndexLease(sourceId,owner)){progress.state='busy';return structuredClone(progress);}leased=true;heartbeat=setInterval(()=>{try{this.store.renewIndexLease(sourceId,owner);}catch{this.jobs.get(sourceId)?.controller.abort();}},10000);heartbeat.unref();progress.state='running';this.notify(progress);
   const adapter=this.options.adapterFactory?.(sourceId)??createSourceRegistry([{sourceId,agent:config.agent,roots:config.roots}]).get(sourceId)!;
   const seen=new Set<string>();
   const consume=async(candidate:SourceCandidate)=>{
    signal.throwIfAborted();seen.add(candidate.path);
    const existing=this.store.getIndexedSession(sourceId,candidate.path);let committed:ReadCursor|null=existing?.cursor??null;let cursor=committed;
    let batchEvents:NormalizedEvent[]=[];let reset=!!existing&&!committed;let started=performance.now();let pages=0;
    try{
     while(true){
      signal.throwIfAborted();if(++pages>100000)throw new DomainError('INDEX_LIMIT','Source page limit reached; narrow the source.');
      this.store.renewIndexLease(sourceId,owner);
      const page=await adapter.read({candidate,cursor,maxEvents:100-batchEvents.length,signal});signal.throwIfAborted();
      for(const warning of page.warnings)this.warn(progress,warning);
      if(page.warnings.includes('SOURCE_RESET')){batchEvents=[];reset=true;}
      if(page.session.status==='missing'||page.session.status==='error'){
       progress.failures++;batchEvents=[];this.store.commitIndexPage(sourceId,owner,{...page,events:[],cursor:committed??page.cursor},committed,false);break;
      }
      if(page.hasMore&&cursor&&JSON.stringify(cursor)===JSON.stringify(page.cursor))throw new DomainError('INDEX_STALE','Source cursor did not advance.');
      batchEvents.push(...page.events);cursor=page.cursor;
      if(batchEvents.length>=100||performance.now()-started>=100||!page.hasMore){
       signal.throwIfAborted();this.store.commitIndexPage(sourceId,owner,{...page,events:batchEvents},committed,reset);progress.events+=batchEvents.length;committed=cursor;batchEvents=[];reset=false;started=performance.now();this.notify(progress);
      }
      if(!page.hasMore)break;
     }
     progress.files++;this.notify(progress);
    }catch(error){signal.throwIfAborted();if(error instanceof DomainError&&['INDEX_LIMIT','INDEX_STALE'].includes(error.code))throw error;progress.failures++;this.warn(progress,error instanceof DomainError?error.code:'SOURCE_READ_FAILED');}
   };
   for await(const candidate of adapter.discover(config.roots,signal))await consume(candidate);
   for(const diagnostic of adapter.diagnostics)this.warn(progress,diagnostic.code);
   // Probe undiscovered known paths; never equate a failed/limited directory scan with deletion.
   for(let offset=0;;offset+=100){const known=this.store.listIndexedSessions(sourceId,100,offset);for(const session of known)if(!seen.has(session.sourcePath))await consume({sourceId,path:session.sourcePath,agent:config.agent});if(known.length<100)break;}
   progress.state=progress.warnings.length?'partial':'completed';
  }catch(error){progress.state=signal.aborted?'cancelled':'failed';if(!signal.aborted){progress.failures++;this.warn(progress,error instanceof DomainError?error.code:'INDEX_FAILED');}}
  finally{if(heartbeat)clearInterval(heartbeat);if(leased){try{this.store.releaseIndexLease(sourceId,owner);}catch{this.warn(progress,'LEASE_RELEASE_FAILED');}}release?.();this.notify(progress);}
  return structuredClone(progress);
 }
}
