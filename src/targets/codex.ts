import { inspect,capability,declaresOption,declaresUsage,type ProbeOptions } from './detect.js';
import { launchSpec,validateRunnerInput } from './prepare.js';
import type { RunnerInput,TargetRunner } from './contracts.js';
export class CodexRunner implements TargetRunner {
 readonly agent='codex' as const;
 constructor(private readonly options:ProbeOptions={}){}
 private async inspect(){const result=await inspect(this.agent,/^codex-cli (\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)$/,['0.154.0-alpha.6.2','0.155.0-alpha.9','0.166.0-alpha.5.1'],this.options,['resume','--help']);const context=declaresUsage(result.help,'Usage: codex [OPTIONS] [PROMPT]')&&declaresOption(result.help,['-C, --cd <DIR>','--cd <DIR>']);const resume=declaresUsage(result.extraHelp,'Usage: codex resume [OPTIONS] [SESSION_ID] [PROMPT]')&&declaresOption(result.extraHelp,['-C, --cd <DIR>','--cd <DIR>']);return {result,capability:capability(this.agent,result,context,context&&resume)};}
 async detect(){return (await this.inspect()).capability;}
 async prepare(input:RunnerInput){const detected=await this.inspect();await validateRunnerInput(input,detected.capability);const args=input.handoff.mode==='native-resume'?['resume','--cd',input.workspaceRoot,'--',input.vendorSessionId!,input.handoff.prompt]:['--cd',input.workspaceRoot,'--',input.handoff.prompt];return launchSpec(detected.result.executable!,args,input,this.options.platform);}
}
