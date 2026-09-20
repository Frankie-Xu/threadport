import { expect,it } from 'vitest';
import { fixture } from '../handoff/helpers.js';
import { startLocalServer } from '../../src/server/app.js';
it('authenticates ledger writes, rejects unknown fields and prevents stale transition mutations',async()=>{
 const f=await fixture();const server=await startLocalServer({dataDir:f.dataDir});
 try{
  const url=server.origin+'/api/v1/tasks/'+f.taskId+'/assertions';
  expect((await fetch(url)).status).toBe(401);
  const request=(body:unknown,suffix='')=>fetch(url+suffix,{method:'POST',headers:{authorization:'Bearer '+server.token,'content-type':'application/json'},body:JSON.stringify(body)});
  const assertion={kind:'decision',topic:'storage',text:'A',scope:{workspaceId:null,path:null},confirmed:false};
  expect((await request({expectedRevision:2,assertion:{...assertion,injected:true}})).status).toBe(400);
  const response=await request({expectedRevision:2,assertion});expect(response.status).toBe(201);const created=(await response.json()).data;
  expect((await request({expectedRevision:2,state:'confirmed'},'/'+created.id)).status).toBe(409);
  expect((await request({expectedRevision:3,state:'confirmed'},'/'+created.id)).status).toBe(200);
  const view=await fetch(url,{headers:{authorization:'Bearer '+server.token}}).then(r=>r.json());
  expect(view.data.taskRevision).toBe(4);expect(view.data.history.map((e:{state:string})=>e.state)).toEqual(['candidate','confirmed']);
 }finally{await server.close();f.store.close();}
});
