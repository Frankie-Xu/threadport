import { open } from 'node:fs/promises';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { controlEventSchema, type ControlEvent } from './contracts.js';

/** A manual import is bounded independently of file stat and closes on every path. */
export async function readControlEventImport(path:string):Promise<ControlEvent[]>{
 const file=await open(path,'r');
 try{
  if(!(await file.stat()).isFile())throw new DomainError('INVALID_INPUT','Choose a control-event JSON file.');
  const limit=1024*1024,bytes=Buffer.alloc(limit+1);let size=0;
  while(size<bytes.length){const {bytesRead}=await file.read(bytes,size,bytes.length-size,size);if(!bytesRead)break;size+=bytesRead;}
  if(size>limit)throw new DomainError('INVALID_INPUT','Control-event import exceeds 1 MiB.');
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size));}
  catch{throw new DomainError('INVALID_INPUT','Control-event import must be UTF-8 JSON.');}
  const value:unknown=JSON.parse(text);
  return z.array(controlEventSchema).min(1).max(1000).parse(Array.isArray(value)?value:[value]);
 }finally{await file.close();}
}
