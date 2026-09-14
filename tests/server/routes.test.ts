import { afterEach,expect,it } from 'vitest';
import { writeFile,readFile,realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { startLocalServer } from '../../src/server/app.js';
import { openStore } from '../../src/storage/sqlite-store.js';
import { temporary,project } from '../helpers.js';
const servers:{close():Promise<void>}[]=[];afterEach(async()=>{for(const server of servers.splice(0))await server.close();});
async function setup(){const dataDir=await temporary();const server=await startLocalServer({dataDir});servers.push(server);return{dataDir,server,async api(path:string,method='GET',body?:unknown){const response=await fetch(server.origin+'/api/v1'+path,{method,headers:{authorization:`Bearer ${server.token}`,...(method!=='GET'?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,body:await response.json()};}};}
it('creates explicit bindings and tasks with conflict-safe editing, filtering and strict inputs',async()=>{
 const {api}=await setup();const root=await project();
 expect((await api('/workspaces','POST',{root,confirmBinding:false})).status).toBe(400);
 const workspace=await api('/workspaces','POST',{root,confirmBinding:true});expect(workspace.status).toBe(201);
 const task=await api('/tasks','POST',{projectId:workspace.body.data.projectId,title:'Manual task'});expect(task.status).toBe(201);
 const id=task.body.data.id;
 expect((await api('/tasks/'+id,'PATCH',{expectedRevision:1,patch:{objective:'Manual objective'}})).body.data.revision).toBe(2);
 expect((await api('/tasks/'+id,'PATCH',{expectedRevision:1,patch:{title:'stale'}})).status).toBe(409);
 expect((await api('/tasks/'+id,'PATCH',{expectedRevision:2,patch:{injected:true}})).status).toBe(400);
 expect((await api('/tasks?q=Manual')).body.data).toHaveLength(1);
 expect((await api('/tasks/'+id)).body.data.task.objective.text).toBe('Manual objective');
 expect((await api('/projects')).body.data).toHaveLength(1);
 expect((await api('/workspaces')).body.data[0].canonicalRoot).toBe(await realpath(root));
 expect((await api('/tasks/'+id,'PATCH',{expectedRevision:2,patch:{title:'sk-proj-'+ 'a'.repeat(40)}})).status).toBe(422);
},30000);
it('indexes selected sources, returns safe events and revokes without touching logs or manual tasks',async()=>{
 const {api,dataDir}=await setup();const root=await temporary();const path=join(root,'session.jsonl');
 const text=JSON.stringify({type:'user',sessionId:'synthetic',message:{role:'user',content:'Read /Users/private/project/file.ts'}})+'\n';await writeFile(path,text);
 const source=await api('/sources','POST',{agent:'claude',root});expect(source.status).toBe(201);
 const job=await api('/index-jobs','POST',{sourceIds:[source.body.data.id]});expect(job.status).toBe(202);
 let progress;
 for(let i=0;i<100;i++){progress=await api('/index-jobs/'+job.body.data.jobId);if(!['queued','running'].includes(progress.body.data.progress[0].state))break;await new Promise(resolve=>setTimeout(resolve,10));}
 expect(progress?.body.data.progress[0].state).toBe('completed');
 const found=await api('/sessions?q=Read');expect(found.status).toBe(200);expect(found.body.data.length).toBeGreaterThan(0);expect(JSON.stringify(found.body)).not.toContain('/Users/private');
 const sessionId=found.body.data[0].sessionId;const events=await api('/sessions/'+encodeURIComponent(sessionId)+'/events');expect(events.body.data).toHaveLength(1);expect(JSON.stringify(events.body)).not.toContain('/Users/private');
 const store=await openStore({dataDir});store.createProject('manual','Manual');store.close();
 const task=await api('/tasks','POST',{projectId:'manual',title:'Keep task',sessionId});expect(task.status).toBe(201);
 expect((await api('/sources/'+source.body.data.id,'DELETE',{confirmation:false})).status).toBe(400);
 expect((await api('/sources/'+source.body.data.id,'DELETE',{confirmation:true})).status).toBe(200);
 expect((await api('/tasks/'+task.body.data.id)).body.data.task.title).toBe('Keep task');
 expect(await readFile(path,'utf8')).toBe(text);
 const restored=await api('/sources','POST',{agent:'claude',root});expect(restored.body.data.id).toBe(source.body.data.id);
},30000);
it('validates task pagination and cancels jobs using a bodyless authenticated DELETE',async()=>{
 const {api}=await setup();const workspace=await api('/workspaces','POST',{root:await project(),confirmBinding:true});
 for(const title of ['One','Two'])await api('/tasks','POST',{projectId:workspace.body.data.projectId,title});
 const first=await api('/tasks?limit=1');expect(first.body.nextCursor).toBeTruthy();
 expect((await api('/tasks?limit=1&cursor='+first.body.nextCursor)).body.data).toHaveLength(1);
 await api('/tasks','POST',{projectId:workspace.body.data.projectId,title:'Three'});
 expect((await api('/tasks?limit=1&cursor='+first.body.nextCursor)).status).toBe(409);
 const source=await api('/sources','POST',{agent:'claude',root:await temporary()});
 const job=await api('/index-jobs','POST',{sourceIds:[source.body.data.id]});
 expect((await api('/index-jobs/'+job.body.data.jobId,'DELETE')).status).toBe(200);
},30000);
it('keeps session ownership and revision checks atomic across task links',async()=>{
 const {api,dataDir}=await setup();const store=await openStore({dataDir});store.createProject('p','Project');store.createProject('other','Other');store.saveSession('session');store.bindSession('session','p',null);store.close();
 const one=(await api('/tasks','POST',{projectId:'p',title:'One'})).body.data;
 const two=(await api('/tasks','POST',{projectId:'p',title:'Two'})).body.data;
 const other=(await api('/tasks','POST',{projectId:'other',title:'Other'})).body.data;
 expect((await api('/tasks/'+other.id+'/sessions','POST',{sessionId:'session',expectedRevision:1})).status).toBe(409);
 expect((await api('/tasks/'+one.id+'/sessions','POST',{sessionId:'session',expectedRevision:1})).status).toBe(200);
 expect((await api('/tasks/'+two.id+'/sessions','POST',{sessionId:'session',expectedRevision:1})).status).toBe(409);
 expect((await api('/tasks/'+one.id+'/sessions/session','DELETE',{expectedRevision:2})).status).toBe(200);
 expect((await api('/tasks/'+two.id+'/sessions','POST',{sessionId:'session',expectedRevision:1})).status).toBe(200);
},30000);
