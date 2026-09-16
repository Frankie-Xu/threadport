import { bindingSchema, limitSchema, snapshotSchema, workspaceInput, type CaptureOptions, type VerificationReasonCode, type VerificationReport, type WorkspaceBinding, type WorkspaceSnapshot } from './contracts.js';
import { captureWorkspace } from './snapshot.js';
const messages:Record<VerificationReasonCode,string>={
 HEAD_CHANGED:'The captured HEAD differs from the current HEAD.',
 CONTENT_CHANGED:'The tracked/index/untracked fingerprint changed at the same HEAD.',
 WORKSPACE_UNBOUND:'The snapshot does not match the explicitly bound workspace identity.',
 SOURCE_MISSING:'The bound workspace source is missing.',
 READ_FAILED:'The workspace could not be read safely and completely.',
 LIMIT_EXCEEDED:'Workspace capture exceeded its file, byte, output or time budget.',
 RACED:'The workspace changed during both capture attempts.',
 NO_GIT:'The bound workspace is not a readable Git repository.',
 NO_COMMIT:'The bound workspace has no readable HEAD commit.',
};
/** Compare recorded scope and identity before content; performs no filesystem operations. */
export function compareWorkspaceSnapshots(input:WorkspaceSnapshot, observed:WorkspaceSnapshot):VerificationReport{
 const snapshot=workspaceInput(snapshotSchema,input);
 const current=workspaceInput(snapshotSchema,observed);
 const codes=new Set<VerificationReasonCode>(snapshot.incompleteReasons);
 const report=(status:VerificationReport['status']):VerificationReport=>({
  status,snapshotId:snapshot.id,workspaceId:snapshot.workspaceId,verifiedAt:new Date().toISOString(),scope:snapshot.scope,
  reasons:[...codes].map(code=>({code,message:messages[code]})),
 });
 if(current.workspaceId!==snapshot.workspaceId){codes.add('WORKSPACE_UNBOUND');return report('unverifiable');}
 for(const reason of current.incompleteReasons)codes.add(reason);
 if(snapshot.bindingDigest!==null&&current.bindingDigest!==null&&snapshot.bindingDigest!==current.bindingDigest){
  codes.add('WORKSPACE_UNBOUND');return report('unverifiable');
 }
 // Incomplete captures cannot prove equivalence or attribute differences to this binding.
 if(codes.size)return report('unverifiable');
 // raw.v1 includes HEAD in its digest, so HEAD drift alone cannot prove file changes.
 if(snapshot.head!==current.head)codes.add('HEAD_CHANGED');
 else if(snapshot.digest!==current.digest)codes.add('CONTENT_CHANGED');
 return report(codes.size?'drifted':'matched');
}

/** Read-only comparison; it neither saves a new snapshot nor validates historical tests. */
export async function verifyWorkspace(input:WorkspaceSnapshot, binding:WorkspaceBinding|null, options:CaptureOptions={}):Promise<VerificationReport>{
 const snapshot=workspaceInput(snapshotSchema,input);
 workspaceInput(limitSchema,options.limits??{});
 options.signal?.throwIfAborted();
 const workspace=binding===null?null:workspaceInput(bindingSchema,binding);
 if(workspace===null||workspace.id!==snapshot.workspaceId){
  const codes=[...new Set<VerificationReasonCode>([...snapshot.incompleteReasons,'WORKSPACE_UNBOUND'])];
  return {status:'unverifiable',snapshotId:snapshot.id,workspaceId:snapshot.workspaceId,verifiedAt:new Date().toISOString(),scope:snapshot.scope,reasons:codes.map(code=>({code,message:messages[code]}))};
 }
 return compareWorkspaceSnapshots(snapshot,await captureWorkspace(workspace,options));
}
