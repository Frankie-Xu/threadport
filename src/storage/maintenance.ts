import type Database from "better-sqlite3";
import { DomainError } from "../domain/errors.js";
import { storageError } from "./migrations.js";
const DAY = 86_400_000;
/** Cache and retention changes never touch source files or manual task revisions. */
export class MaintenanceStore {
  constructor(private readonly db: Database.Database) {}
  private transaction<T>(action: () => T): T {
    try {
      return this.db.transaction(action).immediate();
    } catch (error) {
      throw storageError(error);
    }
  }
  clearIndex() {
    return this.transaction(() => {
      if (
        this.db
          .prepare("SELECT 1 FROM index_leases WHERE expires_at>?")
          .get(Date.now()) ||
        this.db.prepare("SELECT 1 FROM handoffs WHERE state='launching'").get()
      )
        throw new DomainError(
          "STORAGE_BUSY",
          "Stop active indexing and continuation before clearing the index.",
        );
      const events = this.db.prepare("DELETE FROM events").run().changes;
      this.db.prepare("DELETE FROM source_cursors").run();
      this.db.prepare("DELETE FROM index_leases").run();
      const sources = this.db
        .prepare("UPDATE sources SET enabled=0")
        .run().changes;
      this.db
        .prepare(
          "UPDATE sessions SET last_event_at=NULL,metadata_json=CASE WHEN json_type(metadata_json,'$.session')='object' THEN json_set(metadata_json,'$.session.status','missing','$.session.lastEventAt',NULL,'$.warnings',json('[\"INDEX_CLEARED\"]')) ELSE json('{\"status\":\"missing\"}') END",
        )
        .run();
      // Enabled state is intentionally not a search trigger; explicitly invalidate all cursors.
      this.db
        .prepare("UPDATE search_state SET generation=generation+1 WHERE id=1")
        .run();
      return { eventsRemoved: events, sourcesPaused: sources };
    });
  }
  prune(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now < 0)
      throw new DomainError("INVALID_INPUT", "Invalid retention time.");
    return this.transaction(() => {
      const cutoff7 = new Date(now - 7 * DAY).toISOString();
      const cutoff30 = new Date(now - 30 * DAY).toISOString();
      // An active attempt is never aged out, including a lost observer requiring reconciliation.
      const attemptsRemoved = this.db
        .prepare(
          "DELETE FROM launch_attempts WHERE status!='launching' AND ended_at IS NOT NULL AND ended_at<? AND handoff_id NOT IN (SELECT id FROM handoffs WHERE state='launching')",
        )
        .run(cutoff30).changes;
      const payloadsRemoved = this.db
        .prepare(
          "UPDATE handoffs SET body_json='{}',digest='',state='retained' WHERE state NOT IN ('launching','retained') AND json_extract(body_json,'$.handoff.createdAt')<? AND NOT EXISTS(SELECT 1 FROM launch_attempts a WHERE a.handoff_id=handoffs.id AND a.status='launching')",
        )
        .run(cutoff7).changes;
      const handoffsRemoved = this.db
        .prepare(
          "DELETE FROM handoffs WHERE state='retained' AND NOT EXISTS(SELECT 1 FROM launch_attempts a WHERE a.handoff_id=handoffs.id)",
        )
        .run().changes;
      // Preserve snapshots referenced by any retained full package or indexed command evidence.
      const snapshotsRemoved = this.db
        .prepare(
          `DELETE FROM snapshots WHERE captured_at<?
        AND NOT EXISTS(SELECT 1 FROM handoffs h WHERE json_extract(h.body_json,'$.reviewSnapshot.id')=snapshots.id OR json_extract(h.body_json,'$.handoff.verification.snapshotId')=snapshots.id)
        AND NOT EXISTS(SELECT 1 FROM events e WHERE json_extract(e.body_json,'$.commandRun.snapshotId')=snapshots.id)`,
        )
        .run(cutoff7).changes;
      return {
        attemptsRemoved,
        payloadsRemoved,
        handoffsRemoved,
        snapshotsRemoved,
      };
    });
  }
}
