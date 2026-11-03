import { expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { startLocalServer } from '../../src/server/app.js';
import { runCli } from '../../src/cli.js';
import { temporary } from '../helpers.js';

it('finds public command text after CLI and API indexing without searching private command context', async () => {
 const base=await temporary(),dataDir=join(base,'data');
 const server=await startLocalServer({dataDir,autoRefresh:false});
 const headers={authorization:'Bearer '+server.token,'content-type':'application/json'};
 const call=async(path:string,body?:unknown)=>{
  const response=await fetch(server.origin+'/api/v1'+path,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  expect(response.ok).toBe(true);
  return response.json();
 };
 const source=async(label:string)=>{
  const root=join(base,label);await mkdir(root);
  const sessionId=label==='cli'?'00000000-0000-4000-8000-000000000000':'00000000-0000-4000-8000-000000000001';
  const timestamp='2026-11-03T00:00:00.000Z';
  const rows=[
   {type:'assistant',sessionId,timestamp,message:{content:[
    {type:'thinking',thinking:'private-reasoning-needle'},
    {type:'tool_use',name:'Bash',id:'command',input:{
     cwd:'/synthetic/private-cwd-needle',command:`npm run command-${label}-needle /synthetic/argument-path-needle 'Bearer ${'Q'.repeat(24)}'`,private:'private-input-needle',
    }},
   ]}},
   {type:'user',sessionId,timestamp,message:{content:[{type:'tool_result',tool_use_id:'command',content:`output-${label}-needle`,exit_code:0}]}},
  ];
  await writeFile(join(root,'private-log-locator-needle.jsonl'),rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  return (await call('/sources',{root,agent:'claude'})).data.id as string;
 };
 try{
  const cliId=await source('cli');
  let stdout='';
  const exit=await runCli(['index','--source',cliId,'--data-dir',dataDir],{cwd:()=>base,stdout:{write:text=>{stdout+=text;}},stderr:{write:()=>{}}});
  expect(exit).toBe(0);
  expect(JSON.parse(stdout).state).toBe('completed');
  const apiId=await source('api');
  const job=(await call('/index-jobs',{sourceIds:[apiId]})).data.jobId;
  await expect.poll(async()=>(await call('/index-jobs/'+job)).data.progress[0].state).toBe('completed');
  for (const label of ['cli','api']) {
   const command=(await call('/sessions?q=command-'+label+'-needle')).data;
   expect(command).toHaveLength(1);
   expect(command[0].matches[0]).toMatchObject({field:'event',text:expect.stringContaining('npm run command-'+label+'-needle')});
   expect((await call('/sessions?q=output-'+label+'-needle')).data).toHaveLength(1);
   expect(JSON.stringify(command)).not.toMatch(/private-cwd-needle|argument-path-needle|private-log-locator-needle|Bearer QQQ/);
  }
  for(const query of ['private-cwd-needle','argument-path-needle','private-log-locator-needle','private-input-needle','private-reasoning-needle','Q'.repeat(24)])
   expect((await call('/sessions?q='+encodeURIComponent(query))).data).toEqual([]);
 }finally{await server.close();}
});
