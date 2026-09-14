import { realpath,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { project,temporary } from '../helpers.js';
import { openStore } from '../../src/storage/sqlite-store.js';
import { TaskService } from '../../src/tasks/service.js';
import { IndexService } from '../../src/indexing/service.js';
export async function fixture(){
 const dataDir=await temporary();const root=await realpath(await project());const logs=await temporary();
 await writeFile(join(logs,'session.jsonl'),JSON.stringify({type:'user',sessionId:'synthetic',message:{role:'user',content:'Please inspect the current task.'}})+'\n');
 const store=await openStore({dataDir});store.createProject('p','Synthetic');store.createWorkspace('w','p',root);
 store.saveSource({id:'s',agent:'claude',roots:[logs],enabled:true,parserVersion:'claude-jsonl-v1'});const index=new IndexService(store);await index.refresh('s');await index.stop();
 const session=store.listIndexedSessions('s')[0];store.bindSession(session.id,'p','w');
 const tasks=new TaskService(store);const task=await tasks.create({projectId:'p',title:'Task',sessionId:session.id});
 await tasks.update(task.id,1,{objective:'Implement the requested behavior',constraints:['Do not publish'],nextAction:'Review the tests'});
 return {store,root,dataDir,logs,tasks,taskId:task.id,input:{taskId:task.id,sourceSessionId:session.id,target:'codex' as const,mode:'new-session' as const,workspaceId:'w'}};
}
