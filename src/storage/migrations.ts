import { readFile, mkdtemp, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { DomainError } from '../domain/errors.js';
import { privateDirectory } from '../platform/paths.js';

export const SCHEMA_VERSION = 11;
export interface Migration { version: number; sql: string }

const commonFiles = ['001-initial.sql', '002-index-state.sql', '003-task-management.sql', '004-history-search.sql'];
const mainFiles = ['005-control-plane.sql', '006-session-search-projection.sql'];
const localFiles = ['005-launch-coordination.sql', '006-assertions.sql', '007-execution-observations.sql', '008-search-projection.sql', '009-search-event-projection.sql'].map(name => `legacy-local/${name}`);
const canonicalFiles = [...commonFiles, ...mainFiles, '007-launch-coordination.sql', '008-assertions.sql', '009-execution-observations.sql', '010-unify-search-projection.sql', '011-fold-session-search.sql'];
interface SchemaObject { type: string; name: string; sql: string }
interface Lineage { version: number; local: boolean; objects: SchemaObject[] }
interface Catalog { sql: Map<string, string>; lineages: Lineage[]; names: Set<string> }
let catalogPromise: Promise<Catalog> | undefined;

function schemaObjects(db: Database.Database): SchemaObject[] {
  const objects = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as SchemaObject[];
  // Git may check out migration files with CRLF on Windows. Line endings do not
  // distinguish database lineage and must not block moving a database across OSes.
  return objects.map(object => ({ ...object, sql: object.sql.replaceAll('\r\n', '\n') }));
}

async function loadCatalog(): Promise<Catalog> {
  const sql = new Map(await Promise.all([...new Set([...canonicalFiles, ...localFiles])].map(async name => {
    const content = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8')
      .catch(() => readFile(new URL(`../../../migrations/${name}`, import.meta.url), 'utf8'));
    return [name, content] as const;
  })));
  const lineages: Lineage[] = [];
  for (const local of [false, true]) {
    const reference = new Database(':memory:');
    try {
      const files = local ? [...commonFiles, ...localFiles] : canonicalFiles;
      for (const [index, name] of files.entries()) {
        reference.exec(sql.get(name)!);
        lineages.push({ version: index + 1, local, objects: schemaObjects(reference) });
      }
    } finally { reference.close(); }
  }
  return { sql, lineages, names: new Set(lineages.flatMap(lineage => lineage.objects.map(object => object.name))) };
}

function identifyLineage(db: Database.Database, current: number, catalog: Catalog): Lineage {
  const actual = schemaObjects(db).filter(object => catalog.names.has(object.name));
  const matches = catalog.lineages.filter(lineage => lineage.version === current && JSON.stringify(lineage.objects) === JSON.stringify(actual));
  const match = matches[0];
  if (!match) throw new DomainError('MIGRATION_FAILED', 'Unrecognized database schema lineage; existing database retained. Restore a known backup or use a compatible application.');
  return match;
}

export function storageError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const code = (error as { code?: string })?.code;
  return new DomainError(code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' ? 'STORAGE_BUSY' : 'IO_FAILED',
    code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' ? 'Storage is busy; retry the short transaction.' : 'Storage operation failed; existing data was retained.');
}

export async function migrate(db: Database.Database, dataDir: string, supplied?: readonly Migration[]): Promise<void> {
  const current = db.pragma('user_version', { simple: true }) as number;
  const target = supplied?.at(-1)?.version ?? SCHEMA_VERSION;
  if (current > target) throw new DomainError('MIGRATION_FAILED', 'Database is newer than this application; use a compatible version.');
  let pending: Migration[];
  let catalog: Catalog | undefined;
  if (supplied) {
    pending = supplied.filter(item => item.version > current);
    if (pending.some((item, i) => item.version !== current + i + 1)) throw new DomainError('MIGRATION_FAILED', 'Migration sequence is invalid.');
  } else {
    catalog = await (catalogPromise ??= loadCatalog());
    const lineage = current > 0 ? identifyLineage(db, current, catalog) : undefined;
    if (current === 0 && schemaObjects(db).some(object => catalog!.names.has(object.name))) {
      throw new DomainError('MIGRATION_FAILED', 'Unversioned application schema; existing database retained.');
    }
    if (lineage?.local && current >= 5) {
      // Local v5-v9 reused released main version numbers. Bridge by schema identity,
      // never by relabeling user_version or replaying already-applied local DDL.
      const files = [...mainFiles, ...localFiles.slice(current - 4, 3), '010-unify-search-projection.sql', '011-fold-session-search.sql'];
      pending = [{ version: SCHEMA_VERSION, sql: files.map(name => catalog!.sql.get(name)!).join('\n') }];
    } else {
      pending = canonicalFiles.slice(current).map((name, index) => ({ version: current + index + 1, sql: catalog!.sql.get(name)! }));
    }
  }
  if (!pending.length) return;
  let backupDirectory: string | undefined;
  try {
    await privateDirectory(join(dataDir, 'backups'));
    backupDirectory = await mkdtemp(join(dataDir, 'backups', `v${current}-`));
    await db.backup(join(backupDirectory, 'backup.sqlite'));
    if (process.platform !== 'win32') await chmod(join(backupDirectory, 'backup.sqlite'), 0o600);
    db.transaction(() => {
      if (db.pragma('user_version', { simple: true }) !== current) throw new Error('Concurrent migration; reopen.');
      if (catalog && current > 0) identifyLineage(db, current, catalog);
      for (const item of pending) { db.exec(item.sql); db.pragma(`user_version = ${item.version}`); }
      if (catalog) {
        identifyLineage(db, SCHEMA_VERSION, catalog);
        if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Migration introduced or encountered invalid foreign keys.');
      }
    }).immediate();
  } catch (error) {
    const translated = storageError(error);
    if (translated.code === 'STORAGE_BUSY') throw translated;
    throw new DomainError('MIGRATION_FAILED', `Migration failed; existing database retained. Inspect the application data backups directory${backupDirectory ? ' for the pre-migration backup' : ''}; stop the service before recovery.`);
  }
}
