import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
export function fail(reply:FastifyReply,request:FastifyRequest,status:number,code:string,message:string){
 return reply.code(status).send({error:{code,message,retryable:false,requestId:request.id}});
}
export function installAuth(app:FastifyInstance,token:string):void{
 const expected=Buffer.from(`Bearer ${token}`);
 app.addHook('onRequest',async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  const address=app.server.address();
  if(!address||typeof address==='string')return fail(reply,request,503,'UNAVAILABLE','Server is not listening.');
  const host=`127.0.0.1:${address.port}`;
  const counts=new Map<string,number>();
  for(let i=0;i<request.raw.rawHeaders.length;i+=2){const key=request.raw.rawHeaders[i].toLowerCase();counts.set(key,(counts.get(key)??0)+1);}
  if(['host','origin','authorization'].some(key=>(counts.get(key)??0)>1))return fail(reply,request,400,'INVALID_INPUT','Duplicate security header.');
  if(request.headers.host!==host)return fail(reply,request,403,'FORBIDDEN','Invalid request host.');
  if(request.headers.origin!==undefined&&request.headers.origin!==`http://${host}`)return fail(reply,request,403,'FORBIDDEN','Invalid request origin.');
  const provided=Buffer.from(request.headers.authorization??'');
  if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return fail(reply,request,401,'UNAUTHORIZED','Bearer authentication required.');
  if(['POST','PATCH','PUT','DELETE'].includes(request.method)&&request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')return fail(reply,request,415,'INVALID_INPUT','JSON content type required.');
  // Reject path traversal before future route/static handlers; never reflect the path.
  let pathname:string;
  try{pathname=decodeURIComponent(request.raw.url?.split('?')[0]??'');}catch{return fail(reply,request,400,'INVALID_INPUT','Invalid request path.');}
  if(pathname.includes('\\')||pathname.split('/').some(part=>part==='.'||part==='..'))return fail(reply,request,400,'INVALID_INPUT','Invalid request path.');
 });
}
