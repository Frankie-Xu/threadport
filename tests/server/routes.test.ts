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
 const invalid=await api('/workspaces','POST',{root,confirmBinding:false});expect(invalid.status).toBe(400);expect(invalid.body.error).toMatchObject({code:'INVALID_INPUT',retryable:false,recovery:'none'});
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
 const stale=await api('/tasks?limit=1&cursor='+first.body.nextCursor);expect(stale.status).toBe(409);expect(stale.body.error).toMatchObject({code:'SEARCH_STALE',retryable:true,recovery:'retry'});
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

it('paginates unassigned sessions independently of task history and invalidates attachment cursors',async()=>{
 const {api}=await setup();const root=await temporary();
 for(const id of ['one','two','three'])await writeFile(join(root,id+'.jsonl'),JSON.stringify({type:'user',sessionId:id,message:{role:'user',content:'Synthetic '+id}})+'\n');
 const source=await api('/sources','POST',{agent:'claude',root});const job=await api('/index-jobs','POST',{sourceIds:[source.body.data.id]});
 for(let i=0;i<100;i++){const state=(await api('/index-jobs/'+job.body.data.jobId)).body.data.progress[0].state;if(!['queued','running'].includes(state)){expect(state).toBe('completed');break;}await new Promise(resolve=>setTimeout(resolve,10));}
 const project=(await api('/workspaces','POST',{root:await temporary(),confirmBinding:true})).body.data.projectId;
 const first=await api('/sessions/unassigned?limit=1&projectId='+project);expect(first.body.data).toHaveLength(1);expect(first.body.data[0].projectId).toBeNull();expect(first.body.data[0].lastEventAt).toBeNull();expect(JSON.stringify(first.body)).not.toContain(root);
 const next=await api('/sessions/unassigned?limit=1&projectId='+project+'&cursor='+first.body.nextCursor);expect(next.body.data[0].id).not.toBe(first.body.data[0].id);
 const task=await api('/tasks','POST',{projectId:project,title:'Bound',sessionId:first.body.data[0].id});expect(task.status).toBe(201);
 expect((await api('/sessions/unassigned?limit=1&projectId='+project+'&cursor='+first.body.nextCursor)).status).toBe(409);
 expect((await api('/sessions/unassigned')).body.data).toHaveLength(2);
 expect((await api('/sessions/unassigned?cursor=invalid')).status).toBe(400);
 expect((await api('/sessions/unassigned?limit=101')).status).toBe(400);
},30000);
it('locates evidence by ID and exposes safe session capabilities and attention',async()=>{
 const {api}=await setup();const root=await temporary(),vendor='11111111-1111-7111-8111-111111111111';
 const lines=Array.from({length:25},(_,i)=>JSON.stringify({type:'user',sessionId:vendor,message:{role:'user',content:'Synthetic evidence '+i}}));lines.push(JSON.stringify({type:'assistant',sessionId:vendor,cwd:'/Users/private/project',message:{role:'assistant',content:[{type:'tool_use',id:'write',name:'Write',input:{file_path:'/Users/private/project/src/file.ts',content:'synthetic'}}]}}));await writeFile(join(root,'session.jsonl'),lines.join('\n')+'\n');
 const source=await api('/sources','POST',{agent:'claude',root}),job=await api('/index-jobs','POST',{sourceIds:[source.body.data.id]});
 for(let i=0;i<100;i++){const state=(await api('/index-jobs/'+job.body.data.jobId)).body.data.progress[0].state;if(!['queued','running'].includes(state))break;await new Promise(resolve=>setTimeout(resolve,10));}
 const sessions=(await api('/sessions/unassigned')).body.data;expect(sessions[0].status).toBe('ready');const sessionId=sessions[0].id,events=(await api('/sessions/'+sessionId+'/events')).body.data;
 const located=await api('/sessions/'+sessionId+'/events?eventId='+events[23].id+'&limit=1');expect(located.body.data[0].id).toBe(events[23].id);expect(located.body.nextCursor).toBeTruthy();expect((await api('/sessions/'+sessionId+'/events?limit=1&cursor='+located.body.nextCursor)).body.data[0].id).toBe(events[24].id);
 expect((await api('/sessions/'+sessionId+'/events?eventId=missing')).status).toBe(404);expect((await api('/sessions/'+sessionId+'/events?eventId='+events[23].id+'&cursor='+located.body.nextCursor)).status).toBe(400);
 const projectId=(await api('/workspaces','POST',{root:await temporary(),confirmBinding:true})).body.data.projectId;const task=(await api('/tasks','POST',{projectId,title:'Evidence',sessionId})).body.data;
 const detail=(await api('/tasks/'+task.id)).body.data;expect(detail.sessions[0]).toMatchObject({agent:'claude',status:'ready',nativeSessionAvailable:true});expect(detail.sessions[0]).not.toHaveProperty('vendorId');expect(JSON.stringify(detail)).not.toContain('/Users/private');expect(detail.files.items.length).toBeGreaterThan(0);expect((await api('/tasks')).body.data[0].attention).toContain('EVIDENCE_TIME_UNKNOWN');
},30000);
