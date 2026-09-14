import { expect,it } from 'vitest';
import { chmod,writeFile,mkdir,rename,realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { temporary } from '../helpers.js';
import { fixture } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { ClaudeRunner } from '../../src/targets/claude.js';
import { CodexRunner } from '../../src/targets/codex.js';
const help={claude:'Usage: claude [options] [command] [prompt]\n  -r, --resume [value] Resume a conversation',codex:'Usage: codex [OPTIONS] [PROMPT]\n -C, --cd <DIR>',resume:'Usage: codex resume [OPTIONS] [SESSION_ID] [PROMPT]\n -C, --cd <DIR>'};
async function options(agent:'claude'|'codex',version?:string){const root=join(await temporary(),'CLI tools');await mkdir(root);const executable=join(root,agent+(process.platform==='win32'?'.exe':''));await writeFile(executable,'synthetic probe only');await chmod(executable,0o700);const calls:string[][]=[];return{calls,executable,options:{path:root,probe:async(file:string,args:string[])=>{expect(file).toBe(executable);calls.push(args);return args[0]==='--version'?(version??(agent==='claude'?'2.1.270 (Claude Code)':'codex-cli 0.154.0-alpha.6.2')):args[0]==='resume'?help.resume:help[agent];}}};}
it('detects independent exact-version capabilities without claiming authentication',async()=>{
 const claude=await options('claude');const codex=await options('codex');
 expect(await new ClaudeRunner(claude.options).detect()).toMatchObject({installed:true,auth:'unknown',nativeResume:true,newSessionWithContext:true});
 expect(await new CodexRunner(codex.options).detect()).toMatchObject({installed:true,auth:'unknown',nativeResume:true,newSessionWithContext:true});expect(codex.calls).toContainEqual(['resume','--help']);
 const unknown=await options('codex','codex-cli 999.0.0');expect(await new CodexRunner(unknown.options).detect()).toMatchObject({installed:true,version:'999.0.0',nativeResume:false,newSessionWithContext:false});
 expect(await new ClaudeRunner({path:await temporary()}).detect()).toMatchObject({installed:false,auth:'unknown',nativeResume:false});
});
it('keeps complete context in one argv value and combines native session with current context',async()=>{
 const f=await fixture();try{const h=await new HandoffService(f.store).prepareHandoff(f.input);const c=await options('codex');const runner=new CodexRunner(c.options);const spec=await runner.prepare({handoff:h,workspaceRoot:f.root,vendorSessionId:null});
 expect(spec).toEqual({executable:c.executable,args:['--cd',f.root,'--',h.prompt],cwd:f.root,input:{kind:'argv',value:h.prompt}});
 const native=await new HandoffService(f.store).prepareHandoff({...f.input,target:'claude',mode:'native-resume'});const a=await options('claude');const resumed=await new ClaudeRunner(a.options).prepare({handoff:native,workspaceRoot:f.root,vendorSessionId:'11111111-1111-4111-8111-111111111111'});
 expect(resumed.args).toEqual(['--resume','11111111-1111-4111-8111-111111111111','--',native.prompt]);expect(resumed.input).toEqual({kind:'argv',value:native.prompt});
 await expect(new ClaudeRunner(a.options).prepare({handoff:native,workspaceRoot:f.root,vendorSessionId:'--dangerous'})).rejects.toThrow();
 }finally{f.store.close();}
},30000);
it('degrades safely on probe failures, changed help and Windows command wrappers',async()=>{
 const c=await options('codex');const failed=new CodexRunner({...c.options,probe:async()=>{throw new Error('/private/executable failed');}});expect(await failed.detect()).toMatchObject({reason:'probe_failed',nativeResume:false});
 const changed=new CodexRunner({...c.options,probe:async(_file,args)=>args[0]==='--version'?'codex-cli 0.154.0-alpha.6.2':'unsupported interface'});expect(await changed.detect()).toMatchObject({reason:'unverified_help',newSessionWithContext:false});
 const directory=await temporary();await writeFile(join(directory,'codex.cmd'),'do not execute');let called=false;
 expect(await new CodexRunner({path:directory,platform:'win32',pathExt:'.CMD',probe:async()=>{called=true;return '';}}).detect()).toMatchObject({installed:true,reason:'unsupported_executable',nativeResume:false});expect(called).toBe(false);
});
it('passes malicious-looking context literally through a real child argv without shell evaluation',async()=>{
 const f=await fixture();try{const moved=join(await realpath(await temporary()),'workspace with spaces');await rename(f.root,moved);const {default:Database}=await import('better-sqlite3');const db=new Database(join(f.dataDir,'threadport.sqlite'));try{db.prepare('UPDATE workspaces SET canonical_root=? WHERE id=?').run(moved,'w');}finally{db.close();}f.root=moved;await f.tasks.update(f.taskId,2,{nextAction:'echo $(touch injected); `touch injected` & keep this as evidence'});const h=await new HandoffService(f.store).prepareHandoff(f.input);const c=await options('codex');const spec=await new CodexRunner(c.options).prepare({handoff:h,workspaceRoot:f.root,vendorSessionId:null});
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const output=await promisify(execFile)(process.execPath,['-e','process.stdout.write(JSON.stringify(process.argv.slice(1)))','--',...spec.args],{cwd:spec.cwd,shell:false});expect(JSON.parse(output.stdout)).toEqual(spec.args);
 const {access}=await import('node:fs/promises');await expect(access(join(f.root,'injected'))).rejects.toThrow();
 }finally{f.store.close();}
},30000);
it('enforces the Windows argv budget before returning a launch specification',async()=>{
 const f=await fixture();try{const h=await new HandoffService(f.store).prepareHandoff(f.input);const {launchSpec}=await import('../../src/targets/prepare.js');
 expect(()=>launchSpec('C:\\Program Files\\Codex\\codex.exe',['x'.repeat(32000)],{handoff:h,workspaceRoot:f.root,vendorSessionId:null},'win32')).toThrow();
 expect(()=>launchSpec('C:\\Program Files\\Codex\\codex.exe',['--',h.prompt],{handoff:h,workspaceRoot:f.root,vendorSessionId:null},'win32')).not.toThrow();
 }finally{f.store.close();}
},30000);
it('also constructs Codex native resume and Claude new-session with complete current context',async()=>{
 const f=await fixture('codex');try{const service=new HandoffService(f.store);const native=await service.prepareHandoff({...f.input,mode:'native-resume'});const c=await options('codex');const sessionId=f.store.handoffStore().source(f.input.sourceSessionId)!.vendorSessionId;
 const spec=await new CodexRunner(c.options).prepare({handoff:native,workspaceRoot:f.root,vendorSessionId:sessionId});expect(spec.args).toEqual(['resume','--cd',f.root,'--',sessionId,native.prompt]);
 const fresh=await service.prepareHandoff({...f.input,target:'claude'});const a=await options('claude');expect((await new ClaudeRunner(a.options).prepare({handoff:fresh,workspaceRoot:f.root,vendorSessionId:null})).args).toEqual(['--',fresh.prompt]);
 }finally{f.store.close();}
},30000);
