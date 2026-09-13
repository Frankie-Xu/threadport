/** One observed execution; missing historical context stays null. Not Capsule v1. */
export interface CommandRun {
  id: string;
  sessionId: string;
  ordinal: number;
  command: string;
  cwd: string | null;
  exitCode: number | null;
  startedAt: string | null;
  completedAt: string | null;
  eventId: string;
  snapshotId: string | null;
}
