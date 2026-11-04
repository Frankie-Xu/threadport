import { inspect,capability,declaresOption,declaresUsage,type ProbeOptions } from './detect.js';
import { launchSpec,validateRunnerInput } from './prepare.js';
import type { RunnerInput,TargetRunner } from './contracts.js';
export class ClaudeRunner implements TargetRunner {
 readonly agent='claude' as const;
 constructor(private readonly options:ProbeOptions={}){}
 private async inspect(){const result=await inspect(this.agent,/^(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?) \(Claude Code\)$/,['2.1.270','2.1.312'],this.options);const context=declaresUsage(result.help,'Usage: claude [options] [command] [prompt]');return {result,capability:capability(this.agent,result,context,context&&declaresOption(result.help,['-r, --resume [value]','--resume [value]']))};}
 async detect(){return (await this.inspect()).capability;}
 async prepare(input:RunnerInput){const detected=await this.inspect();await validateRunnerInput(input,detected.capability);const args=input.handoff.mode==='native-resume'?['--resume',input.vendorSessionId!,'--',input.handoff.prompt]:['--',input.handoff.prompt];return launchSpec(detected.result.executable!,args,input,this.options.platform);}
}
