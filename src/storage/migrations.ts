import { readFile, mkdtemp, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { DomainError } from '../domain/errors.js';
import { privateDirectory } from '../platform/paths.js';
export const SCHEMA_VERSION = 1;
export interface Migration { version: number; sql: string }
export function storageError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const code = (error as { code?: string })?.code;
  return new DomainError(code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' ? 'STORAGE_BUSY' : 'IO_FAILED',
    code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' ? 'Storage is busy; retry the short transaction.' : 'Storage operation failed; existing data was retained.');
}
export async function migrate(db: Database.Database, dataDir: string, supplied?: readonly Migration[]): Promise<void> {
  const migrations = supplied ?? [{ version: 1, sql: await readFile(new URL('../../migrations/001-initial.sql', import.meta.url), 'utf8').catch(async () => readFile(new URL('../../../migrations/001-initial.sql', import.meta.url), 'utf8')) }];
  const current = db.pragma('user_version', { simple: true }) as number;
  const target = migrations.at(-1)?.version ?? SCHEMA_VERSION;
  if (current > target) throw new DomainError('MIGRATION_FAILED', 'Database is newer than this application; use a compatible version.');
  const pending = migrations.filter(item => item.version > current);
  if (!pending.length) return;
  if (pending.some((item, i) => item.version !== current + i + 1)) throw new DomainError('MIGRATION_FAILED', 'Migration sequence is invalid.');
  let backupDirectory: string | undefined;
  try {
    await privateDirectory(join(dataDir, 'backups'));
    backupDirectory = await mkdtemp(join(dataDir, 'backups', `v${current}-`));
    await db.backup(join(backupDirectory, 'backup.sqlite'));
    if (process.platform !== 'win32') await chmod(join(backupDirectory, 'backup.sqlite'), 0o600);
    db.transaction(() => {
      if (db.pragma('user_version', { simple: true }) !== current) throw new Error('Concurrent migration; reopen.');
      for (const item of pending) { db.exec(item.sql); db.pragma(`user_version = ${item.version}`); }
    }).immediate();
  } catch (error) {
    const translated = storageError(error);
    if (translated.code === 'STORAGE_BUSY') throw translated;
    throw new DomainError('MIGRATION_FAILED', `Migration failed; existing database retained. Inspect the application data backups directory${backupDirectory ? ' for the pre-migration backup' : ''}; stop the service before recovery.`);
  }
}
