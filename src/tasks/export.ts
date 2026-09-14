import { publicText } from "../privacy.js";
import type { TaskService } from "./service.js";
import type { Claim } from "../domain/models.js";
const fence = (text: string) => {
  const value = publicText(text),
    ticks = "`".repeat(
      Math.max(3, ...(value.match(/`+/g) ?? []).map((run) => run.length + 1)),
    );
  return ticks + "text\n" + value + "\n" + ticks;
};
const claim = (label: string, value: Claim | null) =>
  "## " +
  label +
  "\n\nOrigin: " +
  (value?.origin ?? "unknown") +
  "\n\n" +
  fence(value?.text || "Unknown: no value recorded.") +
  "\n\nEvidence IDs: " +
  fence(
    value?.evidence
      .map((ref) => ref.sessionId + "/" + ref.eventId)
      .join(", ") || "none",
  ) +
  "\n";
export function exportTask(
  detail: Awaited<ReturnType<TaskService["detail"]>>,
): string {
  const task = detail.task,
    runs = detail.derived.latestRuns.slice(-20);
  return (
    [
      "# ThreadPort task metadata",
      "",
      fence(task.title),
      "",
      `Task: ${task.id} · revision ${task.revision}`,
      `Lifecycle: ${task.lifecycle} · archived: ${task.archived}`,
      `Edited: ${task.updatedAt}`,
      "",
      "Metadata only. No source code or original logs are synchronized. Historical command validity is unknown.",
      "",
      claim("Objective", task.objective),
      claim("Next action", task.nextAction),
      "## Manual constraints",
      "",
      ...(task.constraints.length
        ? task.constraints.map((value, i) =>
            claim("Constraint " + (i + 1), value),
          )
        : ["No saved constraints."]),
      "",
      claim("Source objective suggestion", detail.derived.objective),
      "## Observed commands",
      "",
      ...runs.map(
        (run) =>
          fence(run.command) +
          "\n\nObserved exit: " +
          (run.exitCode ?? "unknown") +
          "; time: " +
          (run.completedAt ?? "unknown") +
          "; current validity: unknown.\n",
      ),
      ...(!runs.length ? ["No command evidence available."] : []),
      ...(detail.derived.latestRuns.length > 20
        ? [
            String(detail.derived.latestRuns.length - 20) +
              " earlier command groups omitted.",
          ]
        : []),
    ].join("\n") + "\n"
  );
}
