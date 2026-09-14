import {DatabaseAccess,trackDatabase} from './access.js';
import Database from 'better-sqlite3';
import { chmod, copyFile, lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { applicationDataDir, privateDirectory } from '../platform/paths.js';
import { migrate, SCHEMA_VERSION, storageError } from './migrations.js';
import { DomainError } from '../domain/errors.js';
export interface DatabaseOptions { dataDir?: string }
export async function openDatabase(options: DatabaseOptions = {}): Promise<Database.Database> {
  const dataDir = applicationDataDir(options); let db: Database.Database | undefined;let access:DatabaseAccess|undefined;
  try {
    await privateDirectory(dataDir); access=new DatabaseAccess(dataDir);const path = join(dataDir, 'threadport.sqlite');
    try { const handle = await open(path, 'wx', 0o600); await handle.close(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (process.getuid && info.uid !== process.getuid())) throw new DomainError('IO_FAILED', 'Unsafe database file.');
    if (process.platform !== 'win32') await chmod(path, 0o600);
    db = new Database(path, { timeout: 5000 });
    if ((db.pragma('user_version', { simple: true }) as number) > SCHEMA_VERSION) throw new DomainError('MIGRATION_FAILED', 'Database is newer than this application; use a compatible version.');
    db.pragma('foreign_keys = ON'); db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
    await migrate(db, dataDir);trackDatabase(db,access); return db;
  } catch (error) { db?.close();access?.release(); throw storageError(error); }
}
/** Recovery creates a fresh destination only. Stop the service and explicitly switch data directories afterwards. */
export async function restoreBackup(backup: string, dataDir: string): Promise<void> {
  let check: Database.Database | undefined;
  try {
    check = new Database(backup, { readonly: true, fileMustExist: true });
    if (check.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Invalid backup');
    check.close(); check = undefined;
    await privateDirectory(dataDir);
    await copyFile(backup, join(dataDir, 'threadport.sqlite'), constants.COPYFILE_EXCL);
    if (process.platform !== 'win32') await chmod(join(dataDir, 'threadport.sqlite'), 0o600);
  } catch (error) { throw storageError(error); } finally { check?.close(); }
}
