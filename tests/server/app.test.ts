import { afterEach,expect,it } from 'vitest';
import { startLocalServer } from '../../src/server/app.js';
import { temporary } from '../helpers.js';
const servers:{close():Promise<void>}[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>server.close()));});
it('binds loopback on a random port and protects even status reads',async()=>{
 const server=await startLocalServer({dataDir:await temporary()});servers.push(server);
 expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);expect(server.token).toMatch(/^[a-f0-9]{64}$/);
 for(const headers of [{},{authorization:'Bearer wrong'},{authorization:`Bearer ${server.token}`,origin:'null'},{authorization:`Bearer ${server.token}`,origin:'https://evil.invalid'}]){
  const response=await fetch(server.origin+'/api/v1/status',{headers:headers as Record<string,string>});expect([401,403]).toContain(response.status);
  expect(await response.text()).not.toContain(server.token);
 }
 const response=await fetch(server.origin+'/api/v1/status',{headers:{authorization:`Bearer ${server.token}`,origin:server.origin}});
 expect(response.status).toBe(200);expect(response.headers.get('access-control-allow-origin')).toBeNull();
 expect(await response.json()).toMatchObject({data:{version:'0.1.0',capacity:{events:0,eventLimit:100000}}});
},30000);

import { createLocalApp } from '../../src/server/app.js';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { openStore } from '../../src/storage/sqlite-store.js';
import { IndexService } from '../../src/indexing/service.js';
function raw(origin:string,path:string,headers:Record<string,string>|string[],method='GET',body?:string):Promise<{status:number;text:string}>{
 return new Promise((resolve,reject)=>{const req=request(origin,{path,headers,method,agent:false},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;});res.on('end',()=>resolve({status:res.statusCode!,text}));});req.on('error',reject);req.end(body);});
}
it('rejects query credentials, traversal, duplicate headers and forwarded-host bypasses',async()=>{
 const server=await startLocalServer({dataDir:await temporary()});servers.push(server);
 const authorization=`Bearer ${server.token}`,host=new URL(server.origin).host;
 for(const [path,headers,expected] of [
  ['/api/v1/status?token='+server.token,{},401],
  ['/api/v1/status?unexpected=true',{authorization},400],
  ['/api/v1/%2e%2e/private',{authorization},400],
  ['/api/v1/status',{authorization,host:'evil.invalid','x-forwarded-host':host},403],
  ['/api/v1/status',['Host',host,'Authorization',authorization,'Authorization',authorization],400],
  ['/missing',{authorization},404],
 ] as const){const response=await raw(server.origin,path,headers as Record<string,string>|string[]);expect(response.status,response.text).toBe(expected);expect(response.text).not.toContain(server.token);}
},30000);
it('applies body/type/origin and strict schema boundaries before future write handlers',async()=>{
 const token=randomBytes(32).toString('hex');let closed=false;
 const app=createLocalApp({statusCounts:()=>({events:0,indexedBytes:0,sources:0,sessions:0,tasks:0}),close:()=>{closed=true;}},{stop:async()=>{}},token,()=>({running:0,lastRefreshAt:null}));
 let calls=0;
 app.post('/api/v1/test-write',{schema:{body:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false}}},async()=>{calls++;return{data:true};});
 const origin=await app.listen({host:'127.0.0.1',port:0});servers.push({close:()=>app.close()});
 const headers={authorization:`Bearer ${token}`,'content-type':'application/json',origin};
 for(const [body,extra,status] of [
  [JSON.stringify({value:'ok'}),{},200],
  [JSON.stringify({value:'ok',unknown:true}),{},400],
  ['{',{},400],
  [JSON.stringify({value:'x'.repeat(1024*1024)}),{},413],
  [JSON.stringify({value:'ok'}),{origin:'null'},403],
  [JSON.stringify({value:'ok'}),{'content-type':'text/plain'},415],
 ] as const){const response=await raw(origin,'/api/v1/test-write',{...headers,...extra},'POST',body);expect(response.status,response.text).toBe(status);}
 expect(calls).toBe(1);await app.close();expect(closed).toBe(true);
},30000);
it('waits for cancellation before closing the real index store and tolerates repeated close',async()=>{
 const store=await openStore({dataDir:await temporary()});
 store.saveSource({id:'source',agent:'claude',roots:['synthetic'],enabled:true,parserVersion:'test'});
 let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
 const indexer=new IndexService(store,{adapterFactory:()=>({parserVersion:'test',agent:'claude',diagnostics:[],async *discover(_roots,signal){entered();await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));signal.throwIfAborted();},async read(){throw new Error('unused');}})});
 const app=createLocalApp(store,indexer,'a'.repeat(64),()=>({running:0,lastRefreshAt:null}));
 await app.listen({host:'127.0.0.1',port:0});servers.push({close:()=>app.close()});
 const job=indexer.refresh('source');await started;await app.close();
 expect((await job).state).toBe('cancelled');expect(()=>store.statusCounts()).toThrow();await app.close();
},30000);
it('rotates tokens and exposes actual safe counts, never paths or secrets',async()=>{
 const dataDir=await temporary();const store=await openStore({dataDir});store.createProject('p','Private');store.createWorkspace('w','p',dataDir);store.close();
 const first=await startLocalServer({dataDir});await first.close();await first.close();
 const second=await startLocalServer({dataDir});servers.push(second);expect(second.token).not.toBe(first.token);
 expect((await fetch(second.origin+'/api/v1/status',{headers:{authorization:`Bearer ${first.token}`}})).status).toBe(401);
 const response=await fetch(second.origin+'/api/v1/status',{headers:{authorization:`Bearer ${second.token}`}});const body=await response.text();
 expect(body).not.toContain(dataDir);expect(body).not.toContain(second.token);expect(body).not.toContain('Private');
},30000);

import { Server } from 'node:http';
import { vi } from 'vitest';
import { SqliteStore } from '../../src/storage/sqlite-store.js';
it('closes indexer and database when binding the listener fails',async()=>{
 const stop=vi.spyOn(IndexService.prototype,'stop');const close=vi.spyOn(SqliteStore.prototype,'close');
 vi.spyOn(Server.prototype,'listen').mockImplementationOnce(function(this:Server){queueMicrotask(()=>this.emit('error',new Error('synthetic listen failure')));return this;});
 try{
  await expect(startLocalServer({dataDir:await temporary()})).rejects.toThrow('synthetic listen failure');
  expect(stop).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 }finally{vi.restoreAllMocks();}
},30000);
