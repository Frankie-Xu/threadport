import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
const id=z.string().min(1).max(512);
const date=z.string().max(40).datetime({offset:true});
const inputSchema=z.object({q:z.string().max(1024).default(''),projectId:id.optional(),agent:z.enum(['claude','codex']).optional(),from:date.optional(),to:date.optional(),cursor:z.string().min(1).max(2048).optional(),limit:z.number().int().min(1).max(100).default(50)}).strict();
export interface SearchInput {q?:string;projectId?:string;agent?:'claude'|'codex';from?:string;to?:string;cursor?:string;limit?:number}
export function searchTime(value:unknown):string|null{const parsed=date.safeParse(value);return parsed.success?new Date(parsed.data).toISOString():null;}
export const fold=(value:string)=>value.replace(/[A-Z]/g,char=>char.toLowerCase());
const cursorSchema=z.object({v:z.literal(1),query:z.string().regex(/^[a-f0-9]{64}$/),generation:z.number().int().nonnegative().safe(),activity:z.string().datetime().nullable(),id:z.string().min(3).max(514).regex(/^[st]:/)}).strict();
export type SearchCursor=z.infer<typeof cursorSchema>;
export interface SearchQuery {terms:string[];projectId:string|null;agent:'claude'|'codex'|null;from:string|null;to:string|null;limit:number;digest:string;after:SearchCursor|null}
export interface SearchMatch {field:'title'|'objective'|'event';eventId:string|null;text:string;offset:number;highlights:{start:number;end:number}[]}
export interface SearchItem {id:string;kind:'session'|'task';sessionId:string|null;task:{id:string;title:string}|null;project:{id:string;name:string}|null;workspace:{id:string;displayPath:string}|null;agent:'claude'|'codex'|null;lastActivityAt:string|null;matches:SearchMatch[]}
export interface SearchPage {items:SearchItem[];nextCursor:string|null}
function invalid():never{throw new DomainError('INVALID_INPUT','Invalid search filters or cursor; reset the search.');}
export function parseSearch(input:SearchInput):SearchQuery{
 const parsed=inputSchema.safeParse(input);if(!parsed.success)invalid();const value=parsed.data;
 const terms=[...new Set(value.q.trim().split(/\s+/u).filter(Boolean).map(fold))];if(terms.length>8||terms.some(term=>term.length>128))invalid();
 const from=value.from?new Date(value.from).toISOString():null;const to=value.to?new Date(value.to).toISOString():null;
 if(from&&to&&from>to)invalid();
 const filters={terms,projectId:value.projectId??null,agent:value.agent??null,from,to,limit:value.limit};
 const digest=createHash('sha256').update(JSON.stringify(filters)).digest('hex');let after:SearchCursor|null=null;
 if(value.cursor){try{if(!/^[A-Za-z0-9_-]+$/.test(value.cursor))invalid();after=cursorSchema.parse(JSON.parse(Buffer.from(value.cursor,'base64url').toString('utf8')));}catch{invalid();}if(after.query!==digest)invalid();}
 return {...filters,digest,after};
}
export function encodeCursor(cursor:SearchCursor):string{return Buffer.from(JSON.stringify(cursorSchema.parse(cursor))).toString('base64url');}
