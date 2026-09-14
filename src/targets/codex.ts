import { inspect,capability,type ProbeOptions } from './detect.js';
import { launchSpec,validateRunnerInput } from './prepare.js';
import type { RunnerInput,TargetRunner } from './contracts.js';
export class CodexRunner implements TargetRunner {
 readonly agent='codex' as const;
 constructor(private readonly options:ProbeOptions={}){}
 private async inspect(){const result=await inspect(this.agent,/^codex-cli (\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)$/,'0.154.0-alpha.6.2',this.options,['resume','--help']);const context=result.help.includes('Usage: codex [OPTIONS] [PROMPT]')&&result.help.includes('--cd <DIR>');const resume=result.extraHelp.includes('Usage: codex resume [OPTIONS] [SESSION_ID] [PROMPT]')&&result.extraHelp.includes('--cd <DIR>');return {result,capability:capability(this.agent,result,context,context&&resume)};}
 async detect(){return (await this.inspect()).capability;}
 async prepare(input:RunnerInput){const detected=await this.inspect();await validateRunnerInput(input,detected.capability);const args=input.handoff.mode==='native-resume'?['resume','--cd',input.workspaceRoot,'--',input.vendorSessionId!,input.handoff.prompt]:['--cd',input.workspaceRoot,'--',input.handoff.prompt];return launchSpec(detected.result.executable!,args,input,this.options.platform);}
}
