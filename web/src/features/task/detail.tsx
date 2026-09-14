import {
  type ApiClient,
  type Envelope,
  type TaskDetail,
  useLoad,
  dateLabel,
} from "../../api.js";
import { ErrorNotice, StatusBadge } from "../../components.js";
export function Detail({
  api,
  id,
  navigate,
}: {
  api: ApiClient;
  id: string;
  navigate: (values: Record<string, string | null>) => void;
}) {
  const detail = useLoad<Envelope<TaskDetail>>(
    api,
    "/tasks/" + encodeURIComponent(id),
  );
  const value = detail.data?.data;
  return (
    <>
      <button className="quiet" onClick={() => navigate({ t: null })}>
        Back to inbox
      </button>
      <ErrorNotice error={detail.error} />
      {detail.loading && <p role="status">Loading task…</p>}
      {value && (
        <>
          <div className="page-heading">
            <div>
              <StatusBadge>{value.task.lifecycle}</StatusBadge>
              <h1>{value.task.title}</h1>
              <p>
                Revision {value.task.revision} · Edited{" "}
                {dateLabel(value.task.updatedAt)}
              </p>
            </div>
          </div>
          <section className="panel">
            <h2>Objective</h2>
            <p className="preserve">
              {value.resolved.objective?.text || "No objective recorded."}
            </p>
            <h2>Next action</h2>
            <p className="preserve">
              {value.resolved.nextAction?.text || "No next action recorded."}
            </p>
            <h2>Constraints</h2>
            {value.resolved.constraints.length ? (
              value.resolved.constraints.map((claim, i) => (
                <p key={i}>{claim.text}</p>
              ))
            ) : (
              <p>No constraints recorded.</p>
            )}
          </section>
          <section className="panel">
            <h2>Observed commands</h2>
            <p>Historical evidence does not verify the current workspace.</p>
            {value.derived.latestRuns.map((run) => (
              <div key={run.id}>
                <pre className="evidence">{run.command}</pre>
                <p>
                  Exit code: {run.exitCode ?? "unknown"} ·{" "}
                  {dateLabel(run.completedAt)}
                </p>
              </div>
            ))}
            {!value.derived.latestRuns.length && (
              <p>No command evidence available.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
