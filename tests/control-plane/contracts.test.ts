import { describe, expect, it } from 'vitest';
import { controlEventSchema, canonicalDigest, redactControlPayload, contextManifestSchema, receiptInputSchema } from '../../src/control-plane/contracts.js';

describe('control plane contracts', () => {
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
