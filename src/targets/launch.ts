import { isAbsolute } from 'node:path';
import { z } from 'zod';
import type { SqliteStore } from '../storage/sqlite-store.js';
import { recordDigest } from '../storage/handoff-store.js';
import { DomainError } from '../domain/errors.js';
import { confirmHandoff } from '../handoff/confirm.js';
import type { LaunchSpec,TargetRunner } from './contracts.js';
import type { ProcessResult } from '../platform/process.js';
export interface TerminalPort {isTTY:boolean;write(text:string):void;confirm():Promise<boolean>;run(spec:LaunchSpec):Promise<ProcessResult>}
export async function continueHandoff(store:SqliteStore,id:string,terminal:TerminalPort,runner:TargetRunner):Promise<number>{
 if(!terminal.isTTY||!z.string().uuid().safeParse(id).success)throw new DomainError('INVALID_INPUT','An interactive terminal and handoff UUID are required.');
 const repository=store.handoffStore();const launches=store.launchStore();launches.reconcile(id);const {record,state}=repository.read(id);repository.assertCurrent(record);const h=record.handoff;
 if(!['prepared','confirmed'].includes(state))throw new DomainError('REVISION_CONFLICT','This handoff has already been consumed. Prepare a new one.');
 if(runner.agent!==h.target||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(h.prompt))throw new DomainError('INVALID_INPUT','Invalid terminal preview.');
 const capability=await runner.detect();if(!capability.installed||!(h.mode==='native-resume'?capability.nativeResume:capability.newSessionWithContext))throw new DomainError('TARGET_UNSUPPORTED','Target unavailable or unverified; export instead.');
 const digest=recordDigest(record);
 terminal.write('ThreadPort continuation review\n'+JSON.stringify({handoffId:id,target:h.target,version:capability.version,workspace:record.workspace.canonicalRoot,verification:h.verification.status,expiresAt:h.expiresAt},null,2)+'\n\n'+h.prompt+'\nType CONTINUE to send this complete context and accept the listed uncertainty. Any other response cancels.\n');
 if(!await terminal.confirm()){launches.cancel(id,digest);return 130;}
 if(recordDigest(repository.read(id).record)!==digest)throw new DomainError('REVISION_CONFLICT','Preview changed during terminal review.');
 const spec=await runner.prepare({handoff:h,workspaceRoot:record.workspace.canonicalRoot,vendorSessionId:record.source.vendorSessionId});
 if(!isAbsolute(spec.executable)||spec.cwd!==record.workspace.canonicalRoot||spec.input.kind!=='argv'||spec.input.value!==h.prompt||spec.args.filter(arg=>arg===h.prompt).length!==1)throw new DomainError('INVALID_INPUT','Runner did not preserve the reviewed context.');
 // Probe construction can take time: reverify after it and immediately before the atomic claim.
 await confirmHandoff(store,{id,promptDigest:h.promptDigest,acknowledgeUncertainty:true});
 const attemptId=launches.claim(id,digest);let result:ProcessResult;
 try{result=await terminal.run(spec);}catch{result={status:'failed',exitCode:5,errorCode:'SPAWN_FAILED'};}
 launches.finish(id,attemptId,result);
 if(result.status==='failed')throw new DomainError(result.errorCode?.startsWith('TARGET_EXIT_')?'TARGET_EXITED':'IO_FAILED','The target process failed; inspect the recorded attempt.');
 if(result.status==='interrupted')throw new DomainError('IO_FAILED','The target process was interrupted; prepare a new handoff.');
 return result.status==='cancelled'?130:0;
}
