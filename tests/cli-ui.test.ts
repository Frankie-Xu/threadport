import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve,join } from 'node:path';
import { afterEach,expect,it } from 'vitest';
import { temporary } from './helpers.js';
import { runCli } from '../src/cli.js';
const children:ReturnType<typeof spawn>[]=[];afterEach(()=>{for(const child of children.splice(0))child.kill('SIGKILL');});
async function start(args:string[]){
 const child=spawn(process.execPath,[resolve('dist/src/cli.js'),'ui','--no-open',...args],{stdio:['ignore','pipe','pipe']});children.push(child);let stdout='',stderr='';child.stderr!.on('data',data=>{stderr+=data;});
 const url=await new Promise<string>((done,reject)=>{const timeout=setTimeout(()=>reject(new Error('Startup timeout: '+stderr)),15000);child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Exited during startup: '+stderr));});child.stdout!.on('data',data=>{stdout+=data;if(stdout.includes('\n')){clearTimeout(timeout);done(stdout.trim().split('\n')[0]);}});});
 return{child,url,output:()=>({stdout,stderr})};
}
it('starts the installed-style CLI, serves a CSP bootstrap and stops on a signal',async()=>{
 const {child,url,output}=await start(['--data-dir',await temporary()]);const parsed=new URL(url);const token=new URLSearchParams(parsed.hash.slice(1)).get('token')!;
 const page=await fetch(parsed.origin);expect(page.status).toBe(200);expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");const html=await page.text();expect(html).not.toContain(token);const asset=html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];expect(asset).toBeTruthy();const script=await fetch(parsed.origin+asset);expect(script.status).toBe(200);expect(script.headers.get('x-content-type-options')).toBe('nosniff');expect(await script.text()).toContain('replaceState');expect((await fetch(parsed.origin+'/assets/missing.js')).status).toBe(404);expect((await fetch(parsed.origin+asset,{headers:{Origin:'https://example.invalid'}})).status).toBe(403);expect(html).not.toContain('sessionStorage');expect(html).not.toContain('localStorage');
 expect((await fetch(parsed.origin+'/api/v1/status')).status).toBe(401);
 expect((await fetch(parsed.origin+'/api/v1/status',{headers:{authorization:'Bearer '+token}})).status).toBe(200);
 const exited=once(child,'exit');child.kill('SIGTERM');const [code,signal]=await exited;
 if(process.platform!=='win32'){expect(code).toBe(143);expect(signal).toBeNull();}
 expect(output().stdout.trim()).toBe(url);expect(output().stderr).toBe('');
 await expect(fetch(parsed.origin+'/api/v1/status')).rejects.toThrow();
},30000);
it('creates a visibly marked isolated demo without sources',async()=>{
 const {child,url}=await start(['--demo']);const parsed=new URL(url),token=new URLSearchParams(parsed.hash.slice(1)).get('token')!;
 expect(await (await fetch(parsed.origin)).text()).toContain('data-demo="true"');
 const status=await (await fetch(parsed.origin+'/api/v1/status',{headers:{authorization:'Bearer '+token}})).json();expect(status.data.counts).toMatchObject({sources:0,tasks:1});
 const exited=once(child,'exit');child.kill('SIGTERM');await exited;
},30000);
it('rejects invalid options and reports startup IO failures safely',async()=>{
 let stdout='',stderr='';const io={cwd:()=>process.cwd(),stdout:{write:(text:string)=>{stdout+=text;}},stderr:{write:(text:string)=>{stderr+=text;}}};
 expect(await runCli(['ui','--demo','--data-dir','x'],io)).toBe(2);expect(await runCli(['ui','--unknown'],io)).toBe(2);
 const root=await temporary();const {writeFile}=await import('node:fs/promises');await writeFile(join(root,'file'),'not a directory');
 expect(await runCli(['ui','--no-open','--data-dir',join(root,'file')],io)).toBe(5);expect(stdout).toBe('');expect(stderr).not.toContain(root);
},30000);
