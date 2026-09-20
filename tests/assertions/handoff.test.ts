import { expect,it } from 'vitest';
import { fixture } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
const decision={kind:'decision' as const,topic:'storage',text:'Use A',scope:{workspaceId:null,path:null},confirmed:true};
it('blocks unresolved confirmations and compiles only the explicit replacement with candidates separated',async()=>{
 const f=await fixture();try{
  const ledger=f.store.assertionStore(),service=new HandoffService(f.store);const a=ledger.append(f.taskId,2,decision),b=ledger.append(f.taskId,3,{...decision,text:'Use B'});
  await expect(service.prepareHandoff(f.input)).rejects.toMatchObject({code:'ASSERTION_CONFLICT'});
  ledger.append(f.taskId,4,{...decision,text:'Use C',supersedes:[a.id,b.id]});ledger.append(f.taskId,5,{...decision,text:'Maybe D',confirmed:false});
  const h=await service.prepareHandoff(f.input);expect(h.capsule.decisions.map(d=>d.decision)).toEqual(['Use C']);expect(h.capsule.constraints).toContain('Do not publish');
  const body=JSON.parse(h.prompt.slice(h.prompt.indexOf('{')));expect(body.assertions.candidates[0].text).toBe('Maybe D');expect(h.capsule.decisions.map(d=>d.decision)).not.toContain('Maybe D');
  ledger.append(f.taskId,6,{...decision,topic:'other',text:'Another confirmed decision'});
  await expect(service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:true})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 }finally{f.store.close();}
});
it('does not apply another workspace scope and refuses uncertain confirmed applicability',async()=>{
 const f=await fixture();try{
  f.store.createWorkspace('other','p',f.root+'/other');const ledger=f.store.assertionStore(),service=new HandoffService(f.store);
  ledger.append(f.taskId,2,{...decision,scope:{workspaceId:'other',path:null}});
  expect((await service.prepareHandoff(f.input)).capsule.decisions).toEqual([]);
  ledger.append(f.taskId,3,{...decision,applicability:'unknown'});
  await expect(service.prepareHandoff(f.input)).rejects.toMatchObject({code:'ASSERTION_CONFLICT'});
 }finally{f.store.close();}
});
