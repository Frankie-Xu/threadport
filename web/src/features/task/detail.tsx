import {ExportReview} from "../settings/export.js";
import { useState } from "react";
import {
  type ApiClient,
  type Envelope,
  type TaskDetail,
  type ControlState,
  useLoad,
  dateLabel,
  attentionLabel,
} from "../../api.js";
import type { Claim } from "../../../../src/domain/models.js";
import {
  ErrorNotice,
  Modal,
  StatusBadge,
  useAction,
} from "../../components.js";
import { Editor } from "./editor.js";
import { Evidence, AttachSession } from "./evidence.js";
import { HandoffPreview } from "../handoff/preview.js";
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
  const control = useLoad<Envelope<ControlState>>(
    api,
    "/tasks/" + encodeURIComponent(id) + "/control",
  );
  const value = detail.data?.data;
  const [editing, setEditing] = useState(false),
    [attaching, setAttaching] = useState(false),
    [removing, setRemoving] = useState<string | null>(null),
    [evidence, setEvidence] = useState<{
      sessionId: string;
      eventId?: string;
    } | null>(null),
    [continuing, setContinuing] = useState(false);
  const action = useAction();
  const [exporting,setExporting]=useState(false);
  const refresh = () => {
    setEditing(false);
    setAttaching(false);
    setRemoving(null);
    detail.reload();
  };
  const claim = (heading: string, value: Claim | null) => (
    <div>
      <h2>{heading}</h2>
      <StatusBadge>{value?.origin ?? "unknown"}</StatusBadge>
      <p className="preserve">{value?.text || "No value recorded."}</p>
      {value?.evidence.map((ref, index) => (
        <button key={index} className="quiet" onClick={() => setEvidence(ref)}>
          View {heading.toLowerCase()} evidence
        </button>
      ))}
    </div>
  );
  if (continuing && value)
    return (
      <HandoffPreview
        key={value.task.id + ":" + value.task.revision}
        api={api}
        detail={value}
        onBack={() => {
          setContinuing(false);
          detail.reload();
        }}
      />
    );
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
              {value.task.archived && <StatusBadge>archived</StatusBadge>}
              <h1>{value.task.title}</h1>
              <p>
                Revision {value.task.revision} · Edited{" "}
                {dateLabel(value.task.updatedAt)}
              </p>
            </div>
            <div className="actions">
              <button
                className="quiet"
                disabled={detail.loading || action.busy}
                onClick={() => setEditing(true)}
              >
                Edit task
              </button>
              <button className="quiet" onClick={()=>setExporting(true)}>Export task</button>
              <button
                disabled={
                  detail.loading || action.busy || !value.sessions.length
                }
                onClick={() => setContinuing(true)}
              >
                Continue task
              </button>
            </div>
          </div>
          {value.resolved.attention.map((item, i) => (
            <p className="notice" key={i}>
              {attentionLabel(item)}
            </p>
          ))}
          <section className="panel">
            {claim("Objective", value.resolved.objective)}
            {claim("Next action", value.resolved.nextAction)}
            <h2>Constraints</h2>
            {value.resolved.constraints.length ? (
              value.resolved.constraints.map((item, i) => (
                <div key={i}>
                  <StatusBadge>{item.origin}</StatusBadge>
                  <p className="preserve">{item.text}</p>
                  {item.evidence.map((ref, n) => (
                    <button
                      className="quiet"
                      key={n}
                      onClick={() => setEvidence(ref)}
                    >
                      View constraint evidence
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <p>No constraints recorded.</p>
            )}
          </section>
          <section className="panel">
            <h2>Handoff visibility</h2>
            <p>
              Responsibility and run state come from recorded evidence. Unknown
              or agent-reported facts remain visible until verified.
            </p>
            {control.error && <ErrorNotice error={control.error} />}
            {control.data?.data.responsibilities.length ? control.data.data.responsibilities.map((record) => (
              <div className="source-row" key={record.id}>
                <strong>{record.roles.executor ?? "Responsible party unknown"}</strong>
                <StatusBadge>{record.status}</StatusBadge>
                <p>Evidence: {record.evidenceIds.join(", ") || "none"}</p>
              </div>
            )) : <p>Responsible party is unknown; no confirmed responsibility edge is recorded.</p>}
            {Object.entries(control.data?.data.sessions ?? {}).map(([sessionId, run]) => (
              <p key={sessionId}>
                Session {sessionId}: {run.runState} · {run.health} · last evidence {run.lastEvidenceId ?? "unknown"}
              </p>
            ))}
            {control.data?.data.attention.filter((item) => item.status === "open").map((item) => (
              <p className="notice" key={item.id}>{item.message}</p>
            ))}
          </section>
          <section className="panel">
            <h2>Source suggestions</h2>
            <p>
              These are derived from session evidence and do not replace your
              saved fields.
            </p>
            {claim("Suggested objective", value.derived.objective)}
            {value.derived.constraints.map((item, i) => (
              <div key={i}>
                <StatusBadge>{item.origin}</StatusBadge>
                <p>{item.text}</p>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Task status</h2>
            <p>
              Lifecycle is your decision. Agent output and successful exits do
              not complete a task automatically.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const lifecycle = new FormData(event.currentTarget).get(
                  "lifecycle",
                );
                void action.run(async () => {
                  await api.request("/tasks/" + id, "PATCH", {
                    expectedRevision: value.task.revision,
                    patch: { lifecycle },
                  });
                  detail.reload();
                });
              }}
            >
              <label htmlFor="task-lifecycle">Lifecycle</label>
              <select
                id="task-lifecycle"
                name="lifecycle"
                key={value.task.revision}
                defaultValue={value.task.lifecycle}
                disabled={detail.loading || action.busy}
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="completed">completed</option>
              </select>
              <button disabled={detail.loading || action.busy}>
                Save status
              </button>
            </form>
            <div className="actions">
              <button
                className="quiet"
                disabled={detail.loading || action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await api.request("/tasks/" + id, "PATCH", {
                      expectedRevision: value.task.revision,
                      patch: { archived: !value.task.archived },
                    });
                    detail.reload();
                  })
                }
              >
                {value.task.archived ? "Unarchive task" : "Archive task"}
              </button>
              <button
                className="quiet"
                disabled={detail.loading || action.busy}
                onClick={() => {
                  action.setError(null);
                  detail.reload();
                }}
              >
                Refresh task
              </button>
            </div>
            <ErrorNotice error={action.error} focus />
          </section>
          <section className="panel">
            <div className="page-heading">
              <h2>Linked sessions</h2>
              <button
                className="quiet"
                disabled={detail.loading || action.busy}
                onClick={() => setAttaching(true)}
              >
                Attach a session
              </button>
            </div>
            {value.sessions.map((session) => (
              <div className="source-row" key={session.id}>
                <div>
                  <strong>
                    {session.agent ?? "Unknown Agent"} · {session.status}
                  </strong>
                  <p>{dateLabel(session.lastEventAt)}</p>
                </div>
                <div className="actions">
                  <button
                    className="quiet"
                    onClick={() => setEvidence({ sessionId: session.id })}
                  >
                    View evidence
                  </button>
                  <button
                    className="quiet"
                    disabled={detail.loading || action.busy}
                    onClick={() => setRemoving(session.id)}
                  >
                    Detach session
                  </button>
                </div>
              </div>
            ))}
            {!value.sessions.length && (
              <p>
                No linked sessions. Attach a source session before preparing a
                continuation.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Observed file paths</h2>
            {value.files.items.map((item, i) => (
              <p key={i}>
                <button
                  className="quiet"
                  onClick={() =>
                    setEvidence({
                      sessionId: item.sessionId,
                      eventId: item.eventId,
                    })
                  }
                >
                  {item.path}
                </button>
              </p>
            ))}
            {value.files.hasMore && (
              <p>
                Showing the first 200 file references. Open session evidence for
                more.
              </p>
            )}
            {!value.files.items.length && <p>No file evidence available.</p>}
            <h2>Observed commands</h2>
            <p>Historical evidence does not verify the current workspace.</p>
            {value.derived.latestRuns.map((run) => (
              <div key={run.id}>
                <pre className="evidence">{run.command}</pre>
                <p>
                  Exit code: {run.exitCode ?? "unknown"} ·{" "}
                  {dateLabel(run.completedAt)}
                </p>
                <button
                  className="quiet"
                  onClick={() =>
                    setEvidence({
                      sessionId: run.sessionId,
                      eventId: run.eventId,
                    })
                  }
                >
                  View command evidence
                </button>
              </div>
            ))}
            {!value.derived.latestRuns.length && (
              <p>No command evidence available.</p>
            )}
          </section>
          {editing && (
            <Editor
              api={api}
              task={value.task}
              onClose={() => setEditing(false)}
              onSaved={refresh}
            />
          )}{" "}
          {attaching && (
            <AttachSession
              api={api}
              projectId={value.task.projectId}
              taskId={id}
              revision={value.task.revision}
              onClose={() => setAttaching(false)}
              onSaved={refresh}
            />
          )}{" "}
          {removing && (
            <Modal
              title="Detach this session?"
              onClose={() => setRemoving(null)}
            >
              <p>
                Manual fields remain. Derived evidence from this session will
                leave the task.
              </p>
              <ErrorNotice error={action.error} focus />
              <button
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await api.request(
                      "/tasks/" +
                        id +
                        "/sessions/" +
                        encodeURIComponent(removing),
                      "DELETE",
                      { expectedRevision: value.task.revision },
                    );
                    refresh();
                  })
                }
              >
                Confirm detach
              </button>
            </Modal>
          )}
        </>
      )}
      {exporting&&<ExportReview api={api} id={id} kind="task" onClose={()=>setExporting(false)}/>}
      {evidence && (
        <Evidence api={api} {...evidence} onClose={() => setEvidence(null)} />
      )}
    </>
  );
}
