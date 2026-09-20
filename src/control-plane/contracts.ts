import { createHash } from 'node:crypto';
import { z } from 'zod';

export const controlIdSchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9][A-Za-z0-9:._-]*$/);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const isoDate = z.string().datetime({ offset: true });

const forbiddenKey = /(?:token|secret|password|api[-_]?key|authorization|cookie|reasoning|system[-_ ]?prompt|raw[-_ ]?log|source[-_ ]?path|absolute[-_ ]?path|private[-_ ]?key)/i;
const absolutePath = /^(?:[A-Za-z]:[\\/]|[\\]{2}|\/)/;
export type SafePayload = null | boolean | number | string | SafePayload[] | { [key: string]: SafePayload };
function safePayload(value: unknown, seen = new Set<unknown>()): SafePayload {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) throw new Error('Unsafe payload number.');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 32_768 || absolutePath.test(value)) throw new Error('Unsafe payload string.');
    return value;
  }
  if (typeof value !== 'object' || seen.has(value)) throw new Error('Unsafe payload value.');
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 512) throw new Error('Payload array is too large.');
    return value.map(item => safePayload(item, seen));
  }
  const result: Record<string, SafePayload> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 128) throw new Error('Payload object is too large.');
  for (const [key, item] of entries) {
    if (key.length > 128 || forbiddenKey.test(key)) throw new Error('Payload contains a forbidden field.');
    result[key] = safePayload(item, seen);
  }
  seen.delete(value);
  return result;
}
export const safePayloadSchema = z.unknown().transform(value => safePayload(value));

export const sourceSchema = z.object({
  kind: z.enum(['source-log', 'runtime', 'threadport', 'user', 'agent-report']),
  sourceId: controlIdSchema,
  parserVersion: z.string().max(128).nullable(),
  coverage: z.enum(['full', 'partial', 'none', 'unknown'])
}).strict();

export const controlEventSchema = z.object({
  eventId: controlIdSchema,
  protocol: z.literal('threadport.control-event.v1'),
  occurredAt: isoDate.nullable(),
  recordedAt: isoDate,
  source: sourceSchema,
  taskId: controlIdSchema.nullable(),
  sessionId: controlIdSchema.nullable(),
  runId: controlIdSchema.nullable(),
  ordinal: z.number().int().nonnegative().safe().nullable(),
  type: z.string().min(1).max(160).regex(/^[a-z][a-z0-9_.:-]*$/),
  payload: safePayloadSchema,
  idempotencyKey: z.string().min(1).max(512).nullable(),
  evidenceIds: z.array(controlIdSchema).max(128)
}).strict().superRefine((value, ctx) => {
  const payload = value.payload;
  const known = value.type === 'lineage.relation' ? ['parentSessionId','childSessionId','relation','evidenceLevel','status','id']
    : value.type.startsWith('run.') ? ['reason','exitCode']
    : value.type.startsWith('responsibility.') ? ['id','responsibilityId','taskId','ownerSessionId','scope','roles']
    : value.type.startsWith('receipt.') ? ['receiptId','handoffId','targetSessionId','targetRunId','manifestDigest','stage','nonce','expiresAt','status','receipt']
    : value.type.startsWith('attention.') ? ['id','kind','severity','message']
    : value.type === 'manifest.saved' ? ['handoffId','manifest']
    : value.type.startsWith('handoff.') ? ['handoffId','targetSessionId','targetRunId']
    : value.type.startsWith('takeover.') ? ['takeoverId','runId','status','successorSessionId'] : null;
  if (known && payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    for (const key of Object.keys(payload as Record<string, unknown>)) if (!known.includes(key)) ctx.addIssue({ code: z.ZodIssueCode.unrecognized_keys, keys: [key], path: ['payload'] });
  }
});
export type ControlEvent = z.infer<typeof controlEventSchema>;

export const manifestStatusSchema = z.enum(['included', 'summarized', 'filtered', 'omitted', 'unavailable']);
const manifestItemSchema = z.object({
  key: z.string().min(1).max(160), status: manifestStatusSchema, digest: digestSchema.nullable(),
  evidenceIds: z.array(controlIdSchema).max(128), reason: z.string().max(2000).nullable(), readable: z.boolean()
}).strict();
const constraintSchema = z.object({
  key: z.string().min(1).max(160), text: z.string().max(4000).nullable(), priority: z.enum(['must', 'should', 'may', 'unknown']),
  scope: z.string().min(1).max(160), status: manifestStatusSchema, evidenceIds: z.array(controlIdSchema).max(128), readable: z.boolean()
}).strict();
export const contextManifestSchema = z.object({
  protocol: z.literal('threadport.context-manifest.v1'), handoffId: controlIdSchema, taskId: controlIdSchema,
  taskRevision: z.number().int().positive().safe(), createdAt: isoDate, digest: digestSchema,
  targetSessionId: controlIdSchema.optional(), targetRunId: controlIdSchema.optional(),
  items: z.array(manifestItemSchema).max(256), constraints: z.array(constraintSchema).max(128)
}).strict();
export type ContextManifestV1 = z.infer<typeof contextManifestSchema>;

export const receiptStageSchema = z.enum(['prepared', 'authorized', 'transported', 'received', 'accepted', 'observed-start', 'reported-complete', 'verified-complete']);
export const receiptStatusSchema = z.enum(['pending', 'confirmed', 'rejected', 'unknown', 'expired']);
export const receiptInputSchema = z.object({
  handoffId: controlIdSchema, targetSessionId: controlIdSchema, targetRunId: controlIdSchema,
  manifestDigest: digestSchema, stage: receiptStageSchema,
  nonce: z.string().min(16).max(256).regex(/^[A-Za-z0-9._:-]+$/), expiresAt: isoDate
}).strict();
export type ReceiptInput = z.infer<typeof receiptInputSchema>;
export const receiptSummarySchema = receiptInputSchema.extend({
  receiptId: controlIdSchema, status: receiptStatusSchema, createdAt: isoDate, confirmedAt: isoDate.nullable(), evidenceIds: z.array(controlIdSchema).max(128)
}).strict();
export type ReceiptSummary = z.infer<typeof receiptSummarySchema>;

export type RunFact = 'running' | 'waiting' | 'interrupted' | 'ended' | 'unknown';
export type ObservationHealth = 'current' | 'stale' | 'missing-receipt' | 'coverage-gap' | 'unverified';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function canonicalDigest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }

export function redactControlPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactControlPayload);
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = forbiddenKey.test(key) || (key.toLowerCase().includes('path') && typeof item === 'string' && absolutePath.test(item)) ? '[REDACTED]' : redactControlPayload(item);
    }
    return output;
  }
  return value;
}

export const controlEvent = (input: unknown): ControlEvent => controlEventSchema.parse(input);
export const parseManifest = (input: unknown): ContextManifestV1 => contextManifestSchema.parse(input);
export const parseReceiptInput = (input: unknown): ReceiptInput => receiptInputSchema.parse(input);
