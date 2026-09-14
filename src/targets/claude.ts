import { inspect,capability,type ProbeOptions } from './detect.js';
import { launchSpec,validateRunnerInput } from './prepare.js';
import type { RunnerInput,TargetRunner } from './contracts.js';
export class ClaudeRunner implements TargetRunner {
 readonly agent='claude' as const;
 constructor(private readonly options:ProbeOptions={}){}
 private async inspect(){const result=await inspect(this.agent,/^(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?) \(Claude Code\)$/,'2.1.270',this.options);const context=result.help.includes('Usage: claude [options] [command] [prompt]');return {result,capability:capability(this.agent,result,context,context&&result.help.includes('--resume [value]'))};}
 async detect(){return (await this.inspect()).capability;}
 async prepare(input:RunnerInput){const detected=await this.inspect();await validateRunnerInput(input,detected.capability);const args=input.handoff.mode==='native-resume'?['--resume',input.vendorSessionId!,'--',input.handoff.prompt]:['--',input.handoff.prompt];return launchSpec(detected.result.executable!,args,input,this.options.platform);}
}
