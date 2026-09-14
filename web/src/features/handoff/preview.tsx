import {ExportReview} from "../settings/export.js";
import { useEffect, useState } from "react";
import {
  type ApiClient,
  type Envelope,
  type TaskDetail,
  type Workspace,
  useLoad,
  dateLabel,
} from "../../api.js";
import type { TaskHandoff } from "../../../../src/handoff/contracts.js";
import type { TargetCapability } from "../../../../src/targets/contracts.js";
import { ErrorNotice, StatusBadge, useAction } from "../../components.js";
export function HandoffPreview({
  api,
  detail,
  onBack,
}: {
  api: ApiClient;
  detail: TaskDetail;
  onBack: () => void;
}) {
  const targets = useLoad<Envelope<TargetCapability[]>>(api, "/targets");
  const workspaces = useLoad<Envelope<Workspace[]>>(
    api,
    "/workspaces?projectId=" + encodeURIComponent(detail.task.projectId),
  );
  const [source, setSource] = useState(
      detail.sessions.find(
        (s) => s.status === "ready" || s.status === "partial",
      )?.id ?? "",
    ),
    [target, setTarget] = useState<"claude" | "codex">("claude"),
    [workspace, setWorkspace] = useState(""),
    [modeChoice, setMode] = useState<"native-resume" | "new-session" | null>(
      null,
    ),
    [handoff, setHandoff] = useState<TaskHandoff | null>(null),
    [ack, setAck] = useState(false),
    [command, setCommand] = useState(""),
    [notice, setNotice] = useState(""),
    [now, setNow] = useState(Date.now());
  const action = useAction();
  const [exporting,setExporting]=useState(false);
  const capability = targets.data?.data.find((c) => c.agent === target),
    session = detail.sessions.find((s) => s.id === source);
  const native =
    !!capability?.nativeResume &&
    session?.agent === target &&
    session.nativeSessionAvailable;
  const mode = modeChoice ?? (native ? "native-resume" : "new-session");
  const supported =
    mode === "native-resume" ? native : !!capability?.newSessionWithContext;
  useEffect(() => {
    if (!workspace && workspaces.data?.data.length === 1)
      setWorkspace(workspaces.data.data[0].id);
  }, [workspaces.data, workspace]);
  useEffect(() => {
    if (!handoff) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [handoff]);
  const reset = () => {
    setHandoff(null);
    setExporting(false);
    setCommand("");
    setAck(false);
    setNotice("");
    action.setError(null);
  };
  const expired = !!handoff && now >= Date.parse(handoff.expiresAt);
  const download = (format: "json" | "markdown") =>
    void action.run(async () => {
      if (!handoff) return;
      const text = await api.exportText(handoff.id, format);
      const url = URL.createObjectURL(
        new Blob([text], {
          type:
            format === "json"
              ? "application/json"
              : "text/markdown;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        "handoff-" + handoff.id + (format === "json" ? ".json" : ".md");
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Download prepared. Your browser controls the destination.");
    });
  return (
    <>
      <button className="quiet" onClick={onBack}>
        Back to task
      </button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REVIEW BEFORE CONTINUING</p>
          <h1>Continue task</h1>
          <p>
            {detail.task.title} · revision {detail.task.revision}
          </p>
        </div>
      </div>
      <section className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              reset();
              const result = await api.request<Envelope<TaskHandoff>>(
                "/handoffs",
                "POST",
                {
                  taskId: detail.task.id,
                  sourceSessionId: source,
                  target,
                  mode,
                  workspaceId: workspace,
                },
              );
              setHandoff(result.data);
              setNow(Date.now());
            });
          }}
        >
          <label>
            Source session
            <select
              required
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setMode(null);
                reset();
              }}
              disabled={action.busy}
            >
              <option value="">Choose a session</option>
              {detail.sessions.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                  disabled={!["ready", "partial"].includes(s.status)}
                >
                  {s.agent ?? "Unknown"} · {s.status} ·{" "}
                  {dateLabel(s.lastEventAt)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target Agent
            <select
              value={target}
              disabled={action.busy}
              onChange={(e) => {
                setTarget(e.target.value as "claude" | "codex");
                setMode(null);
                reset();
              }}
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          <ErrorNotice error={targets.error} />
          {targets.loading ? (
            <p role="status">Checking target capabilities…</p>
          ) : (
            <p>
              Version: {capability?.version ?? "not detected"} · Authentication:
              unknown
            </p>
          )}
          <label>
            Workspace
            <select
              required
              value={workspace}
              disabled={action.busy}
              onChange={(e) => {
                setWorkspace(e.target.value);
                reset();
              }}
            >
              <option value="">Choose a workspace</option>
              {workspaces.data?.data.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.canonicalRoot}
                </option>
              ))}
            </select>
          </label>
          <ErrorNotice error={workspaces.error} />
          <label>
            Continuation mode
            <select
              value={mode}
              disabled={action.busy}
              onChange={(e) => {
                setMode(e.target.value as "native-resume" | "new-session");
                reset();
              }}
            >
              <option value="new-session">New session with context</option>
              <option value="native-resume" disabled={!native}>
                Native resume (same Agent)
              </option>
            </select>
          </label>
          {!supported && !targets.loading && (
            <div className="notice">
              <strong>Export only</strong>
              <p>
                {capability?.reason ??
                  "This mode is not available for the selected target."}
              </p>
            </div>
          )}
          <button
            disabled={
              action.busy ||
              targets.loading ||
              workspaces.loading ||
              !source ||
              !workspace
            }
          >
            {action.busy ? "Preparing…" : "Prepare preview"}
          </button>
        </form>
      </section>
      <ErrorNotice error={action.error} focus />
      {handoff && (
        <section className="panel">
          <div className="result-meta">
            <StatusBadge
              tone={
                handoff.verification.status === "matched" ? "good" : "warning"
              }
            >
              {handoff.verification.status}
            </StatusBadge>
            <span>Expires {dateLabel(handoff.expiresAt)}</span>
          </div>
          <p>
            Metadata only. Code and original logs are not synchronized.
            Historical commands do not prove the current workspace passes.
          </p>
          {handoff.verification.reasons.map((reason, i) => (
            <p key={i}>
              {reason.code}: {reason.message}
            </p>
          ))}
          <h2>Unknown and omitted information</h2>
          {handoff.claims
            .filter((c) => c.origin === "unknown")
            .map((claim, i) => (
              <p key={i}>Unknown: {claim.text || "No value provided"}</p>
            ))}
          {handoff.omissions.map((omission, i) => (
            <p key={i}>{omission}</p>
          ))}
          {session?.status === "partial" && (
            <p>Source is partial. Some evidence is unavailable.</p>
          )}
          <h2>Complete transfer text</h2>
          <p className="path">SHA-256: {handoff.promptDigest}</p>
          <pre
            className="evidence complete-prompt"
            aria-label="Complete transfer text"
            tabIndex={0}
          >
            {handoff.prompt}
          </pre>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              disabled={action.busy || expired}
            />
            I reviewed the complete text and accept the listed uncertainty
          </label>
          {expired && (
            <p role="alert">
              This preview expired. Prepare a new preview before continuing.
            </p>
          )}
          <div className="actions">
            <button
              disabled={
                action.busy || !ack || expired || !supported || !!command
              }
              onClick={() =>
                void action.run(async () => {
                  const result = await api.request<
                    Envelope<{ command: string }>
                  >("/handoffs/" + handoff.id + "/confirm", "POST", {
                    promptDigest: handoff.promptDigest,
                    acknowledgeUncertainty: ack,
                  });
                  setCommand(result.data.command);
                })
              }
            >
              Confirm preview
            </button>
            <button
              className="quiet"
              disabled={action.busy}
              onClick={() => download("markdown")}
            >
              Download Markdown
            </button>
            <button
              className="quiet"
              disabled={action.busy}
              onClick={() => download("json")}
            >
              Download JSON
            </button><button className="quiet" disabled={action.busy} onClick={()=>setExporting(true)}>Save export to directory</button>
          </div>
          {command && (
            <div className="terminal-command">
              <label>
                Terminal command
                <input
                  readOnly
                  value={command}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className="quiet"
                disabled={expired || action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await navigator.clipboard.writeText(command);
                    setNotice("Terminal command copied.");
                  })
                }
              >
                Copy command
              </button>
              <p>
                Run this in your terminal. ThreadPort will review the workspace
                and ask for confirmation again. If you started with a custom
                data directory, add its --data-dir option in the terminal.
              </p>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
        </section>
      )}
      {exporting&&handoff&&<ExportReview api={api} kind="handoff" id={handoff.id} onClose={()=>setExporting(false)}/>}
    </>
  );
}
