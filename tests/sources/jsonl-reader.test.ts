import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, appendFile, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readJsonl } from '../../src/sources/jsonl-reader.js';
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function file(text: string) { const root = await mkdtemp(join(tmpdir(), 'tp-reader-')); dirs.push(root); const path = join(root, 'session.jsonl'); await writeFile(path, text); return { root, path }; }
const signal = () => new AbortController().signal;
it('reads complete UTF-8 lines only and consumes completed tails once', async () => {
 const {root,path} = await file('{"text":"中文"}\n{"text":');
 const first = await readJsonl({path, root, cursor:null, maxRecords:10, signal:signal()});
 expect(first.lines.map(x=>x.text)).toEqual(['{"text":"中文"}']); expect(first.warnings).toContain('INCOMPLETE_LINE');
 await appendFile(path, '"补全"}\n');
 const second = await readJsonl({path,root,cursor:first.cursor,maxRecords:10,signal:signal()});
 expect(second.lines.map(x=>x.text)).toEqual(['{"text":"补全"}']);
 expect((await readJsonl({path,root,cursor:second.cursor,maxRecords:10,signal:signal()})).lines).toEqual([]);
});
it('skips oversized lines with a reason and continues bounded reads', async()=>{
 const {root,path}=await file('x'.repeat(90)+'\n{"ok":true}\n');
 const page=await readJsonl({path,root,cursor:null,maxRecords:10,maxLineBytes:32,signal:signal()});
 expect(page.lines[0].issue).toBe('LINE_TOO_LARGE'); expect(page.lines[1].text).toBe('{"ok":true}');
});
it('resets on truncation, replacement and in-place prefix rewrite',async()=>{
 const {root,path}=await file('{"a":1}\n{"b":2}\n');
 const first=await readJsonl({path,root,cursor:null,maxRecords:1,signal:signal()});
 await writeFile(path,'{"x":1}\n{"b":2}\n');
 expect((await readJsonl({path,root,cursor:first.cursor,maxRecords:1,signal:signal()})).warnings).toContain('SOURCE_RESET');
 await writeFile(path,'{}\n');
 expect((await readJsonl({path,root,cursor:first.cursor,maxRecords:1,signal:signal()})).warnings).toContain('SOURCE_RESET');
 await rename(path,path+'.old'); await writeFile(path,'{}\n');
 expect((await readJsonl({path,root,cursor:first.cursor,maxRecords:1,signal:signal()})).warnings).toContain('SOURCE_RESET');
});
it('rejects cancelled work and reports file budget overflow',async()=>{
 const {root,path}=await file('x'.repeat(100)); const controller=new AbortController();controller.abort();
 await expect(readJsonl({path,root,cursor:null,maxRecords:10,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 const page=await readJsonl({path,root,cursor:null,maxRecords:10,maxFileBytes:50,signal:signal()});
 expect(page.warnings).toContain('FILE_TOO_LARGE');expect(page.lines).toEqual([]);
});
it('aborts an in-flight oversized-line scan without advancing the caller cursor',async()=>{
 const {root,path}=await file('x'.repeat(8*1024*1024));const controller=new AbortController();
 const reading=readJsonl({path,root,cursor:null,maxRecords:1,signal:controller.signal});
 setTimeout(()=>controller.abort(),0);await expect(reading).rejects.toMatchObject({name:'AbortError'});
});
