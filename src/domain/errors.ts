/** Domain failures carry a safe message, never raw input or source paths. */
export class DomainError extends Error {
  readonly retryable = false;

  constructor(readonly code: 'INVALID_INPUT', message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
