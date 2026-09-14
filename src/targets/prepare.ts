import { lstat,realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { validateExport } from '../handoff/export.js';
import type { LaunchSpec,RunnerInput,TargetCapability } from './contracts.js';
export async function validateRunnerInput(input:RunnerInput,target:TargetCapability):Promise<void>{
 const h=validateExport(input.handoff);
 if(h.target!==target.agent||Date.now()>=Date.parse(h.expiresAt))throw new DomainError('REVISION_CONFLICT','Target or preview expired; prepare again.');
 if(!target.installed||!(h.mode==='native-resume'?target.nativeResume:target.newSessionWithContext))throw new DomainError('INVALID_INPUT','Target capability is unverified; export context instead.');
 if(h.mode==='native-resume'&&(h.capsule.source_agent!==target.agent||!z.string().uuid().safeParse(input.vendorSessionId).success))throw new DomainError('INVALID_INPUT','Native resume requires a trusted same-agent session UUID.');
 if(!isAbsolute(input.workspaceRoot))throw new DomainError('INVALID_INPUT','A canonical workspace is required.');
 try{const info=await lstat(input.workspaceRoot);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(input.workspaceRoot)!==input.workspaceRoot)throw new Error();}catch{throw new DomainError('INVALID_INPUT','Workspace is unavailable or no longer canonical.');}
}
/** Conservative Windows command-line bound, including escaping and executable. Never fall back to a shell. */
export function launchSpec(executable:string,args:string[],input:RunnerInput,platform=process.platform):LaunchSpec{
 if([executable,...args,input.workspaceRoot].some(value=>value.includes('\0')))throw new DomainError('INVALID_INPUT','Invalid launch argument.');
 const encoded=[executable,...args].map(value=>'"'+value.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"').join(' ');
 if(platform==='win32'&&encoded.length>30000)throw new DomainError('INVALID_INPUT','Context exceeds the Windows argument budget; shorten the task or export it.');
 return {executable,args,cwd:input.workspaceRoot,input:{kind:'argv',value:input.handoff.prompt}};
}
