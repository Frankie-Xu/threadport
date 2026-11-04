import { chmod, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CodexRunner } from '../../src/targets/codex.js';
import { inspect } from '../../src/targets/detect.js';
import { ClaudeRunner } from '../../src/targets/claude.js';

it('keeps repeated version probes independent of the caller RegExp lastIndex',async()=>{
 const root=await fakeCodexRoot();const pattern=/codex-cli (\S+)/g;pattern.lastIndex=42;
 try{
  for(let attempt=0;attempt<2;attempt++){
   const result=await inspect('codex',pattern,'0.155.0-alpha.9',{path:root,probe:probe('0.155.0-alpha.9')});
   expect(result).toMatchObject({installed:true,version:'0.155.0-alpha.9',reason:null});
   expect(pattern.lastIndex).toBe(42);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

const HELP = 'Usage: codex [OPTIONS] [PROMPT]\nOptions:\n  --cd <DIR>\n';
const RESUME_HELP = 'Usage: codex resume [OPTIONS] [SESSION_ID] [PROMPT]\nOptions:\n  --cd <DIR>\n';

async function fakeCodexRoot(agent='codex') {
  const root = await mkdtemp(join(tmpdir(), 'threadport-target-detect-'));
  const executable = join(root, agent + (process.platform === 'win32' ? '.exe' : ''));
  await writeFile(executable, 'synthetic executable');
  await chmod(executable, 0o755);
  return root;
}

function probe(version: string) {
  return async (_executable: string, args: string[]) => {
    if (args[0] === '--version') return `codex-cli ${version}\n`;
    if (args[0] === 'resume') return RESUME_HELP;
    return HELP;
  };
}

it('accepts the current Codex 0.155 interface and native resume help', async () => {
  const root = await fakeCodexRoot();
  const capability = await new CodexRunner({ path: root, probe: probe('0.155.0-alpha.9') }).detect();
  expect(capability).toMatchObject({
    installed: true,
    version: '0.155.0-alpha.9',
    newSessionWithContext: true,
    nativeResume: true,
    reason: null,
  });
});

it('keeps an unknown Codex version unverified even when its executable exists', async () => {
  const root = await fakeCodexRoot();
  const capability = await new CodexRunner({ path: root, probe: probe('0.156.0-alpha.1') }).detect();
  expect(capability).toMatchObject({ installed: true, version: '0.156.0-alpha.1', reason: 'unverified_version' });
  expect(capability.newSessionWithContext).toBe(false);
  expect(capability.nativeResume).toBe(false);
});

async function currentInterface(agent:'claude'|'codex') {
  const version=agent==='claude'?'2.1.312':'0.166.0-alpha.5.1';
  const root=new URL(`../fixtures/targets/interfaces/${agent}-${version}/`,import.meta.url);
  return {version:await readFile(new URL('version.txt',root),'utf8'),help:await readFile(new URL('help.txt',root),'utf8'),
    resume:agent==='codex'?await readFile(new URL('resume-help.txt',root),'utf8'):''};
}

it.each(['claude','codex'] as const)('accepts only fixed read-only probes for the captured current %s interface',async agent=>{
 const root=await fakeCodexRoot(agent);const observed=await currentInterface(agent);const calls:string[][]=[];
 try{
  const options={path:root,probe:async(_file:string,args:string[])=>{calls.push(args);return args[0]==='--version'?observed.version:args[0]==='resume'?observed.resume:observed.help;}};
  const result=await (agent==='claude'?new ClaudeRunner(options):new CodexRunner(options)).detect();
  expect(result).toMatchObject({installed:true,auth:'unknown',version:agent==='claude'?'2.1.312':'0.166.0-alpha.5.1',newSessionWithContext:true,nativeResume:true,reason:null});
  expect(calls).toEqual(agent==='claude'?[['--version'],['--help']]:[['--version'],['--help'],['resume','--help']]);
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each([
 ['claude','2.1.313 (Claude Code)'],['claude','2.1.312+modified (Claude Code)'],
 ['codex','codex-cli 0.166.0-alpha.5.2'],['codex','codex-cli 0.166.0-alpha.5.1+modified'],
] as const)('keeps unverified %s version %s export-only without probing its help',async(agent,version)=>{
 const root=await fakeCodexRoot(agent);const calls:string[][]=[];
 try{
  const options={path:root,probe:async(_file:string,args:string[])=>{calls.push(args);return version;}};
  const result=await (agent==='claude'?new ClaudeRunner(options):new CodexRunner(options)).detect();
  expect(result).toMatchObject({installed:true,auth:'unknown',newSessionWithContext:false,nativeResume:false,reason:'unverified_version'});
  expect(calls).toEqual([['--version']]);
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each([
 ['missing-dir-value','  --cd'],['similar-flag','  --cd-extra <DIR>'],['wrong-case','  --CD <DIR>'],
 ['wrong-placeholder','  --cd <dir>'],['prose-only','  --other <X>  Mention --cd <DIR> here'],
 ['wrapped-description','                                        --cd <DIR>'],
 ['outside-options','\nExamples:\n  --cd <DIR>'],
] as const)('does not mistake %s for the required Codex directory declaration',async(_label,declaration)=>{
 const root=await fakeCodexRoot();const observed=await currentInterface('codex');
 try{
  const result=await new CodexRunner({path:root,probe:async(_file,args)=>args[0]==='--version'?observed.version:args[0]==='resume'?observed.resume:observed.help.replace('  -C, --cd <DIR>',declaration)}).detect();
  expect(result).toMatchObject({newSessionWithContext:false,nativeResume:false,reason:'unverified_help'});
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each([
 ['top-prompt','Usage: codex [OPTIONS]'],['top-case','Usage: CODEX [OPTIONS] [PROMPT]'],
 ['quoted-usage','Example: Usage: codex [OPTIONS] [PROMPT]'],
] as const)('rejects changed %s usage even when the original usage appears in prose',async(_label,usage)=>{
 const root=await fakeCodexRoot();const observed=await currentInterface('codex');
 try{
  const changed=observed.help.replace('Usage: codex [OPTIONS] [PROMPT]',usage)+'\n  Mention Usage: codex [OPTIONS] [PROMPT]\n';
  const result=await new CodexRunner({path:root,probe:async(_file,args)=>args[0]==='--version'?observed.version:args[0]==='resume'?observed.resume:changed}).detect();
  expect(result).toMatchObject({newSessionWithContext:false,nativeResume:false,reason:'unverified_help'});
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(['missing-session','missing-prompt','exec-resume','missing-cd'] as const)('degrades only native resume for Codex %s help',async change=>{
 const root=await fakeCodexRoot();const observed=await currentInterface('codex');
 const resume=change==='missing-session'?observed.resume.replace(' [SESSION_ID]',''):change==='missing-prompt'?observed.resume.replace(' [PROMPT]','')
  :change==='exec-resume'?observed.resume.replace('codex resume','codex exec resume'):observed.resume.replace('  -C, --cd <DIR>','  --cd-extra <DIR>');
 try{
  const result=await new CodexRunner({path:root,probe:async(_file,args)=>args[0]==='--version'?observed.version:args[0]==='resume'?resume:observed.help}).detect();
  expect(result).toMatchObject({newSessionWithContext:true,nativeResume:false,reason:'native_resume_unverified',auth:'unknown'});
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(['  --resume-extra [value]','  --Resume [value]','  --resume','  --other  Mention --resume [value] here'])(
 'does not mistake Claude declaration %s for native resume',async declaration=>{
 const root=await fakeCodexRoot('claude');const observed=await currentInterface('claude');
 try{
  const result=await new ClaudeRunner({path:root,probe:async(_file,args)=>args[0]==='--version'?observed.version:observed.help.replace(/  -r, --resume.*$/m,declaration)}).detect();
  expect(result).toMatchObject({newSessionWithContext:true,nativeResume:false,reason:'native_resume_unverified'});
 }finally{await rm(root,{recursive:true,force:true});}
});

it('rejects a Claude usage that lost the positional prompt',async()=>{
 const root=await fakeCodexRoot('claude');const observed=await currentInterface('claude');
 try{
  const result=await new ClaudeRunner({path:root,probe:async(_file,args)=>args[0]==='--version'?observed.version:observed.help.replace(' [prompt]','')}).detect();
  expect(result).toMatchObject({newSessionWithContext:false,nativeResume:false,reason:'unverified_help'});
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(['claude','codex'] as const)('accepts CRLF help for verified %s without relaxing token matching',async agent=>{
 const root=await fakeCodexRoot(agent);const observed=await currentInterface(agent);
 try{
  const options={path:root,probe:async(_file:string,args:string[])=>(args[0]==='--version'?observed.version:args[0]==='resume'?observed.resume:observed.help).replace(/\n/g,'\r\n')};
  expect(await (agent==='claude'?new ClaudeRunner(options):new CodexRunner(options)).detect()).toMatchObject({newSessionWithContext:true,nativeResume:true,auth:'unknown'});
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(['--version','--help','resume'] as const)('maps %s probe errors and timeouts to constant reasons',async failing=>{
 const root=await fakeCodexRoot();const observed=await currentInterface('codex');
 try{
  const result=await new CodexRunner({path:root,probe:async(_file,args)=>{if(args[0]===failing)throw Object.assign(new Error('synthetic-private-probe-path'),{code:'ETIMEDOUT'});return args[0]==='--version'?observed.version:args[0]==='resume'?observed.resume:observed.help;}}).detect();
  expect(result).toMatchObject({installed:true,auth:'unknown',newSessionWithContext:false,nativeResume:false,reason:'probe_failed'});
  expect(JSON.stringify(result)).not.toContain('synthetic-private-probe-path');
 }finally{await rm(root,{recursive:true,force:true});}
});

it('enforces the 256 KiB byte budget on help, including multi-byte text',async()=>{
 const root=await fakeCodexRoot();const observed=await currentInterface('codex');
 try{
  const result=await new CodexRunner({path:root,probe:async(_file,args)=>args[0]==='--version'?observed.version:observed.help+'汉'.repeat(90_000)}).detect();
  expect(result).toMatchObject({reason:'probe_failed',newSessionWithContext:false,nativeResume:false});
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(['claude','codex'] as const)('rejects ambiguous %s Options blocks containing a quoted example',async agent=>{
 const root=await fakeCodexRoot(agent);const observed=await currentInterface(agent);
 const usage=observed.help.split('\n')[0]!;
 const flag=agent==='claude'?'--resume [value]':'--cd <DIR>';
 const help=usage+'\n\nExample:\nOptions:\n  '+flag+'  Quoted example only.\n\nOptions:\n  --model <MODEL>  Actual options do not declare this flag.\n';
 try{
  const options={path:root,probe:async(_file:string,args:string[])=>args[0]==='--version'?observed.version:args[0]==='resume'?observed.resume:help};
  expect(await (agent==='claude'?new ClaudeRunner(options):new CodexRunner(options)).detect()).toMatchObject({
   newSessionWithContext:agent==='claude',nativeResume:false,reason:agent==='claude'?'native_resume_unverified':'unverified_help'});
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(['claude','codex'] as const)('rejects a lone %s declaration inside an example or code fence',async agent=>{
 const root=await fakeCodexRoot(agent);const observed=await currentInterface(agent);
 const usage=observed.help.split('\n')[0]!;const flag=agent==='claude'?'--resume [value]':'--cd <DIR>';
 try{
  for(const prefix of ['Example:\n','Examples:\n','```text\n']){
   const options={path:root,probe:async(_file:string,args:string[])=>args[0]==='--version'?observed.version:args[0]==='resume'?observed.resume:usage+'\n\n'+prefix+'Options:\n  '+flag+'\n'};
   const result=await (agent==='claude'?new ClaudeRunner(options):new CodexRunner(options)).detect();
   const context=agent==='claude'&&!prefix.startsWith('```');
   expect(result).toMatchObject({nativeResume:false,newSessionWithContext:context,reason:context?'native_resume_unverified':'unverified_help'});
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(['claude','codex'] as const)('does not infer %s prompt support from usage quoted as an example',async agent=>{
 const root=await fakeCodexRoot(agent);const observed=await currentInterface(agent);
 try{
  for(const prefix of ['Example:\n','Example: quoted output\n','```text\n','    > quoted\n']){
   const options={path:root,probe:async(_file:string,args:string[])=>args[0]==='--version'?observed.version:args[0]==='resume'?observed.resume:prefix+observed.help};
   expect(await (agent==='claude'?new ClaudeRunner(options):new CodexRunner(options)).detect()).toMatchObject({newSessionWithContext:false,nativeResume:false,reason:'unverified_help'});
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(['claude','codex'] as const)('rejects duplicate/conflicting %s option declarations',async agent=>{
 const root=await fakeCodexRoot(agent);const observed=await currentInterface(agent);
 try{
  for(const extra of [agent==='claude'?'  --resume [value]':'  --cd <DIR>',agent==='claude'?'  --resume <OTHER>':'  --cd <OTHER>']){
   const options={path:root,probe:async(_file:string,args:string[])=>args[0]==='--version'?observed.version:args[0]==='resume'?observed.resume:observed.help+extra+'\n'};
   expect((await (agent==='claude'?new ClaudeRunner(options):new CodexRunner(options)).detect()).nativeResume).toBe(false);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(['cmd','bat'])('never invokes a Windows .%s wrapper, even when a probe callback is supplied',async extension=>{
 const root=await mkdtemp(join(tmpdir(),'threadport-wrapper-'));const calls:string[][]=[];
 try{
  await writeFile(join(root,'codex.'+extension),'synthetic wrapper; do not run');
  const result=await new CodexRunner({path:root,platform:'win32',pathExt:'.'+extension.toUpperCase(),probe:async(_file,args)=>{calls.push(args);return '';}}).detect();
  expect(result).toMatchObject({installed:true,reason:'unsupported_executable',newSessionWithContext:false,nativeResume:false});
  expect(calls).toEqual([]);
 }finally{await rm(root,{recursive:true,force:true});}
});

it.skipIf(process.platform==='win32'||process.execPath.includes(' '))('terminates a real synthetic version probe at the fixed five-second timeout',async()=>{
 const root=await fakeCodexRoot();
 try{
  await writeFile(join(root,'codex'),`#!${process.execPath}\nsetTimeout(()=>{},60000);\n`);
  const started=Date.now();const result=await new CodexRunner({path:root}).detect();
  expect(result).toMatchObject({reason:'probe_failed',newSessionWithContext:false,nativeResume:false});
  expect(Date.now()-started).toBeGreaterThanOrEqual(4500);
  expect(Date.now()-started).toBeLessThan(9000);
 }finally{await rm(root,{recursive:true,force:true});}
},15000);
