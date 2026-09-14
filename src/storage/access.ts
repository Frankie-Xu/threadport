import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { openSync, closeSync, lstatSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { DomainError } from "../domain/errors.js";
/** Small process registry serializes new database opens with destructive maintenance. Contains no task data. */
export class DatabaseAccess {
  private readonly registry: Database.Database;
  private readonly token = randomUUID();
  private holding = false;
  private released = false;
  constructor(dataDir: string) {
    const path = join(dataDir, ".threadport-access.sqlite");
    try {
      closeSync(openSync(path, "wx", 0o600));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = lstatSync(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      (process.getuid && info.uid !== process.getuid())
    )
      throw new DomainError("IO_FAILED", "Unsafe access registry.");
    if (process.platform !== "win32") chmodSync(path, 0o600);
    this.registry = new Database(path, { timeout: 5000 });
    try {
      this.registry.pragma("journal_mode=WAL");
      this.registry.exec(
        "CREATE TABLE IF NOT EXISTS connections(token TEXT PRIMARY KEY,pid INTEGER NOT NULL)",
      );
      this.registry
        .transaction(() => {
          this.removeLost();
          this.registry
            .prepare("INSERT INTO connections VALUES(?,?)")
            .run(this.token, process.pid);
        })
        .immediate();
    } catch (error) {
      this.registry.close();
      throw error;
    }
  }
  private removeLost() {
    for (const row of this.registry
      .prepare("SELECT token,pid FROM connections")
      .all() as { token: string; pid: number }[]) {
      if (!Number.isSafeInteger(row.pid) || row.pid <= 0)
        throw new DomainError("STORAGE_BUSY", "An access record needs review.");
      try {
        process.kill(row.pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH")
          this.registry
            .prepare("DELETE FROM connections WHERE token=?")
            .run(row.token);
      }
    }
  }
  exclusive<T>(action: () => T): T {
    this.holding = true;
    try {
      return this.registry
        .transaction(() => {
          this.removeLost();
          if (
            (this.registry
              .prepare("SELECT count(*) FROM connections WHERE token!=?")
              .pluck()
              .get(this.token) as number) !== 0
          )
            throw new DomainError(
              "STORAGE_BUSY",
              "Close other ThreadPort processes before deleting local data.",
            );
          return action();
        })
        .immediate();
    } finally {
      this.holding = false;
      if (this.released && this.registry.open) {
        try {
          this.registry
            .prepare("DELETE FROM connections WHERE token=?")
            .run(this.token);
        } finally {
          this.registry.close();
        }
      }
    }
  }
  release() {
    if (this.released) return;
    this.registry
      .prepare("DELETE FROM connections WHERE token=?")
      .run(this.token);
    this.released = true;
    if (!this.holding) this.registry.close();
  }
}
const accessByDatabase = new WeakMap<Database.Database, DatabaseAccess>();
export function trackDatabase(db: Database.Database, access: DatabaseAccess) {
  accessByDatabase.set(db, access);
  const close = db.close.bind(db);
  db.close = () => {
    try {
      return db.open ? close() : db;
    } finally {
      access.release();
    }
  };
}
export function exclusiveDatabase<T>(
  db: Database.Database,
  action: () => T,
): T {
  const access = accessByDatabase.get(db);
  if (!access)
    throw new DomainError(
      "STORAGE_BUSY",
      "Reopen this database through ThreadPort before maintenance.",
    );
  return access.exclusive(action);
}
