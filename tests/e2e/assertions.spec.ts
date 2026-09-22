import { test,expect } from '@playwright/test';
import { mkdtemp,mkdir,writeFile,rm,realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startLocalServer } from '../../dist/src/server/app.js';
let server:Awaited<ReturnType<typeof startLocalServer>>,base:string,taskId:string,sessionId:string,workspaceId:string;
async function api(path:string,method='GET',body?:unknown){return fetch(server.origin+'/api/v1'+path,{method,headers:{authorization:'Bearer '+server.token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
async function data(path:string,method='GET',body?:unknown){const r=await api(path,method,body);expect(r.ok).toBe(true);return (await r.json()).data;}
test.beforeAll(async()=>{
 base=await realpath(await mkdtemp(join(tmpdir(),'threadport-assertions-')));const root=join(base,'project'),logs=join(base,'logs');await mkdir(root);await mkdir(logs);
 const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
 git('init','-b','main');await writeFile(join(root,'README.md'),'Synthetic');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture');
 await writeFile(join(logs,'session.jsonl'),JSON.stringify({type:'user',sessionId:'synthetic',message:{role:'user',content:'Keep all changes local.'}})+'\n');
 server=await startLocalServer({dataDir:join(base,'data')});const workspace=await data('/workspaces','POST',{root,confirmBinding:true});workspaceId=workspace.id;
 const source=await data('/sources','POST',{agent:'claude',root:logs}),job=await data('/index-jobs','POST',{sourceIds:[source.id]});
 await expect.poll(async()=>(await data('/index-jobs/'+job.jobId)).progress[0].state).toBe('completed');sessionId=(await data('/sessions/unassigned'))[0].id;
 taskId=(await data('/tasks','POST',{projectId:workspace.projectId,title:'Decide storage',sessionId})).id;
});
test.afterAll(async()=>{await server?.close();if(base)await rm(base,{recursive:true,force:true});});
test('retains a conflicting draft, resolves explicit replacement, and compiles only the effective decision',async({page})=>{
 await page.goto(server.origin+'/?v=inbox&t='+taskId+'#token='+server.token);
 await expect(page.getByRole('heading',{name:'Handoff visibility',exact:true})).toBeVisible();
 await expect(page.getByText('Responsible party is unknown; no confirmed responsibility edge is recorded.',{exact:true})).toBeVisible();
 const add=async(text:string)=>{
  await page.getByRole('button',{name:'Add decision or constraint',exact:true}).click();await page.getByLabel('Decision topic',{exact:true}).fill('storage');await page.getByLabel('Decision text',{exact:true}).fill(text);
  await page.getByLabel('I confirm this as a current decision or constraint').check();await page.getByRole('button',{name:'Save assertion',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 };
 await add('Use A');await add('Use B');await expect(page.getByRole('alert')).toContainText('Unresolved decisions');
 const prepare={taskId,sourceSessionId:sessionId,target:'codex',mode:'new-session',workspaceId};expect((await api('/handoffs','POST',prepare)).status).toBe(409);
 await page.getByRole('button',{name:'Replace “storage”',exact:true}).first().click();await page.getByLabel('Decision text',{exact:true}).fill('Use C');
 await page.getByLabel('Use A',{exact:true}).check();await page.getByLabel('Use B',{exact:true}).check();await page.getByLabel('I confirm this as a current decision or constraint').check();
 const task=(await data('/tasks/'+taskId)).task;await data('/tasks/'+taskId,'PATCH',{expectedRevision:task.revision,patch:{title:'Concurrent task edit'}});
 await page.getByRole('button',{name:'Save assertion',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');await expect(page.getByLabel('Decision text',{exact:true})).toHaveValue('Use C');
 await page.getByRole('button',{name:'Refresh baseline and keep draft'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);await expect(page.getByLabel('Decision text',{exact:true})).toHaveValue('Use C');
 await page.getByRole('button',{name:'Save assertion',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
 const response=await api('/handoffs','POST',prepare);expect(response.status).toBe(201);const result=await response.json();expect(result.data.capsule.decisions.map((d:{decision:string})=>d.decision)).toEqual(['Use C']);
 await page.getByText('Revision history (5)',{exact:true}).click();await expect(page.getByText('storage · superseded · revision 2: Use A',{exact:true})).toBeVisible();
 await page.screenshot({path:'output/playwright/assertions-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test('shows receipt stage, target, evidence and an unknown fact label',async({page})=>{
  const handoffId='ui-receipt-handoff',targetSessionId='ui-target-session',targetRunId='ui-target-run';
  const manifest=await data('/tasks/'+taskId+'/control/manifest','POST',{handoffId,taskRevision:1,targetSessionId,targetRunId});
  await data('/handoffs/'+handoffId+'/receipts','POST',{targetSessionId,targetRunId,manifestDigest:manifest.digest,stage:'received',nonce:'ui-receipt-nonce-123456',expiresAt:'2030-01-01T00:00:00.000Z'});
  await page.goto(server.origin+'/?v=inbox&t='+taskId+'#token='+server.token);
  await expect(page.getByRole('heading',{name:'Handoff visibility',exact:true})).toBeVisible();
  await expect(page.getByText(handoffId,{exact:true})).toBeVisible();
  await expect(page.getByText('unknown',{exact:true}).last()).toBeVisible();
  await expect(page.getByText('Stage: received · Status: pending',{exact:true})).toBeVisible();
  await expect(page.getByText('Target: '+targetSessionId+' / '+targetRunId,{exact:true})).toBeVisible();
  await expect(page.getByText('Evidence: none',{exact:true})).toBeVisible();
 });
