import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { fixture } from './helpers.js';
import { startLocalServer } from '../../src/server/app.js';
import { runCli } from '../../src/cli.js';
it('connects authenticated API prepare/get/confirm/export and CLI prepare without launching',async()=>{
 const f=await fixture();f.store.close();const server=await startLocalServer({dataDir:f.dataDir});try{
 const request=async(path:string,body?:unknown)=>fetch(server.origin+'/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${server.token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const capabilities=(await (await request('/targets')).json()).data;expect(capabilities).toHaveLength(2);expect(capabilities.every((item:{auth:string})=>item.auth==='unknown')).toBe(true);expect(JSON.stringify(capabilities)).not.toContain('executable');
 const response=await request('/handoffs',f.input);expect(response.status).toBe(201);const h=(await response.json()).data;
 expect((await (await request('/handoffs/'+h.id)).json()).data.state).toBe('prepared');
 expect((await (await request('/handoffs/'+h.id+'/confirm',{promptDigest:h.promptDigest,acknowledgeUncertainty:true})).json()).data.command).toBe(`threadport continue --handoff ${h.id}`);
 expect(await (await request('/handoffs/'+h.id+'/export',{format:'markdown'})).text()).toBe(h.prompt);
 expect((await request('/handoffs',{...f.input,command:'injected'})).status).toBe(400);
 let output='';let errors='';const io={stdout:{write:(value:string)=>{output+=value;}},stderr:{write:(value:string)=>{errors+=value;}},cwd:()=>f.root};
 expect(await runCli(['prepare','--task',f.taskId,'--source-session',f.input.sourceSessionId,'--to','codex','--workspace','w','--data-dir',f.dataDir],io)).toBe(0);expect(JSON.parse(output).prompt).toContain('Do not publish');expect(errors).toBe('');
 const capsulePath=join(f.dataDir,'prepared-capsule.json');await writeFile(capsulePath,JSON.stringify(h.capsule));output='';expect(await runCli(['verify',capsulePath,'--project',f.root,'--data-dir',f.dataDir,'--json'],io)).toBe(0);expect(JSON.parse(output).status).toBe('matched');
 expect(await runCli(['prepare','--task',f.taskId,'--yes'],io)).toBe(2);
 }finally{await server.close();}
},30000);
