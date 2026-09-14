import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { Task } from '../domain/models.js';
import { DomainError } from '../domain/errors.js';
import { openDatabase, type DatabaseOptions } from './database.js';
import { IndexStore } from './index-store.js';
const id = z.string().min(1).max(512);
const date = z.string().datetime();
const claim = z.object({ text: z.string(), origin: z.enum(['observed', 'user-confirmed', 'derived', 'unknown']), evidence: z.array(z.object({ sessionId: id, eventId: id }).strict()), updatedAt: date.nullable() }).strict();
const taskSchema = z.object({ id, projectId: id, revision: z.number().int().positive().safe(), title: z.string().min(1), objective: claim, constraints: z.array(claim), nextAction: claim, lifecycle: z.enum(['active', 'paused', 'completed']), archived: z.boolean(), createdAt: date, updatedAt: date }).strict();
function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value); if (!parsed.success) throw new DomainError('INVALID_INPUT', 'Invalid storage input.'); return parsed.data;
}
function page(limit: number, offset: number) {
  validate(z.number().int().min(1).max(1000), limit); validate(z.number().int().nonnegative().safe(), offset);
}
/** Infrastructure boundary. Callers supply already redacted task fields; Store validates shape and atomicity. */
export class SqliteStore extends IndexStore {
  close(): void { this.db.close(); }
  createProject(projectId: string, name: string): void {
    validate(id, projectId); validate(z.string().min(1), name);
    this.run(() => this.db.prepare('INSERT INTO projects(id,name) VALUES (?,?)').run(projectId, name));
  }
  deleteProject(projectId: string): void {
    this.run(() => this.db.prepare('DELETE FROM projects WHERE id=?').run(validate(id, projectId)));
  }
  /** Reserve or retain a session tombstone. Indexer will fill source metadata without REPLACE. */
  saveSession(sessionId: string): void {
    this.run(() => this.db.prepare("INSERT INTO sessions(id,metadata_json) VALUES (?,?) ON CONFLICT(id) DO NOTHING").run(validate(id, sessionId), JSON.stringify({ status: 'missing' })));
  }
  getTask(taskId: string): Task | null {
    return this.run(() => {
      const body = this.db.prepare('SELECT body_json FROM tasks WHERE id=?').pluck().get(validate(id, taskId));
      return body === undefined ? null : validate(taskSchema, JSON.parse(body as string));
    });
  }
  listTasks(limit = 100, offset = 0): Task[] {
    page(limit, offset);
    return this.run(() => (this.db.prepare('SELECT body_json FROM tasks ORDER BY updated_at DESC,id LIMIT ? OFFSET ?').pluck().all(limit, offset) as string[]).map(body => validate(taskSchema, JSON.parse(body))));
  }
  sessionIds(taskId: string): string[] {
    return this.run(() => this.db.prepare('SELECT session_id FROM task_sessions WHERE task_id=? ORDER BY session_id').pluck().all(validate(id, taskId)) as string[]);
  }
  getRevisions(taskId: string, limit = 100, offset = 0): Task[] {
    page(limit, offset);
    return this.run(() => (this.db.prepare('SELECT body_json FROM task_revisions WHERE task_id=? ORDER BY revision DESC LIMIT ? OFFSET ?').pluck().all(validate(id, taskId), limit, offset) as string[]).map(body => validate(taskSchema, JSON.parse(body))));
  }
  /** expectedRevision=0 creates; omitted sessionIds preserves links, [] explicitly detaches all. */
  saveTask(input: Task, expectedRevision: number, sessionIds?: readonly string[]): Task {
    const task = validate(taskSchema, input);
    validate(z.number().int().nonnegative().safe(), expectedRevision);
    if (task.revision !== expectedRevision + 1) throw new DomainError('REVISION_CONFLICT', 'Task revision must advance by one.');
    const links = sessionIds === undefined ? undefined : validate(z.array(id), sessionIds);
    return this.run(() => this.db.transaction(() => {
      const existing = this.getTask(task.id);
      if ((existing?.revision ?? 0) !== expectedRevision) throw new DomainError('REVISION_CONFLICT', 'Task revision changed; reload before saving.');
      if (existing && (existing.createdAt !== task.createdAt || existing.projectId !== task.projectId)) throw new DomainError('INVALID_INPUT', 'Task identity fields are immutable.');
      if (expectedRevision === 0) this.db.prepare('INSERT INTO tasks(id,project_id,revision,body_json,updated_at) VALUES (?,?,?,?,?)').run(task.id, task.projectId, task.revision, JSON.stringify(task), task.updatedAt);
      else if (this.db.prepare('UPDATE tasks SET revision=?,body_json=?,updated_at=? WHERE id=? AND revision=?').run(task.revision, JSON.stringify(task), task.updatedAt, task.id, expectedRevision).changes !== 1) throw new DomainError('REVISION_CONFLICT', 'Task revision changed; reload before saving.');
      this.db.prepare('INSERT INTO task_revisions(task_id,revision,changed_at,body_json) VALUES (?,?,?,?)').run(task.id, task.revision, task.updatedAt, JSON.stringify(task));
      if (links !== undefined) {
        this.db.prepare('DELETE FROM task_sessions WHERE task_id=?').run(task.id);
        for (const sessionId of new Set(links)) {
          const owner = this.db.prepare('SELECT task_id FROM task_sessions WHERE session_id=?').pluck().get(sessionId);
          if (owner !== undefined) throw new DomainError('REVISION_CONFLICT', 'Session already belongs to another task.');
          this.db.prepare('INSERT INTO task_sessions(session_id,task_id) VALUES (?,?)').run(sessionId, task.id);
        }
      }
      return task;
    }).immediate());
  }
}
export async function openStore(options: DatabaseOptions = {}): Promise<SqliteStore> { return new SqliteStore(await openDatabase(options)); }

export { restoreBackup } from './database.js';
