import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startLocalServer,type LocalServer } from './server/index.js';
import { openStore } from './storage/sqlite-store.js';
import { TaskService } from './tasks/service.js';
import type { CliIo } from './cli.js';
async function openBrowser(url:string){
 const windows=process.platform==='win32';
 await promisify(execFile)(windows?'powershell.exe':process.platform==='darwin'?'open':'xdg-open',windows?['-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $env:THREADPORT_UI_URL']:[url],{timeout:5000,windowsHide:true,env:{...process.env,THREADPORT_UI_URL:url}});
}
export async function runUi(options:{dataDir?:string;noOpen:boolean;demo:boolean},io:CliIo):Promise<number>{
 let server:LocalServer|undefined,demoDir:string|undefined,signal:string|undefined;
 let finish!:()=>void;const stopped=new Promise<void>(resolve=>{finish=resolve;});
 const interrupt=()=>{signal='SIGINT';finish();},terminate=()=>{signal='SIGTERM';finish();};
 process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
 try{
  if(options.demo){
   demoDir=await mkdtemp(join(tmpdir(),'threadport-demo-'));const store=await openStore({dataDir:demoDir});
   try{store.createProject('demo','合成演示项目');await new TaskService(store).create({projectId:'demo',title:'演示：继续整理测试证据'});}finally{store.close();}
  }
  server=await startLocalServer({dataDir:demoDir??options.dataDir,demo:options.demo});
  if(signal)return signal==='SIGINT'?130:143;
  const url=server.origin+'/#token='+server.token;
  io.stdout.write(url+'\n');
  if(!options.noOpen){try{await openBrowser(url);}catch{io.stderr.write('Could not open the browser; use the link printed above.\n');}}
  await Promise.race([stopped,server.closed]);return signal==='SIGINT'?130:signal==='SIGTERM'?143:0;
 }catch{io.stderr.write('Unable to start the local workspace service.\n');return 5;}
 finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);try{try{await server?.close();}finally{if(demoDir)await rm(demoDir,{recursive:true,force:true});}}catch{io.stderr.write('Local service cleanup failed.\n');return 5;}}
}
