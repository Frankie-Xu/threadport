import {
  type ApiClient,
  type TaskSummary,
  type Project,
  attentionLabel,
  type SessionSummary,
  usePage,
  query,
  dateLabel,
} from "../../api.js";
import { ErrorNotice, Empty, StatusBadge, Pager } from "../../components.js";
import { Home } from "../home/home.js";
export function Inbox({
  api,
  projects,
  params,
  revision,
  navigate,
  onCreate,
}: {
  api: ApiClient;
  projects: Project[];
  params: URLSearchParams;
  revision: number;
  navigate: (values: Record<string, string | null>) => void;
  onCreate: (session?: SessionSummary) => void;
}) {
  const tasks = usePage<TaskSummary>(
    api,
    "/tasks?" +
      query({
        projectId: params.get("p"),
        lifecycle: params.get("life"),
        archived: params.get("archived") ?? "false",
        limit: 20,
      }),
    revision,
  );
  const sessions = usePage<SessionSummary>(
    api,
    "/sessions/unassigned?" + query({ projectId: params.get("p"), limit: 20 }),
    revision,
  );
  return (
    <>
      {params.get("list") !== "1" && (
        <Home projects={projects} params={params} tasks={tasks} sessions={sessions} navigate={navigate} onCreate={onCreate} />
      )}
      <div className="page-heading inbox-heading" id="task-list">
        <div>
          {params.get("list") === "1" ? <h1>Inbox</h1> : <h2>Your tasks</h2>}
          <p>Pick up a task with its evidence close at hand.</p>
        </div>
        <button onClick={() => onCreate()}>New task</button>
      </div>
      <div className="filters">
        <label>
          Lifecycle
          <select
            value={params.get("life") ?? ""}
            onChange={(e) => navigate({ life: e.target.value })}
          >
            <option value="">All states</option>
            {["active", "paused", "completed"].map((state) => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={params.get("archived") === "true"}
            onChange={(e) => navigate({ archived: String(e.target.checked) })}
          />
          Archived tasks
        </label>
      </div>
      <ErrorNotice error={tasks.error} />
      {tasks.error && <button className="quiet" onClick={tasks.reset}>Retry tasks</button>}
      {tasks.loading && <p role="status">Loading tasks…</p>}
      <div className="task-grid">
        {tasks.data?.data.map((task) => (
          <a
            className="task-card"
            key={task.id}
            href={"?" + query({ v: "inbox", t: task.id })}
            onClick={(e) => {
              e.preventDefault();
              navigate({ t: task.id });
            }}
          >
            <StatusBadge>{task.lifecycle}</StatusBadge>
            <h2>{task.title}</h2>
            {task.attention.map((code) => (
              <p className="attention" key={code}>
                {attentionLabel(code)}
              </p>
            ))}
            <p>
              {task.nextAction.text ||
                task.objective.text ||
                "No next action recorded."}
            </p>
            <small>
              Observed {dateLabel(task.lastActivityAt)}
              <br />
              Edited {dateLabel(task.updatedAt)}
            </small>
          </a>
        ))}
      </div>
      {tasks.data?.data.length === 0 && (
        <Empty title="Room for your next task">
          Create a task or choose an unassigned session below.
        </Empty>
      )}
      <Pager load={tasks} />
      <section className="panel" id="unassigned-sessions">
        <h2>Unassigned sessions</h2>
        <p>Turn a session into a task without changing its original log.</p>
        <ErrorNotice error={sessions.error} />
        {sessions.loading && <p role="status">Loading sessions…</p>}
        {sessions.data?.data.map((session) => (
          <div className="source-row" key={session.id}>
            <div>
              <strong>{session.title || "Untitled session"}</strong>
              <p>
                {session.agent ?? "Agent unknown"} ·{" "}
                {session.projectId ? "Bound project" : "Unbound project"} ·{" "}
                {dateLabel(session.lastEventAt)}
              </p>
            </div>
            <button className="quiet" onClick={() => onCreate(session)}>
              Create task from session
            </button>
          </div>
        ))}
        {sessions.data?.data.length === 0 && (
          <p>
            No unassigned sessions. Add a source in Settings to find existing
            work.
          </p>
        )}
        <Pager load={sessions} />
      </section>
    </>
  );
}
