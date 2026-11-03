import { publicText } from '../privacy.js';
import { redactSecrets } from '../redact.js';
import { canonicalDigest, controlIdSchema, contextManifestSchema, type ContextManifestV1, type ControlEvent, type SafePayload } from './contracts.js';

export function privateControlKey(value: string): string {
  return redactSecrets(value).count ? `redacted-${canonicalDigest(value)}` : value;
}
const publicField = (value: string): string => publicText(value).slice(0, 32768);
function publicPayload(value: SafePayload): SafePayload {
  if (typeof value === 'string') return controlIdSchema.safeParse(value).success ? privateControlKey(value) : publicField(value);
  if (Array.isArray(value)) return value.map(publicPayload);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, field])=>[privateControlKey(key),publicPayload(field)]));
  return value;
}
export function isPublicManifest(manifest: ContextManifestV1): boolean {
  return [manifest.handoffId,manifest.taskId,manifest.targetSessionId,manifest.targetRunId,
    ...manifest.items.flatMap(item=>[item.key,item.reason,...item.evidenceIds]),
    ...manifest.constraints.flatMap(item=>[item.key,item.scope,item.text,...item.evidenceIds]),
  ].every(value=>value==null||publicText(value)===value);
}
export function protectControlEvent(event: ControlEvent): ControlEvent {
  let payload=publicPayload(event.payload);
  if (event.type==='manifest.saved' && event.payload && typeof event.payload==='object' && !Array.isArray(event.payload)
    && payload && typeof payload==='object' && !Array.isArray(payload) && 'manifest' in event.payload) {
    const original=contextManifestSchema.safeParse(event.payload.manifest);
    // An edited body cannot stand behind the original manifest digest.
    payload.manifest=original.success && isPublicManifest(original.data) ? event.payload.manifest : null;
  }
  if (payload && typeof payload==='object' && !Array.isArray(payload)) {
    // Redaction of a machine path can expand the display string. Preserve
    // the field's public size limit so a protected row can still be replayed.
    const fields=payload;
    const clamp=(field:string,max:number)=>{
      const value=fields[field];
      if(typeof value==='string')fields[field]=value.slice(0,max);
    };
    if(event.type.startsWith('attention.')){clamp('kind',160);clamp('message',2000);}
    else if(event.type.startsWith('responsibility.'))clamp('scope',160);
    else if(event.type.startsWith('run.'))clamp('reason',2000);
  }
  const key=(value:string|null)=>value===null?null:privateControlKey(value);
  return {...event,type:privateControlKey(event.type),payload,eventId:privateControlKey(event.eventId),taskId:key(event.taskId),sessionId:key(event.sessionId),runId:key(event.runId),
    idempotencyKey:key(event.idempotencyKey),evidenceIds:event.evidenceIds.map(privateControlKey),
    source:{...event.source,sourceId:privateControlKey(event.source.sourceId),parserVersion:event.source.parserVersion===null?null:publicField(event.source.parserVersion).slice(0,128)},
  };
}
