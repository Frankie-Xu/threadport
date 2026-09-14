import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, appendFile, mkdir, rm, symlink, readFile, chmod, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSourceRegistry, createClaudeSource } from '../../src/sources/registry.js';
import type { ReadCursor, SourceAdapter, SourceCandidate } from '../../src/sources/contracts.js';
const dirs:string[]=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function setup(){const root=await mkdtemp(join(tmpdir(),'tp-source-'));dirs.push(root);const path=join(root,'session.jsonl');const adapter=createClaudeSource({sourceId:'allowed',roots:[root]});const candidate:SourceCandidate={sourceId:'allowed',path,agent:'claude'};return{root,path,adapter,candidate};}
const signal=()=>new AbortController().signal;
const user=(text:string)=>JSON.stringify({type:'user',sessionId:'synthetic',message:{content:text}})+'\n';
async function collect(adapter:SourceAdapter,candidate:SourceCandidate,cursor:ReadCursor|null=null,maxEvents=10){
 const events=[];let page;
 do{page=await adapter.read({candidate,cursor,maxEvents,signal:signal()});events.push(...page.events);cursor=page.cursor;}while(page.hasMore);
 return{events,page};
}
it('discovers only allowed roots and excludes HOME bait and symlinks',async()=>{
 const {root,path}=await setup();await writeFile(path,user('allowed'));
 const bait=await mkdtemp(join(tmpdir(),'tp-bait-'));dirs.push(bait);await mkdir(join(bait,'.claude'));await writeFile(join(bait,'.claude','private.jsonl'),user('PRIVATE_BAIT'));vi.stubEnv('HOME',bait);
 await symlink(join(bait,'.claude'),join(root,'escape'),'dir');const codes:string[]=[];
 const registry=createSourceRegistry([{sourceId:'allowed',agent:'claude',roots:[root]}],x=>codes.push(x.code));
 const adapter=registry.get('allowed')!;const candidates=[];for await(const c of adapter.discover([root,bait],signal()))candidates.push(c);
 expect(candidates.map(c=>c.path)).toEqual([await realpath(path)]);expect(codes).toContain('SYMLINK_SKIPPED');expect(codes).toContain('ROOT_NOT_ALLOWED');expect(adapter.diagnostics.map(d=>d.code)).toContain('ROOT_NOT_ALLOWED');
 await expect(adapter.read({candidate:{sourceId:'allowed',agent:'claude',path:join(root,'escape','private.jsonl')},cursor:null,maxEvents:10,signal:signal()})).rejects.toMatchObject({code:'INVALID_INPUT'});
 expect(await readFile(join(bait,'.claude','private.jsonl'),'utf8')).toContain('PRIVATE_BAIT');
});
it('retains stable IDs across rescans, incremental pages and missing vendor IDs',async()=>{
 const {path,adapter,candidate}=await setup();await writeFile(path,user('A')+JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'B'},{type:'text',text:'C'}]}})+'\n');
 const first=await collect(adapter,candidate,null,1);const second=await collect(adapter,candidate,null,10);
 expect(first.events).toEqual(second.events);expect(new Set(first.events.map(e=>e.id)).size).toBe(3);expect(first.events.map(e=>e.ordinal)).toEqual([0,1,2]);
 await appendFile(path,user('追加'));const append=await collect(adapter,candidate,first.page.cursor);
 expect(append.events.map(e=>e.text)).toEqual(['追加']);expect(append.events[0].ordinal).toBe(3);expect(append.page.session.id).toBe(first.page.session.id);
 expect((await collect(adapter,candidate,append.page.cursor)).events).toEqual([]);
});
it('keeps hidden and unknown fields out, redacts before UTF-8 bounding and pairs cross-page command results',async()=>{
 const {path,adapter,candidate}=await setup();const secret='sk-syntheticsecret123456789012345';
 await writeFile(path,[{type:'assistant',sessionId:'synthetic',unknown:'PRIVATE_UNKNOWN',message:{content:[{type:'thinking',thinking:'PRIVATE_THINKING'},{type:'text',text:'中文'.repeat(3000)+secret},{type:'tool_use',id:'call',name:'Bash',input:{command:'npm test',cwd:'/synthetic',secret:'PRIVATE_INPUT'}}]}},{type:'user',sessionId:'synthetic',message:{content:[{type:'tool_result',tool_use_id:'call',content:{output:'ok',exit_code:0,thinking:'PRIVATE_RESULT'}}]}}].map(x=>JSON.stringify(x)).join('\n')+'\n');
 const result=await collect(adapter,candidate,null,1);const json=JSON.stringify(result);
 expect(json).not.toContain('PRIVATE_');expect(json).not.toContain(secret);expect(result.events[0].omitted).toBe(true);
 expect(result.events.every(e=>Buffer.byteLength(e.text)<=4096)).toBe(true);expect(result.events[0].text).not.toContain('\ufffd');
 const runs=result.events.flatMap(e=>e.commandRun?[e.commandRun]:[]);expect(runs.map(r=>r.exitCode)).toEqual([null,0]);expect(runs[0].id).toBe(runs[1].id);expect(result.page.cursor.pendingCalls).toEqual([]);
});
it('isolates bad JSON, unknown types and missing files with explicit states',async()=>{
 const {path,adapter,candidate}=await setup();await writeFile(path,'broken\n'+JSON.stringify({type:'mystery',secret:'never expose'})+'\n'+user('valid'));
 const result=await collect(adapter,candidate);expect(result.events.map(e=>e.text)).toEqual(['valid']);expect(result.page.session.status).toBe('partial');expect(result.page.warnings).toEqual(expect.arrayContaining(['INVALID_JSON','UNKNOWN_EVENT']));
 await rm(path);const missing=await adapter.read({candidate,cursor:result.page.cursor,maxEvents:10,signal:signal()});expect(missing.session.status).toBe('missing');expect(missing.cursor).toEqual(result.page.cursor);
});
it('resets parser state on replacement/truncation and never invents time',async()=>{
 const {path,adapter,candidate}=await setup();await writeFile(path,user('long previous message'));const first=await collect(adapter,candidate);await writeFile(path,user('B'));
 const next=await collect(adapter,candidate,first.page.cursor);expect(next.events[0].ordinal).toBe(0);expect(next.events[0].id).not.toBe(first.events[0].id);expect(next.page.session.id).toBe(first.page.session.id);expect(next.events[0].occurredAt).toBeNull();expect(next.page.warnings).toContain('SOURCE_RESET');
});
it('rejects cancellation, malformed cursors and unsupported registry agents',async()=>{
 const {path,adapter,candidate}=await setup();await writeFile(path,user('A'));const controller=new AbortController();controller.abort();
 await expect(adapter.read({candidate,cursor:null,maxEvents:10,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 await expect(adapter.read({candidate,cursor:{byteOffset:-1} as ReadCursor,maxEvents:10,signal:signal()})).rejects.toMatchObject({code:'INVALID_INPUT'});
 expect(()=>createSourceRegistry([{agent:'unknown',sourceId:'x',roots:['/synthetic']}])).toThrow();
});
it('reports root availability separately and permission errors without source text',async()=>{
 const {root,path,adapter,candidate}=await setup();const codes:string[]=[];const source=createClaudeSource({sourceId:'allowed',roots:[root,join(root,'missing')],onDiagnostic:x=>codes.push(x.code)});
 await writeFile(path,user('A'));const candidates=[];for await(const item of source.discover([join(root,'missing'),root],signal()))candidates.push(item);
 expect(candidates).toHaveLength(1);expect(codes).toContain('SOURCE_MISSING');
 if(process.platform!=='win32'&&process.getuid?.()!==0){await chmod(path,0);try{const result=await adapter.read({candidate,cursor:null,maxEvents:10,signal:signal()});expect(result.session.status).toBe('error');expect(result.warnings).toContain('SOURCE_PERMISSION_DENIED');}finally{await chmod(path,0o600);}}
});

it('completes half lines once and clears transient warnings',async()=>{
 const {path,adapter,candidate}=await setup();await writeFile(path,user('A')+'{"type":"user","message":{"content":"B');
 const first=await collect(adapter,candidate);expect(first.page.warnings).toContain('INCOMPLETE_LINE');
 await appendFile(path,'"}}\n');const next=await collect(adapter,candidate,first.page.cursor);
 expect(next.events.map(e=>e.text)).toEqual(['B']);expect(next.page.warnings).not.toContain('INCOMPLETE_LINE');
});
it('isolates multiple vendor session IDs and oversized lines without adopting misleading text',async()=>{
 const {path,adapter,candidate}=await setup();await writeFile(path,'x'.repeat(1024*1024+1)+'\n'+user('A')+JSON.stringify({type:'user',sessionId:'other',message:{content:'MUST_NOT_ADOPT'}})+'\n');
 const result=await collect(adapter,candidate);expect(result.events.map(e=>e.text)).toEqual(['A']);expect(result.page.session.status).toBe('unsupported');expect(result.page.warnings).toContain('LINE_TOO_LARGE');
});
it('uses the same session identity through discovered canonical paths and rejects cursors from another session',async()=>{
 const {root,path,adapter,candidate}=await setup();await writeFile(path,user('A'));const direct=await collect(adapter,candidate);
 for await(const found of adapter.discover([root],signal()))expect((await collect(adapter,found)).page.session.id).toBe(direct.page.session.id);
 const other=join(root,'other.jsonl');await writeFile(other,user('A'));
 await expect(adapter.read({candidate:{...candidate,path:other},cursor:direct.page.cursor,maxEvents:1,signal:signal()})).rejects.toMatchObject({code:'INVALID_INPUT'});
});
it('reads the committed synthetic format fixture through the native source API',async()=>{
 const {path,adapter,candidate}=await setup();await writeFile(path,await readFile(new URL('../fixtures/claude/source-visible.jsonl',import.meta.url)));
 const result=await collect(adapter,candidate);expect(result.events).toHaveLength(3);expect(result.events[2].commandRun?.exitCode).toBe(0);expect(result.page.session.formatVersion).toBe('synthetic-1');
});
it('stops with an explicit session event budget instead of pretending the file ended',async()=>{
 const {path,adapter,candidate}=await setup();await writeFile(path,user('A')+user('B'));const first=await adapter.read({candidate,cursor:null,maxEvents:1,signal:signal()});
 const page=await adapter.read({candidate,cursor:{...first.cursor,nextOrdinal:100000},maxEvents:1,signal:signal()});
 expect(page.events).toEqual([]);expect(page.warnings).toContain('EVENT_LIMIT');expect(page.session.status).toBe('partial');expect(page.cursor.byteOffset).toBe(first.cursor.byteOffset);
});
