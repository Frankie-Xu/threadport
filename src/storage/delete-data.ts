import type Database from "better-sqlite3";
import { lstatSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DomainError } from "../domain/errors.js";
import { exclusiveDatabase } from "./access.js";
import { storageError } from "./migrations.js";
/** Deletes only named application files. Never recursively removes the supplied directory. */
export function deleteOwnedData(
  db: Database.Database,
  dataDir: string,
): { deleted: true } {
  if (resolve(db.name) !== resolve(dataDir, "threadport.sqlite"))
    throw new DomainError(
      "INVALID_INPUT",
      "Data directory does not match the open database.",
    );
  try {
    return exclusiveDatabase(db, () => {
      if (
        db
          .prepare("SELECT 1 FROM index_leases WHERE expires_at>?")
          .get(Date.now()) ||
        db.prepare("SELECT 1 FROM handoffs WHERE state='launching'").get()
      )
        throw new DomainError(
          "STORAGE_BUSY",
          "Stop active indexing and continuation before deletion.",
        );
      const checkpoints = db.pragma("wal_checkpoint(TRUNCATE)") as {
        busy: number;
      }[];
      if (checkpoints.some((value) => value.busy))
        throw new DomainError(
          "STORAGE_BUSY",
          "Another database reader or writer is active.",
        );
      const files: string[] = [],
        directories: string[] = [];
      const inspectFile = (path: string) => {
        const info = lstatSync(path);
        if (
          !info.isFile() ||
          info.isSymbolicLink() ||
          info.nlink !== 1 ||
          (process.getuid && info.uid !== process.getuid())
        )
          throw new DomainError(
            "IO_FAILED",
            "A data file needs manual review before deletion.",
          );
        files.push(path);
      };
      const backupRoot = join(dataDir, "backups");
      try {
        const info = lstatSync(backupRoot);
        if (!info.isDirectory() || info.isSymbolicLink())
          throw new DomainError(
            "IO_FAILED",
            "Backup location needs manual review.",
          );
        for (const name of readdirSync(backupRoot)) {
          if (!/^v\d+-[A-Za-z0-9]{6}$/.test(name))
            throw new DomainError(
              "IO_FAILED",
              "An unrecognized backup entry requires manual review.",
            );
          const directory = join(backupRoot, name),
            stat = lstatSync(directory);
          if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new DomainError("IO_FAILED", "Unsafe backup directory.");
          const entries = readdirSync(directory);
          if (entries.some((entry) => entry !== "backup.sqlite"))
            throw new DomainError(
              "IO_FAILED",
              "Unrecognized backup contents require manual review.",
            );
          for (const entry of entries) inspectFile(join(directory, entry));
          directories.push(directory);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      // Preflight every candidate before the first deletion. The main database is removed last.
      const main = join(dataDir, "threadport.sqlite");
      inspectFile(main);
      files.pop();
      for (const suffix of ["-wal", "-shm"]) {
        try {
          const info = lstatSync(main + suffix);
          if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
            throw new DomainError("IO_FAILED", "Unsafe database sidecar.");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      for (const file of files) unlinkSync(file);
      for (const directory of directories) rmdirSync(directory);
      try {
        rmdirSync(backupRoot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      db.close();
      for (const suffix of ["-wal", "-shm"]) {
        try {
          unlinkSync(main + suffix);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      unlinkSync(main);
      return { deleted: true };
    });
  } catch (error) {
    throw storageError(error);
  }
}
