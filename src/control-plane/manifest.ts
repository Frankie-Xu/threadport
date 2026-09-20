import { canonicalDigest, contextManifestSchema, type ContextManifestV1, digestSchema } from './contracts.js';
import { DomainError } from '../domain/errors.js';
import { publicText } from '../privacy.js';
export interface ManifestClaim { key: string; text?: string|null; status?: 'included'|'summarized'|'filtered'|'omitted'|'unavailable'; evidenceIds?: string[]; reason?: string|null; readable?: boolean; digest?: string|null }
export interface ManifestInput { handoffId: string; taskId: string; taskRevision: number; targetSessionId?: string; targetRunId?: string; createdAt?: string; items?: readonly ManifestClaim[]; constraints?: readonly (ManifestClaim & { priority?: 'must'|'should'|'may'|'unknown'; scope?: string })[] }
export function createContextManifest(input: ManifestInput): ContextManifestV1 {
  const items = (input.items ?? []).map(item => ({ key:item.key, status:item.status ?? 'included', digest:item.digest ?? (item.text ? canonicalDigest(publicText(item.text)) : null), evidenceIds:[...(item.evidenceIds ?? [])], reason:item.reason == null ? null : publicText(item.reason), readable:item.readable ?? true }));
  const constraints = (input.constraints ?? []).map(item => ({ key:item.key, text:item.text == null ? null : publicText(item.text), priority:item.priority ?? 'unknown', scope:item.scope ?? 'task', status:item.status ?? 'included', evidenceIds:[...(item.evidenceIds ?? [])], readable:item.readable ?? !!item.text }));
  const draft = { protocol:'threadport.context-manifest.v1' as const, handoffId:input.handoffId, taskId:input.taskId, taskRevision:input.taskRevision, ...(input.targetSessionId ? {targetSessionId:input.targetSessionId} : {}), ...(input.targetRunId ? {targetRunId:input.targetRunId} : {}), createdAt:input.createdAt ?? new Date().toISOString(), digest:'0'.repeat(64), items, constraints };
  const digest = canonicalDigest({ ...draft, digest: undefined });
  return contextManifestSchema.parse({ ...draft, digest });
}
export function manifestDigest(manifest: ContextManifestV1): string { const parsed = contextManifestSchema.parse(manifest); return canonicalDigest({ ...parsed, digest: undefined }); }
export function assertManifestDigest(manifest: ContextManifestV1): void { if (manifestDigest(manifest) !== manifest.digest) throw new DomainError('RECEIPT_DIGEST_MISMATCH','Context manifest digest does not match its contents.'); }
export function compareManifestDigest(manifest: ContextManifestV1, digest: string): boolean { digestSchema.parse(digest); return manifest.digest === digest && manifestDigest(manifest) === digest; }
