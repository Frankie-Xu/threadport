import type Database from 'better-sqlite3';
/** Synthetic projection only; deliberately unrelated private bodies must never be searched. */
export function seedSearchCapacity(db:Database.Database):{sessions:number;events:number;searchBytes:number}{
 let searchBytes=0;
 db.transaction(()=>{
  db.prepare('INSERT INTO sources VALUES(?,?,?,?,?)').run('capacity','codex','[]',1,'synthetic');
  db.prepare('INSERT INTO projects VALUES(?,?)').run('capacity','Capacity');
  const session=db.prepare('INSERT INTO sessions(id,source_id,project_id,last_event_at,metadata_json) VALUES(?,?,?,?,?)');
  const event=db.prepare('INSERT INTO events VALUES(?,?,?,?,?)');
  const projection=db.prepare(`INSERT INTO session_search(session_id,search_text,dirty)
    SELECT ?,COALESCE((SELECT group_concat(search_text,char(10)) FROM (SELECT search_text FROM events WHERE session_id=? ORDER BY ordinal)),''),0
    ON CONFLICT(session_id) DO UPDATE SET search_text=excluded.search_text,dirty=0`);
  for(let s=0;s<500;s++){
   const id=`capacity-${String(s).padStart(3,'0')}`;session.run(id,'capacity','capacity',`2026-09-${String(1+s%14).padStart(2,'0')}T00:00:00.000Z`,'{}');
   for(let e=0;e<100;e++){
    const text=`支付回调 checkout retry session-${s} step-${e} src/module-${s%20}/index.ts\n`+'Synthetic visible task history for deterministic literal search. '.repeat(4);
    searchBytes+=Buffer.byteLength(text);event.run(`${id}-${e}`,id,e,'{"hidden":"capacity-hidden-canary"}',text);
   }
   projection.run(id,id);
  }
 })();return {sessions:500,events:50000,searchBytes};
}
export const capacityQueries=Array.from({length:100},(_,i)=>['支付回调', 'CHECKOUT retry', `src/module-${i%20}/index.ts`, `session-${i} step-99`, 'no-such-needle'][i%5]);
