import { useEffect,useState } from 'react';
import { type ApiClient,type Envelope,type Workspace,ApiError,useLoad } from '../../api.js';
import { ErrorNotice,Modal,StatusBadge,useAction } from '../../components.js';
import type { AssertionInput,AssertionView } from '../../../../src/assertions/contracts.js';
import { redactSecrets } from '../../../../src/redact.js';
export type AssertionSeed={text:string;source:{sessionId:string;eventId:string}};
interface Ledger {entries:AssertionView[];history:AssertionView[];conflicts:{topic:string;ids:string[]}[];taskRevision:number}
export function Assertions({api,taskId,projectId,onSaved,onEvidence,seed,onSeedConsumed}:{api:ApiClient;taskId:string;projectId:string;onSaved:()=>void;onEvidence:(ref:{sessionId:string;eventId:string})=>void;seed:AssertionSeed|null;onSeedConsumed:()=>void}){
 const path='/tasks/'+encodeURIComponent(taskId)+'/assertions',load=useLoad<Envelope<Ledger>>(api,path),action=useAction();
 const [dispute,setDispute]=useState<AssertionView|null>(null),[against,setAgainst]=useState('');
 const [editor,setEditor]=useState<{replace?:AssertionView;seed?:AssertionSeed}|null>(null);
 useEffect(()=>{if(seed){setEditor({seed});onSeedConsumed();}},[seed,onSeedConsumed]);
 const refresh=()=>{load.reload();onSaved();};const value=load.data?.data;
 return <section className="panel" aria-labelledby="assertion-heading">
  <div className="page-heading"><h2 id="assertion-heading">Decisions and constraints</h2><button className="quiet" disabled={!value||load.loading} onClick={()=>setEditor({})}>Add decision or constraint</button></div>
  <p>Use the same topic for competing choices. Candidates do not override confirmed instructions. Replace entries explicitly to resolve a conflict.</p>
  <ErrorNotice error={load.error??action.error}/>
  {value?.conflicts.length? <div role="alert" className="notice error">Unresolved decisions block continuation: {[...new Set(value.conflicts.map(c=>c.topic))].join(', ')}. Replace the competing entries or reject an outdated one.</div>:null}
  {value?.entries.some(e=>e.state==='confirmed'&&e.applicability==='unknown')&&<p role="alert" className="notice">A confirmed entry has unknown applicability. Replace it with a reviewed scope before continuing.</p>}
  {value?.entries.filter(e=>e.state==='confirmed'||e.state==='candidate').map(entry=><article className="event" key={entry.id}>
   <h3>{entry.topic} · {entry.kind}</h3><StatusBadge>{entry.state}</StatusBadge><p className="preserve">{entry.text}</p>
   <p className="hint">{entry.scope.workspaceId?'Selected workspace':'Entire task'}{entry.scope.path?' · '+entry.scope.path:''} · applicability {entry.applicability} · origin {entry.origin}</p>
   {entry.source&&<p>{entry.sourceAvailability==='unavailable'?'Source unavailable; saved confirmation retained.':'Indexed evidence; original content has not been reverified.'} <button className="quiet" disabled={entry.sourceAvailability==='unavailable'} onClick={()=>onEvidence(entry.source!)}>View assertion evidence</button></p>}
   <div className="actions">{entry.state==='confirmed'&&<button className="quiet" onClick={()=>{setDispute(entry);setAgainst('');}}>Mark a conflict with “{entry.topic}”</button>}<button className="quiet" onClick={()=>setEditor({replace:entry})}>Replace “{entry.topic}”</button>
   {entry.state==='candidate'&&<button disabled={action.busy||load.loading} onClick={()=>void action.run(async()=>{await api.request(path+'/'+entry.id,'POST',{expectedRevision:value.taskRevision,state:'confirmed'});refresh();})}>Confirm “{entry.topic}”</button>}
   <button className="quiet" disabled={action.busy||load.loading} onClick={()=>void action.run(async()=>{await api.request(path+'/'+entry.id,'POST',{expectedRevision:value.taskRevision,state:'rejected'});refresh();})}>Reject “{entry.topic}”</button></div>
  </article>)}
  {value&&!value.entries.length&&<p>No decision entries recorded.</p>}
  {value&&value.history.length>0&&<details><summary>Revision history ({value.history.length})</summary>{value.history.map(entry=><p className="preserve" key={entry.id+':'+entry.revision}>{entry.topic} · {entry.state} · revision {entry.revision}: {entry.text}</p>)}</details>}
  {dispute&&value&&<Modal title="Mark conflicting entries" onClose={()=>setDispute(null)}><p>{dispute.text}</p><label>Conflicting entry<select value={against} onChange={e=>setAgainst(e.target.value)}><option value="">Choose another confirmed entry</option>{value.entries.filter(e=>e.id!==dispute.id&&e.state==='confirmed').map(e=><option key={e.id} value={e.id}>{e.topic}: {e.text}</option>)}</select></label><p>Both entries remain visible. This blocks continuation until one is explicitly rejected or replaced.</p><ErrorNotice error={action.error} focus/><button disabled={!against||action.busy} onClick={()=>void action.run(async()=>{await api.request('/tasks/'+taskId+'/assertion-conflicts','POST',{expectedRevision:value.taskRevision,ids:[dispute.id,against]});setDispute(null);refresh();})}>Record conflict</button></Modal>}
  {editor&&value&&<AssertionEditor api={api} path={path} projectId={projectId} ledger={value} {...editor} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);refresh();}}/>}
 </section>;
}
function AssertionEditor({api,path,projectId,ledger,replace,seed,onClose,onSaved}:{api:ApiClient;path:string;projectId:string;ledger:Ledger;replace?:AssertionView;seed?:AssertionSeed;onClose:()=>void;onSaved:()=>void}){
 const [revision,setRevision]=useState(ledger.taskRevision),[current,setCurrent]=useState(ledger);
 const [draft,setDraft]=useState<AssertionInput>({kind:replace?.kind??'decision',topic:replace?.topic??'general',text:seed?.text.slice(0,2000)??replace?.text??'',scope:replace?.scope??{workspaceId:null,path:null},confirmed:false,applicability:replace?.applicability??'applicable',supersedes:replace?[replace.id]:[],source:seed?.source??null});
 const action=useAction(),workspaces=useLoad<Envelope<Workspace[]>>(api,'/workspaces?projectId='+encodeURIComponent(projectId));
 const [touched,setTouched]=useState(false);
 const change=(patch:Partial<AssertionInput>)=>{setTouched(true);setDraft({...draft,...patch});};
 useEffect(()=>{if(!touched)return;const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};addEventListener('beforeunload',prevent);return()=>removeEventListener('beforeunload',prevent);},[touched]);
 return <Modal title={replace?'Replace decision or constraint':'Add decision or constraint'} onClose={()=>{if(touched&&!window.confirm('Discard unsaved assertion?'))return false;onClose();}}>
  <form onSubmit={event=>{event.preventDefault();void action.run(async()=>{
   const text=redactSecrets(draft.text).text,topic=redactSecrets(draft.topic).text;
   if(text!==draft.text||topic!==draft.topic){setDraft({...draft,text,topic,confirmed:false});throw new Error('Credentials were removed. Review the text and confirm again.');}
   await api.request(path,'POST',{expectedRevision:revision,assertion:draft});onSaved();
  });}}>
   <label>Entry type<select value={draft.kind} onChange={e=>change({kind:e.target.value as 'decision'|'constraint',supersedes:[]})}><option value="decision">Decision</option><option value="constraint">Constraint</option></select></label>
   <label>Decision topic<input autoFocus required maxLength={80} value={draft.topic} onChange={e=>change({topic:e.target.value,supersedes:[]})}/></label>
   <p className="hint">For example “database choice”. Different topics are not automatically checked for contradictions.</p>
   <label htmlFor="assertion-text">Decision text</label><textarea id="assertion-text" required maxLength={2000} rows={4} value={draft.text} onChange={e=>change({text:e.target.value})}/>
   <label>Applies to<select value={draft.scope.workspaceId??''} onChange={e=>change({scope:{workspaceId:e.target.value||null,path:null},supersedes:[]})}><option value="">Entire task</option>{workspaces.data?.data.map(w=><option key={w.id} value={w.id}>{w.canonicalRoot}</option>)}</select></label>
   {draft.scope.workspaceId&&<label>Relative file or directory (optional)<input value={draft.scope.path??''} onChange={e=>change({scope:{...draft.scope,path:e.target.value||null},supersedes:[]})}/></label>}
   <label>Applicability<select value={draft.applicability} onChange={e=>change({applicability:e.target.value as 'applicable'|'unknown'})}><option value="applicable">Applies to the selected scope</option><option value="unknown">Needs review</option></select></label>
   <fieldset><legend>Explicitly replace these entries</legend>{current.entries.filter(e=>['candidate','confirmed'].includes(e.state)&&e.topic===draft.topic&&e.kind===draft.kind&&e.scope.workspaceId===draft.scope.workspaceId&&e.scope.path===draft.scope.path).map(entry=><label key={entry.id}><input type="checkbox" checked={draft.supersedes?.includes(entry.id)??false} onChange={e=>change({supersedes:e.target.checked?[...(draft.supersedes??[]),entry.id]:draft.supersedes?.filter(id=>id!==entry.id)})}/>{entry.text}</label>)}</fieldset>
   <label><input type="checkbox" checked={draft.confirmed} onChange={e=>change({confirmed:e.target.checked})}/>I confirm this as a current decision or constraint</label>
   <p className="hint">Leave unchecked to save a candidate. Replacement requires confirmation. Existing manual task constraints remain in force.</p>
   <ErrorNotice error={action.error??workspaces.error} focus/>
   {action.error instanceof ApiError&&action.error.code==='REVISION_CONFLICT'&&<button type="button" className="quiet" onClick={()=>void action.run(async()=>{const latest=await api.request<Envelope<Ledger>>(path);setCurrent(latest.data);setRevision(latest.data.taskRevision);})}>Refresh baseline and keep draft</button>}
   <button disabled={action.busy}>Save assertion</button>
  </form>
 </Modal>;
}
