import type { Assertion,AssertionView } from './contracts.js';
export function overlaps(a:Assertion['scope'],b:Assertion['scope']):boolean{
 if(a.workspaceId&&b.workspaceId&&a.workspaceId!==b.workspaceId)return false;
 return !a.path||!b.path||a.path===b.path||a.path.startsWith(b.path+'/')||b.path.startsWith(a.path+'/');
}
/** Explicit topics identify competing choices. No semantic contradiction inference or last-write winner. */
export function compileAssertions<T extends Assertion|AssertionView>(entries:T[],workspaceId?:string){
 const scoped=entries.filter(e=>!workspaceId||!e.scope.workspaceId||e.scope.workspaceId===workspaceId);
 const active=scoped.filter(e=>e.state==='confirmed');
 const conflicts:{topic:string;ids:string[]}[]=[];
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
  const a=active[i],b=active[j];if(overlaps(a.scope,b.scope)&&((a.kind===b.kind&&a.topic===b.topic&&a.text!==b.text)||a.disputedWith.includes(b.id)||b.disputedWith.includes(a.id)))conflicts.push({topic:a.topic,ids:[a.id,b.id]});
 }
 const disputed=new Set(conflicts.flatMap(c=>c.ids));
 const effective=active.filter(e=>!disputed.has(e.id)&&e.applicability==='applicable');
 return {decisions:effective.filter(e=>e.kind==='decision'),constraints:effective.filter(e=>e.kind==='constraint'),candidates:scoped.filter(e=>e.state==='candidate'),conflicts,uncertain:active.filter(e=>e.applicability==='unknown')};
}
