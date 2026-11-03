import type Database from 'better-sqlite3';
import { canonicalDigest, controlEventEnvelopeSchema } from '../control-plane/contracts.js';
import { privateControlKey, protectControlEvent } from '../control-plane/privacy.js';

/** Scrub valid historical observations without changing their original retry digest. */
export function scrubLegacyControlEvents(db: Database.Database): void {
  const read = db.prepare('SELECT sequence,event_id,idempotency_key,event_json FROM control_events WHERE sequence>? ORDER BY sequence LIMIT 250');
  const usedEvent = db.prepare('SELECT 1 FROM control_events WHERE event_id=?');
  const usedKey = db.prepare('SELECT 1 FROM control_events WHERE idempotency_key=?');
  const update = db.prepare('UPDATE control_events SET event_json=?,event_id=?,idempotency_key=? WHERE sequence=?');
  const redactType = db.prepare("UPDATE control_events SET event_json=json_set(event_json,'$.type',?) WHERE sequence=?");
  const unlink = db.prepare('DELETE FROM control_event_evidence WHERE event_id=?');
  const link = db.prepare('INSERT OR IGNORE INTO control_event_evidence(event_id,evidence_id) VALUES(?,?)');
  let cursor=0;
  for (;;) {
    const rows=read.all(cursor) as {sequence:number;event_id:string;idempotency_key:string|null;event_json:string}[];
    if (!rows.length) return;
    for (const row of rows) {
      cursor=row.sequence;
      const raw:unknown=JSON.parse(row.event_json);
      const original=controlEventEnvelopeSchema.safeParse(raw);
      if (!original.success) {
        // Preserve malformed rows for replay quarantine while still cleaning
        // their type if it is a recognized credential.
        if(raw && typeof raw==='object' && 'type' in raw && typeof raw.type==='string'){
          const protectedType=privateControlKey(raw.type);
          if(protectedType!==raw.type)redactType.run(protectedType,row.sequence);
        }
        continue;
      }
      const event=protectControlEvent(original.data);
      if (canonicalDigest(event)===canonicalDigest(original.data)) continue;
      // Preserve physical identity in the rare case of a legacy key already
      // using the opaque replacement. The public envelope stays protected.
      const id=event.eventId===row.event_id || usedEvent.get(event.eventId) ? row.event_id : event.eventId;
      const key=row.idempotency_key===null ? null : privateControlKey(row.idempotency_key);
      const idem=key===row.idempotency_key || key!==null && !usedKey.get(key) ? key : null;
      unlink.run(row.event_id);
      update.run(JSON.stringify(event),id,idem,row.sequence);
      for(const evidenceId of event.evidenceIds)link.run(id,evidenceId);
    }
  }
}
