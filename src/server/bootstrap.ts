import { readFile,readdir,lstat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
/** Only packaged, flat asset names are served; request paths never become filesystem paths. */
export async function registerBootstrap(app:FastifyInstance,demo=false){
 const root=new URL(import.meta.url.endsWith('.ts')?'../../dist/web/':'../../web/',import.meta.url);
 const html=(await readFile(new URL('index.html',root),'utf8')).replace('__THREADPORT_DEMO__',String(demo));
 const assets=new Map<string,{body:Buffer;type:string}>();
 for(const name of await readdir(new URL('assets/',root))){
  if(!/^[A-Za-z0-9_-]+\.(js|css)$/.test(name))continue;
  const url=new URL('assets/'+name,root),info=await lstat(url);if(!info.isFile()||info.isSymbolicLink())continue;
  assets.set('/assets/'+name,{body:await readFile(url),type:name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'});
 }
 app.addHook('onSend',async(_request,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');return payload;});
 app.get('/',async(_request,reply)=>reply.header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'").type('text/html; charset=utf-8').send(html));
 for(const [path,asset] of assets)app.get(path,async(_request,reply)=>reply.type(asset.type).send(asset.body));
}
