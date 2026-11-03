import type { ApiClient, Envelope } from './api.js';

const fields={title:120,objective:8000,nextAction:4000,constraints:100049};
export type DraftFields = Record<keyof typeof fields,string>;
export interface TaskDraft {taskId:string; revision:number; changes:Partial<DraftFields>}
const maxCiphertext = 768 * 1024;
const maxAge = 5 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8',{fatal:true});
const associated = (url: URL) => encoder.encode(`threadport.draft.v1\0${url.origin}`);
const bytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], pair=>parseInt(pair,16));
function base64(value: Uint8Array): string {
  let binary='';
  for(let i=0;i<value.length;i+=8192) binary+=String.fromCharCode(...value.subarray(i,i+8192));
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function fromBase64(value:string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));
}
export interface DraftIdentity { key:CryptoKey; fingerprint:string }
export async function loadDraftKey(api:ApiClient, signal:AbortSignal):Promise<DraftIdentity> {
  const {data}=await api.request<Envelope<{key:string}>>('/draft-recovery','GET',undefined,signal);
  if (!/^[a-f0-9]{64}$/.test(data.key)) throw new Error('Draft recovery is unavailable.');
  const raw=bytes(data.key);
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  return {key,fingerprint:base64(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))};
}
function validDraft(value:unknown): value is TaskDraft {
  if(!value||typeof value!=='object'||!('taskId' in value)||typeof value.taskId!=='string'||!value.taskId||value.taskId.length>512
    ||!('revision' in value)||typeof value.revision!=='number'||!Number.isSafeInteger(value.revision)||value.revision<1
    ||!('changes' in value)||!value.changes||typeof value.changes!=='object'||Array.isArray(value.changes)) return false;
  const entries=Object.entries(value.changes);
  return !!entries.length&&entries.every(([key,text])=>Object.hasOwn(fields,key)&&typeof text==='string'&&text.length<=fields[key as keyof DraftFields]);
}
export async function sealDraft(draft:TaskDraft,key:CryptoKey,url:URL):Promise<string> {
  if (!validDraft(draft)) throw new Error('The draft is too large to move. It remains open in this tab.');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:associated(url)},key,encoder.encode(JSON.stringify({draft,expires:Date.now()+maxAge})));
  const envelope=base64(iv)+'.'+base64(new Uint8Array(cipher));
  if(envelope.length>maxCiphertext) throw new Error('The draft is too large to move. It remains open in this tab.');
  return envelope;
}
export async function restoreDraft(envelope:string,key:CryptoKey,url:URL):Promise<TaskDraft> {
  if (envelope.length>maxCiphertext||!/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(envelope)) throw new Error('Invalid draft.');
  const [nonce,cipher]=envelope.split('.');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(nonce),additionalData:associated(url)},key,fromBase64(cipher));
  const data:unknown=JSON.parse(decoder.decode(plain));
  if (!data||typeof data!=='object'||!('expires' in data)||typeof data.expires!=='number'||data.expires<Date.now()
    ||!('draft' in data)||!validDraft(data.draft)) throw new Error('Draft is no longer available.');
  return data.draft;
}
