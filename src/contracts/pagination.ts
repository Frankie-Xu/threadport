import { z } from 'zod';
import { DomainError } from '../domain/errors.js';

export const offsetCursorSchema=z.object({
 key:z.string().regex(/^[a-f0-9]{64}$/),
 generation:z.number().int().nonnegative().safe(),
 offset:z.number().int().nonnegative().safe(),
}).strict();

/** Validate the envelope before deciding whether a well-formed page is stale. */
export function decodePageCursor<T extends z.ZodTypeAny>(cursor:string,schema:T):z.output<T>{
 try{
  if(cursor.length>2048||!/^[A-Za-z0-9_-]+$/.test(cursor))throw new Error();
  const bytes=Buffer.from(cursor,'base64url');
  if(bytes.toString('base64url')!==cursor)throw new Error();
  return schema.parse(JSON.parse(bytes.toString('utf8')));
 }catch{throw new DomainError('INVALID_INPUT','Invalid pagination cursor; restart the list.');}
}
