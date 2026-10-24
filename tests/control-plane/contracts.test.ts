import { describe, expect, it } from 'vitest';
import { createContextManifest } from '../../src/control-plane/manifest.js';
import { controlEventSchema, canonicalDigest, redactControlPayload, contextManifestSchema, receiptInputSchema, safePayloadSchema } from '../../src/control-plane/contracts.js';

describe('control plane contracts', () => {
  it('rejects impossible timezone offsets in control events and receipt expiry',()=>{
    for(const value of ['2026-10-25T00:00:00+99:99','2026-10-25T00:00:00+02:60']){
      expect(controlEventSchema.safeParse({...base,recordedAt:value}).success).toBe(false);
      expect(receiptInputSchema.safeParse({handoffId:'h',targetSessionId:'s',targetRunId:'r',manifestDigest:'a'.repeat(64),stage:'received',nonce:'timestamp-nonce-1234',expiresAt:value}).success).toBe(false);
    }
  });
  it('requires a complete prepared target and rejects supplied empty identities',()=>{
    const base={handoffId:'binding',taskId:'task',taskRevision:1};
    for(const target of [{targetSessionId:'s'},{targetRunId:'r'},{targetSessionId:'',targetRunId:''},{targetSessionId:'s',targetRunId:''}])expect(()=>createContextManifest({...base,...target})).toThrow();
    expect(createContextManifest(base).targetSessionId).toBeUndefined();
    expect(createContextManifest({...base,targetSessionId:'s',targetRunId:'r'})).toMatchObject({targetSessionId:'s',targetRunId:'r'});
  });
  it('rejects ambiguous duplicate manifest keys while keeping section namespaces distinct',()=>{
    const base={handoffId:'unique',taskId:'task',taskRevision:1};
    for(const field of ['items','constraints'])expect(()=>createContextManifest({...base,[field]:[{key:'same',text:'first'},{key:'same',text:'different'}]})).toThrow();
    const manifest=createContextManifest({...base,items:[{key:'same',text:'item'}],constraints:[{key:'same',text:'constraint'}]});
    expect(manifest.items[0].key).toBe('same');expect(manifest.constraints[0].key).toBe('same');
  });
  it('returns schema errors for cyclic, deep, oversized and non-JSON payloads',()=>{
    const cycle:Record<string,unknown>={};cycle.self=cycle;
    let deep:unknown='leaf';for(let i=0;i<40;i++)deep={child:deep};
    for(const value of [cycle,deep,Array.from({length:100},()=>Array(100).fill(1)),new Date(),{token:'private'}]){
      const parsed=safePayloadSchema.safeParse(value);expect(parsed.success).toBe(false);
      if(!parsed.success)expect(parsed.error.issues[0].message).toBe('Invalid or oversized control payload.');
    }
  });
  it('accepts shared acyclic containers and preserves own JSON keys',()=>{
    const shared=['value'];expect(safePayloadSchema.parse({a:shared,b:shared})).toEqual({a:['value'],b:['value']});
    const input=JSON.parse('{"__proto__":{"flag":1},"value":2}');const parsed=safePayloadSchema.parse(input);
    expect(Object.prototype.hasOwnProperty.call(parsed,'__proto__')).toBe(true);
    expect(canonicalDigest(parsed)).toBe(canonicalDigest(input));
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });
  const base = {
    eventId: 'evt-1', protocol: 'threadport.control-event.v1' as const,
    occurredAt: null, recordedAt: '2026-09-20T00:00:00.000Z',
    source: { kind: 'threadport' as const, sourceId: 'tp', parserVersion: '1', coverage: 'full' as const },
    taskId: 'task-1', sessionId: 'session-1', runId: 'run-1', ordinal: 0,
    type: 'handoff.prepared', payload: { handoffId: 'h-1' }, idempotencyKey: 'key-1', evidenceIds: ['e-1']
  };
  it('accepts a valid event and rejects unknown fields', () => {
    expect(controlEventSchema.parse(base)).toEqual(base);
    expect(() => controlEventSchema.parse({ ...base, hiddenReasoning: 'secret' })).toThrow();
    expect(() => controlEventSchema.parse({ ...base, payload: { token: 'abc' } })).toThrow();
    expect(() => controlEventSchema.parse({ ...base, type: 'run.started', payload: { unexpected: true } })).toThrow();
    expect(() => controlEventSchema.parse({ ...base, type: 'run.started', payload: { reasoning: 'do not persist' } })).toThrow();
  });
  it('canonical digest is stable across object key order', () => {
    expect(canonicalDigest({ b: 2, a: 1 })).toBe(canonicalDigest({ a: 1, b: 2 }));
  });
  it('redacts secrets and absolute paths from payloads', () => {
    const result = redactControlPayload({ token: 'secret', apiKey: 'x', path: 'C:\\Users\\alice\\repo', text: 'keep' });
    expect(result).toEqual({ token: '[REDACTED]', apiKey: '[REDACTED]', path: '[REDACTED]', text: 'keep' });
  });
  it('validates manifest entries and receipt target/digest/nonce', () => {
    const manifest = contextManifestSchema.parse({
      protocol: 'threadport.context-manifest.v1', handoffId: 'h-1', taskId: 'task-1', taskRevision: 1,
      createdAt: '2026-09-20T00:00:00.000Z', digest: 'a'.repeat(64),
      items: [{ key: 'objective', status: 'included', digest: 'b'.repeat(64), evidenceIds: ['e-1'], reason: null, readable: true }],
      constraints: [{ key: 'no-upload', text: 'Do not upload', priority: 'must', scope: 'task', status: 'included', evidenceIds: ['e-1'], readable: true }]
    });
    expect(manifest.items[0].status).toBe('included');
    expect(() => receiptInputSchema.parse({ handoffId: 'h-1', targetSessionId: 's-1', targetRunId: 'r-1', manifestDigest: 'a'.repeat(64), stage: 'received', nonce: 'short', expiresAt: '2026-09-20T00:00:00.000Z' })).toThrow();
  });
  it('round trips an optional prepared target binding', () => {
    const manifest = contextManifestSchema.parse({
      protocol: 'threadport.context-manifest.v1', handoffId: 'h-target', taskId: 'task-1', taskRevision: 1,
      createdAt: '2026-09-20T00:00:00.000Z', digest: 'a'.repeat(64), targetSessionId: 's-1', targetRunId: 'r-1', items: [], constraints: []
    });
    expect(manifest.targetSessionId).toBe('s-1');
    expect(manifest.targetRunId).toBe('r-1');
  });
  it('redacts secrets from manifest text before digesting it', async () => {
    const { createContextManifest } = await import('../../src/control-plane/manifest.js');
    const manifest = createContextManifest({ handoffId: 'h-secret', taskId: 'task-1', taskRevision: 1, items: [{ key: 'note', text: 'api_key=super-secret-value' }], constraints: [{ key: 'guardrail', text: 'password=super-secret-value', priority: 'must', scope: 'task' }] });
    expect(manifest.items[0].digest).toBeTruthy();
    expect(JSON.stringify(manifest)).not.toContain('super-secret-value');
    expect(manifest.constraints[0].text).toContain('[REDACTED]');
  });
});
