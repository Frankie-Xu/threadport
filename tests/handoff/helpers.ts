import { realpath,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { project,temporary } from '../helpers.js';
import { openStore } from '../../src/storage/sqlite-store.js';
import { TaskService } from '../../src/tasks/service.js';
import { IndexService } from '../../src/indexing/service.js';
import { freezeLaunchPlan } from '../../src/targets/review.js';
import { recordDigest } from '../../src/storage/handoff-store.js';
import type { TaskHandoff } from '../../src/handoff/contracts.js';
import type { SqliteStore } from '../../src/storage/sqlite-store.js';
export async function authorizeTestPlan(store:SqliteStore,h:TaskHandoff){
 const record=store.handoffStore().read(h.id).record;
 const plan=await freezeLaunchPlan({executable:process.execPath,args:['--',h.prompt],cwd:record.workspace.canonicalRoot,input:{kind:'argv',value:h.prompt}},{agent:h.target,installed:true,version:'synthetic',auth:'unknown',nativeResume:true,newSessionWithContext:true,reason:null},h.id,recordDigest(record),h.expiresAt);
 store.handoffStore().authorizePlan(h.id,plan);return plan;
}
export async function fixture(agent:'claude'|'codex'='claude'){
 const dataDir=await temporary();const root=await realpath(await project());const logs=await temporary();
 const rows=agent==='claude'?[{type:'user',sessionId:'synthetic',message:{role:'user',content:'Please inspect the current task.'}}]:[{type:'session_meta',payload:{id:'11111111-1111-4111-8111-111111111111',cwd:root}},{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'Please inspect the current task.'}]}}];
 await writeFile(join(logs,'session.jsonl'),rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
 const store=await openStore({dataDir});store.createProject('p','Synthetic');store.createWorkspace('w','p',root);
 store.saveSource({id:'s',agent,roots:[logs],enabled:true,parserVersion:agent+'-jsonl-v1'});const index=new IndexService(store);await index.refresh('s');await index.stop();
 const session=store.listIndexedSessions('s')[0];store.bindSession(session.id,'p','w');
 const tasks=new TaskService(store);const task=await tasks.create({projectId:'p',title:'Task',sessionId:session.id});
 await tasks.update(task.id,1,{objective:'Implement the requested behavior',constraints:['Do not publish'],nextAction:'Review the tests'});
 return {store,root,dataDir,logs,tasks,taskId:task.id,input:{taskId:task.id,sourceSessionId:session.id,target:'codex' as const,mode:'new-session' as const,workspaceId:'w'}};
}
