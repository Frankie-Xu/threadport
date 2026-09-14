import type { SqliteStore } from '../storage/sqlite-store.js';
import { DomainError } from '../domain/errors.js';
import { captureWorkspaceWithGit } from '../workspace/snapshot.js';
import { canonical,confirmSchema,type ConfirmInput } from './contracts.js';
export async function confirmHandoff(store:SqliteStore,input:ConfirmInput):Promise<{command:string}>{
 const parsed=confirmSchema.safeParse(input);if(!parsed.success)throw new DomainError('INVALID_INPUT','Invalid confirmation fields.');
 const args=parsed.data;const repository=store.handoffStore();const {record,state}=repository.read(args.id);repository.assertCurrent(record);const h=record.handoff;
 if(!['prepared','confirmed'].includes(state)||h.promptDigest!==args.promptDigest)throw new DomainError('REVISION_CONFLICT','Preview changed; prepare again.');
 if((h.verification.status!=='matched'||record.source.status==='partial'||h.claims.some(claim=>claim.origin==='unknown'))&&!args.acknowledgeUncertainty)throw new DomainError('INVALID_INPUT','Explicitly acknowledge the listed uncertainty.');
 const current=await captureWorkspaceWithGit(record.workspace);const before=record.reviewSnapshot;
 if(!current.git||current.snapshot.digest!==before.digest||current.snapshot.bindingDigest!==before.bindingDigest||current.snapshot.head!==before.head||current.git.branch!==h.capsule.git.branch)throw new DomainError('REVISION_CONFLICT','Workspace changed after review; prepare again.');
 // Canonical record comparison and task/source checks occur again inside an immediate transaction.
 if(canonical(repository.read(args.id).record.handoff)!==canonical(h))throw new DomainError('REVISION_CONFLICT','Preview changed; prepare again.');
 repository.confirm(record,args.acknowledgeUncertainty);return {command:`threadport continue --handoff ${h.id}`};
}
