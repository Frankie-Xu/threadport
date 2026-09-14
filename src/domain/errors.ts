/** Domain failures carry a safe message, never raw input or source paths. */
export class DomainError extends Error {
  get retryable(): boolean { return this.code === 'STORAGE_BUSY' || this.code === 'REVISION_CONFLICT'; }

  constructor(readonly code: 'INVALID_INPUT' | 'STORAGE_BUSY' | 'MIGRATION_FAILED' | 'IO_FAILED' | 'REVISION_CONFLICT', message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
