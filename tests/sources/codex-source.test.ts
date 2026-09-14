import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSourceRegistry } from '../../src/sources/registry.js';
import type { ReadCursor } from '../../src/sources/contracts.js';
const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
it('normalizes Codex metadata, visible messages and cross-page command results with stable IDs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tp-codex-'));dirs.push(root);const path=join(root,'same.jsonl');
 const rows=[{type:'session_meta',payload:{id:'synthetic',cwd:'/synthetic',cli_version:'synthetic-1'}},{type:'response_item',payload:{type:'reasoning',summary:[{text:'PRIVATE_REASONING'}]}},{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'中文目标'}]}},{type:'response_item',payload:{type:'function_call',name:'exec_command',call_id:'call',arguments:JSON.stringify({cmd:'npm test'})}},{type:'response_item',payload:{type:'function_call_output',call_id:'call',output:{output:'pass',exit_code:0,unknown:'PRIVATE_UNKNOWN'}}}];
 await writeFile(path,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
 const registry=createSourceRegistry([{agent:'codex',sourceId:'codex',roots:[root]},{agent:'claude',sourceId:'claude',roots:[root]}]);const source=registry.get('codex')!;
 const candidate={sourceId:'codex',path,agent:'codex' as const};let cursor:ReadCursor|null=null;const events=[];let page;
 do{page=await source.read({candidate,cursor,maxEvents:1,signal:new AbortController().signal});cursor=page.cursor;events.push(...page.events);}while(page.hasMore);
 expect(events.map(e=>e.kind)).toEqual(['user-message','command','command']);expect(events[2].commandRun?.exitCode).toBe(0);expect(events[1].commandRun?.cwd).toBe('/synthetic');expect(events[1].commandRun?.id).toBe(events[2].commandRun?.id);
 expect(JSON.stringify({events,cursor})).not.toContain('PRIVATE_');expect(cursor.parserVersion).toBe('codex-jsonl-v1');expect(page.session.vendorSessionId).toBe('synthetic');
 const empty=await source.read({candidate,cursor,maxEvents:10,signal:new AbortController().signal});expect(empty.events).toEqual([]);expect(empty.warnings).not.toContain('SOURCE_RESET');
 const claude=await registry.get('claude')!.read({candidate:{...candidate,agent:'claude',sourceId:'claude'},cursor:null,maxEvents:1,signal:new AbortController().signal});expect(claude.session.id).not.toBe(page.session.id);
});
it('keeps context changes and malformed/unknown records explicit across pages',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tp-codex-'));dirs.push(root);const path=join(root,'context.jsonl');
 const rows=[{type:'session_meta',payload:{id:'one',cwd:'/old'}},{type:'turn_context',payload:{cwd:'/new'}},{type:'response_item',payload:{type:'function_call',name:'exec_command',call_id:'call',arguments:'{"cmd":"npm test"}'}},{type:'response_item',payload:{type:'function_call_output',call_id:'call',output:'An old test passed'}},{type:'session_meta',payload:{id:'different'}},{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'MUST_NOT_MERGE'}]}}];
 await writeFile(path,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');const adapter=createSourceRegistry([{agent:'codex',sourceId:'codex',roots:[root]}]).get('codex')!;let cursor:ReadCursor|null=null;let page;const events=[];
 do{page=await adapter.read({candidate:{agent:'codex',sourceId:'codex',path},cursor,maxEvents:1,signal:new AbortController().signal});cursor=page.cursor;events.push(...page.events);}while(page.hasMore);
 expect(events[0].commandRun?.cwd).toBe('/new');expect(events[1].commandRun?.exitCode).toBeNull();expect(events.some(e=>e.text==='MUST_NOT_MERGE')).toBe(false);expect(page.session.status).toBe('unsupported');
});
it('reads the committed native Codex structural fixture',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tp-codex-'));dirs.push(root);const path=join(root,'fixture.jsonl');const {readFile}=await import('node:fs/promises');await writeFile(path,await readFile(new URL('../fixtures/codex/source-visible.jsonl',import.meta.url)));
 const source=createSourceRegistry([{agent:'codex',sourceId:'fixture',roots:[root]}]).get('fixture')!;let cursor:ReadCursor|null=null;let page;let count=0;
 do{page=await source.read({candidate:{agent:'codex',sourceId:'fixture',path},cursor,maxEvents:10,signal:new AbortController().signal});cursor=page.cursor;count+=page.events.length;}while(page.hasMore);
 expect(count).toBe(3);expect(page.session.status).toBe('ready');expect(page.events[0].commandRun?.exitCode).toBe(0);
});
