import type Database from 'better-sqlite3';
import { DomainError } from '../domain/errors.js';
import { redactSecrets } from '../redact.js';
import { encodeCursor, fold, parseSearch, searchTime, type SearchInput, type SearchItem, type SearchMatch, type SearchPage } from '../search/contracts.js';
interface Row {id:string;sessionId:string|null;taskId:string|null;title:string;objective:string;projectId:string|null;projectName:string|null;workspaceId:string|null;workspacePath:string|null;agent:'claude'|'codex'|null;activity:string|null;searchRowid:number|null;searchDirty:number}
export function registerSearchFunctions(db:Database.Database):void{
 db.function('tp_search_time',{deterministic:true},searchTime);
 db.function('tp_search_redact',{deterministic:true},(value:unknown)=>redactSecrets(typeof value==='string'?value:'').text);
}
const documents=`WITH documents AS (
 SELECT 's:'||s.id AS id,s.id AS sessionId,t.id AS taskId,
 tp_search_redact(json_extract(t.body_json,'$.title')) AS title,tp_search_redact(json_extract(t.body_json,'$.objective.text')) AS objective,
 p.id AS projectId,p.name AS projectName,w.id AS workspaceId,w.canonical_root AS workspacePath,
 coalesce(src.agent,json_extract(s.metadata_json,'$.session.agent')) AS agent,
 tp_search_time(s.last_event_at) AS activity,ss.rowid AS searchRowid,coalesce(ss.dirty,1) AS searchDirty
 FROM sessions s LEFT JOIN session_search ss ON ss.session_id=s.id LEFT JOIN task_sessions ts ON ts.session_id=s.id LEFT JOIN tasks t ON t.id=ts.task_id
 LEFT JOIN projects p ON p.id=coalesce(s.project_id,t.project_id) LEFT JOIN workspaces w ON w.id=s.workspace_id LEFT JOIN sources src ON src.id=s.source_id
 UNION ALL
 SELECT 't:'||t.id,NULL,t.id,tp_search_redact(json_extract(t.body_json,'$.title')),tp_search_redact(json_extract(t.body_json,'$.objective.text')),
 p.id,p.name,NULL,NULL,NULL,NULL,NULL,NULL FROM tasks t JOIN projects p ON p.id=t.project_id WHERE NOT EXISTS(SELECT 1 FROM task_sessions ts WHERE ts.task_id=t.id)
)`;
function snippet(field:SearchMatch['field'],eventId:string|null,text:string,terms:string[],focus:string):SearchMatch|null{
 const lowered=fold(text);const offsets=[lowered.indexOf(focus)].filter(index=>index>=0);if(!offsets.length)return null;
 let offset=Math.max(0,Math.min(...offsets)-60);if(offset>0&&/[\uDC00-\uDFFF]/.test(text[offset]))offset--;
 let end=Math.min(text.length,offset+240);if(end<text.length&&/[\uDC00-\uDFFF]/.test(text[end]))end--;
 const excerpt=text.slice(offset,end);const folded=fold(excerpt);const highlights:{start:number;end:number}[]=[];
 for(const term of terms){let from=0;while(from<excerpt.length){const start=folded.indexOf(term,from);if(start<0)break;highlights.push({start,end:start+term.length});from=start+term.length;}}
 return {field,eventId,text:excerpt,offset,highlights};
}
/** Reads only the event search projection and approved task fields, never event bodies. */
export function searchHistory(db:Database.Database,input:SearchInput):SearchPage{
 const query=parseSearch(input);
 return db.transaction(()=>{
  const generation=db.prepare('SELECT generation FROM search_state WHERE id=1').pluck().get() as number;
  if(query.after&&query.after.generation!==generation)throw new DomainError('SEARCH_STALE','Search data changed; restart the search without a cursor.');
  const values:Record<string,string|number|null>={project:query.projectId,agent:query.agent,from:query.from,to:query.to,limit:query.limit+1};
  const clauses=['(@project IS NULL OR d.projectId=@project)','(@agent IS NULL OR d.agent=@agent)','(@from IS NULL OR d.activity>=@from)','(@to IS NULL OR d.activity<=@to)'];
  // Build candidate sets once, then test documents in cursor order and stop as
  // soon as the page is full. This avoids scanning long text for later pages.
  const candidates=query.terms.map(term=>{
   const characters=Array.from(term);
   if(characters.length<3||term.includes('\0'))return null;
   const grams=[...new Set(characters.slice(0,-2).map((_,i)=>characters.slice(i,i+3).join('')))];
   const expression=grams.map(gram=>'"'+gram.replaceAll('"','""')+'"').join(' AND ');
   return new Set(db.prepare('SELECT rowid FROM session_search_fts WHERE session_search_fts MATCH ?').pluck().all(expression) as number[]);
  });
  if(query.after){values.afterTime=query.after.activity??'';values.afterId=query.after.id;clauses.push("(coalesce(d.activity,'')<@afterTime OR (coalesce(d.activity,'')=@afterTime AND d.id>@afterId))");}
  const cleanMatch=db.prepare('SELECT 1 FROM session_search WHERE rowid=? AND instr(search_text,?)>0');
  const dirtyMatch=db.prepare('SELECT 1 FROM events WHERE session_id=? AND instr(lower(search_text),?)>0 LIMIT 1');
  const rows:Row[]=[];
  const ordered=db.prepare(`${documents} SELECT id,sessionId,taskId,title,objective,projectId,projectName,workspaceId,workspacePath,agent,activity,searchRowid,searchDirty FROM documents d WHERE ${clauses.join(' AND ')} ORDER BY coalesce(activity,'') DESC,id ASC`);
  delete values.limit;
  for(const value of ordered.iterate(values)){
   const row=value as Row;const title=fold(row.title),objective=fold(row.objective);
   const matched=query.terms.every((term,index)=>{
    if(title.includes(term)||objective.includes(term))return true;
    if(!row.sessionId)return false;
    if(row.searchDirty!==0)return !!dirtyMatch.get(row.sessionId,term);
    const possible=candidates[index];
    return (!possible||possible.has(row.searchRowid!))&&!!cleanMatch.get(row.searchRowid,term);
   });
   if(matched)rows.push(row);
   if(rows.length>query.limit)break;
  }
  const hasMore=rows.length>query.limit;rows.length=Math.min(rows.length,query.limit);
  const eventMatch=db.prepare('SELECT id,search_text AS text FROM events WHERE session_id=? AND instr(lower(search_text),?)>0 ORDER BY ordinal DESC LIMIT 1');
  const items:SearchItem[]=rows.map(row=>{
   const matches:SearchMatch[]=[];const seen=new Set<string>();
   const add=(field:SearchMatch['field'],eventId:string|null,text:string,term:string)=>{
    const match=snippet(field,eventId,text,query.terms,term);if(!match)return;
    const key=JSON.stringify([field,eventId,match.offset]);if(!seen.has(key)){seen.add(key);matches.push(match);}
   };
   for(const term of query.terms){
    for(const field of ['title','objective'] as const)add(field,null,row[field],term);
    if(row.sessionId){const event=eventMatch.get(row.sessionId,term) as {id:string;text:string}|undefined;if(event)add('event',event.id,event.text,term);}
   }
   return {id:row.id,kind:row.sessionId?'session':'task',sessionId:row.sessionId,task:row.taskId?{id:row.taskId,title:row.title}:null,
    project:row.projectId?{id:row.projectId,name:redactSecrets(row.projectName??'').text}:null,
    workspace:row.workspaceId?{id:row.workspaceId,displayPath:redactSecrets(row.workspacePath??'').text.slice(0,512)}:null,
    agent:row.agent,lastActivityAt:row.activity,matches};
  });
  const last=rows.at(-1);return {items,nextCursor:hasMore&&last?encodeCursor({v:1,query:query.digest,generation,activity:last.activity,id:last.id}):null};
 })();
}
