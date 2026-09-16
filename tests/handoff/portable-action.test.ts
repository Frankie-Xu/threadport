import { expect,it } from 'vitest';
import { fixture } from './helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
it('requires a newly reviewed portable next action instead of forwarding an external command placeholder',async()=>{
 const f=await fixture();try{
  await f.tasks.update(f.taskId,2,{nextAction:'/private/toolchain/node --test tests/unit.test.js'});
  const service=new HandoffService(f.store);await expect(service.prepareHandoff(f.input)).rejects.toMatchObject({code:'NEXT_ACTION_REVIEW_REQUIRED'});
  await f.tasks.update(f.taskId,3,{nextAction:'node --test tests/unit.test.js'});const h=await service.prepareHandoff(f.input);expect(h.capsule.next_action).toBe('node --test tests/unit.test.js');
 }finally{f.store.close();}
});
