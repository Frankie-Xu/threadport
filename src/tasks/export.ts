import { publicText } from "../privacy.js";
import type { TaskService } from "./service.js";
import type { Claim } from "../domain/models.js";
const fence = (text: string) => {
  const value = publicText(text);
  let length=3;
  for(const [run] of value.matchAll(/`+/g))length=Math.max(length,run.length+1);
  const ticks="`".repeat(length);
  return ticks + "text\n" + value + "\n" + ticks;
};
const claim = (label: string, value: Claim | null) =>
  "## " +
  label +
  "\n\nOrigin: " +
  (value?.origin ?? "unknown") +
  "\n\n" +
  fence(value?.text || "Unknown: no value recorded.") +
  "\n\nEvidence IDs:\n\n" +
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
      "## Decision and constraint ledger",
      "Candidates are not instructions. Conflicting confirmations require explicit resolution.",
      ...detail.assertions.entries.map(entry=>fence(`${entry.kind} / ${entry.topic} / ${entry.state} / ${entry.applicability} / source ${entry.sourceAvailability}\n${entry.text}`)),
      ...detail.assertions.conflicts.map(conflict=>fence(`Unresolved topic: ${conflict.topic}; entries: ${conflict.ids.join(', ')}`)),
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
