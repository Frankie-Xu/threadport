/** Domain failures carry a safe message, never raw input or source paths. */
export class DomainError extends Error {
  get retryable(): boolean { return this.code === 'STORAGE_BUSY' || this.code === 'REVISION_CONFLICT'; }

  constructor(readonly code: 'INVALID_INPUT' | 'STORAGE_BUSY' | 'MIGRATION_FAILED' | 'IO_FAILED' | 'REVISION_CONFLICT' | 'INDEX_STALE' | 'INDEX_LIMIT' | 'NOT_FOUND' | 'PROJECT_MISMATCH' | 'REDACTION_REQUIRED' | 'SEARCH_STALE' | 'TARGET_UNSUPPORTED' | 'TARGET_EXITED' | 'CONTEXT_BUDGET_EXCEEDED' | 'WORKSPACE_BUSY' | 'LAUNCH_STATE_UNKNOWN', message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
