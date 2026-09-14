import { readFile, writeFile, realpath, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect,it } from 'vitest';
import { temporary,project,git } from './helpers.js';
import { openStore } from '../src/storage/sqlite-store.js';
import { SnapshotService } from '../src/workspace/index.js';
import { runCli } from '../src/cli.js';
async function cli(args:string[],cwd:string){let stdout='',stderr='';const code=await runCli(args,{cwd:()=>cwd,stdout:{write:s=>{stdout+=s;}},stderr:{write:s=>{stderr+=s;}}});return{code,stdout,stderr};}
async function setup(){
 const cwd=await temporary(),root=await realpath(await project()),dataDir=join(cwd,'data');
 const store=await openStore({dataDir});store.createProject('p','Project');store.createWorkspace('w','p',root);
 const snapshot=await new SnapshotService(store).capture('w');store.close();
 const capsule=JSON.parse(await readFile(resolve('examples/capsule-v1.json'),'utf8'));
 capsule.commands.push({command:'touch threadport-should-not-run'});capsule.project.root='.';capsule.git.root='.';capsule.evidence.push({kind:'other',title:'Explicit workspace snapshot',locator:`threadport:workspace-snapshot:${snapshot.id}`});
 await writeFile(join(cwd,'capsule.json'),JSON.stringify(capsule));
 return{cwd,root,dataDir,capsule,args:['verify','capsule.json','--project',root,'--data-dir',dataDir]};
}
it('maps matched and drifted to JSON/text and exit codes without executing capsule commands',async()=>{
 const {cwd,root,args}=await setup();
 const before=git(root,'status','--porcelain');
 const matched=await cli([...args,'--json'],cwd);expect(matched.code,matched.stderr).toBe(0);expect(JSON.parse(matched.stdout)).toMatchObject({status:'matched',reasons:[]});expect(matched.stderr).toBe('');
 expect(git(root,'status','--porcelain')).toBe(before);
 await writeFile(join(root,'README.md'),'changed');
 const drifted=await cli(args,cwd);expect(drifted.code).toBe(4);expect(drifted.stdout).toContain('CONTENT_CHANGED');
 expect((await cli(['validate','capsule.json'],cwd)).code).toBe(0);
},30000);
it('returns unverifiable for legacy, missing references and wrong projects without creating data',async()=>{
 const {cwd,args,root,capsule}=await setup();const other=await project();
 expect((await cli(args.map(arg=>arg===root?other:arg),cwd)).code).toBe(6);
 capsule.evidence=[];await writeFile(join(cwd,'legacy.json'),JSON.stringify(capsule));
 const absent=join(cwd,'absent');const legacy=await cli(['verify','legacy.json','--project',root,'--data-dir',absent,'--json'],cwd);
 expect(legacy.code).toBe(6);expect(JSON.parse(legacy.stdout)).toMatchObject({status:'unverifiable',scope:null,snapshotId:null});expect(await readdir(cwd)).not.toContain('absent');
 const missing=await cli([...args.slice(0,-2),'--data-dir',absent,'--json'],cwd);expect(missing.code).toBe(6);expect(await readdir(cwd)).not.toContain('absent');
},30000);
it('keeps verify input/IO failures separate from old validate failures',async()=>{
 const {cwd,args,capsule}=await setup();
 for(const tail of [['--unknown'],['--json','--json'],['--project'],['extra.json']])expect((await cli([...args,...tail],cwd)).code).toBe(2);
 expect((await cli(['verify','capsule.json'],cwd)).code).toBe(2);
 expect((await cli(args.map(arg=>arg==='capsule.json'?'missing.json':arg),cwd)).code).toBe(5);
 await writeFile(join(cwd,'capsule.json'),'{broken');expect((await cli(args,cwd)).code).toBe(2);expect((await cli(['validate','capsule.json'],cwd)).code).toBe(1);
 capsule.evidence.push(capsule.evidence.at(-1));await writeFile(join(cwd,'capsule.json'),JSON.stringify(capsule));expect((await cli(args,cwd)).code).toBe(2);
},30000);
it('reports missing roots/snapshots safely and rejects damaged stores as IO failures',async()=>{
 const {cwd,args,dataDir,capsule,root}=await setup();
 const saved=await readFile(join(cwd,'capsule.json'),'utf8');
 capsule.evidence.at(-1).locator='threadport:workspace-snapshot:missing';
 await writeFile(join(cwd,'capsule.json'),JSON.stringify(capsule));expect((await cli(args,cwd)).code).toBe(6);
 capsule.evidence.at(-1).locator='threadport:workspace-snapshot:../escape';
 await writeFile(join(cwd,'capsule.json'),JSON.stringify(capsule));expect((await cli(args,cwd)).code).toBe(2);
 await writeFile(join(cwd,'capsule.json'),saved);
 const missingRoot=await cli(args.map(arg=>arg===root?join(cwd,'gone'):arg).concat('--json'),cwd);
 expect(missingRoot.code).toBe(6);expect(JSON.parse(missingRoot.stdout).reasons[0].code).toBe('SOURCE_MISSING');
 await writeFile(join(dataDir,'threadport.sqlite'),'damaged database');
 const damaged=await cli([...args,'--json'],cwd);expect(damaged.code).toBe(5);expect(damaged.stdout).toBe('');expect(damaged.stderr).not.toContain(dataDir);
},30000);
