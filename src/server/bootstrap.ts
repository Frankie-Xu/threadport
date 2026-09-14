import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
export function registerBootstrap(app:FastifyInstance,demo=false){
 app.get('/',async(_request,reply)=>{
  const nonce=randomBytes(16).toString('hex');
  reply.header('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
  reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');
  return reply.type('text/html; charset=utf-8').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ThreadPort</title>
<style nonce="${nonce}">body{font:16px/1.6 system-ui,sans-serif;background:#f5f5f2;color:#242821;margin:0}main{max-width:760px;margin:8vh auto;padding:32px}h1{font-size:36px;margin-bottom:8px}p{color:#565e53}li{background:white;border:1px solid #d9ded5;padding:14px 20px;margin:12px 0;border-radius:8px}ul{list-style:none;padding:0}a{color:#385b30}:focus-visible{outline:3px solid #587b50}small{color:#56634e}</style>
<main><small>${demo?'DEMO · 合成示例，独立临时数据':'LOCAL · 数据仅保存在本机'}</small><h1>ThreadPort</h1><p id="status" role="status">正在连接本地服务…</p><ul id="tasks" aria-label="任务"></ul><p>任务保存在本机。关闭终端服务后，访问链接将失效。</p><p id="recovery" hidden>页面刷新后需要从当前终端打印的链接重新打开。原有任务和筛选参数会保留。</p></main>
<script nonce="${nonce}">(()=>{const token=new URLSearchParams(location.hash.slice(1)).get('token');history.replaceState(null,'',location.pathname+location.search);const status=document.getElementById('status');const recovery=document.getElementById('recovery');if(!token||!/^[a-f0-9]{64}$/.test(token)){status.textContent='需要当前终端的访问链接';recovery.hidden=false;return;}const request=async path=>{const response=await fetch(path,{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!response.ok)throw new Error('请求失败');return response.json();};Promise.all([request('/api/v1/status'),request('/api/v1/tasks')]).then(([info,page])=>{status.textContent='服务已连接 · '+info.data.counts.tasks+' 个本地任务';for(const task of page.data){const item=document.createElement('li');item.textContent=task.title;document.getElementById('tasks').append(item);}if(!page.data.length)status.textContent='服务已连接，尚无任务。';}).catch(()=>{status.textContent='服务不可用或访问链接已失效';recovery.hidden=false;});})();</script></html>`);
 });
}
