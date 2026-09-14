import {
  type ApiClient,
  type SessionSummary,
  usePage,
  query,
  dateLabel,
} from "../../api.js";
import type { NormalizedEvent } from "../../../../src/domain/models.js";
import { ErrorNotice, Modal, Pager, useAction } from "../../components.js";
export function Evidence({
  api,
  sessionId,
  eventId,
  onClose,
}: {
  api: ApiClient;
  sessionId: string;
  eventId?: string;
  onClose: () => void;
}) {
  const events = usePage<NormalizedEvent>(
    api,
    "/sessions/" +
      encodeURIComponent(sessionId) +
      "/events?" +
      query({ eventId, limit: 20 }),
  );
  return (
    <Modal title="Session evidence" onClose={onClose}>
      <p>Observed history. Missing timestamps and exit codes remain unknown.</p>
      <ErrorNotice error={events.error} />
      {events.loading && <p role="status">Loading evidence…</p>}
      {events.data?.data.map((event) => (
        <article key={event.id} className="event">
          <h3>{event.kind}</h3>
          <p>
            {dateLabel(event.occurredAt)}
            {event.omitted ? " · Source content was omitted" : ""}
          </p>
          <pre className="evidence">{event.text}</pre>
          {event.commandRun && (
            <p>Exit code: {event.commandRun.exitCode ?? "unknown"}</p>
          )}
        </article>
      ))}
      {events.data?.data.length === 0 && (
        <p>Evidence is no longer available from this source.</p>
      )}
      <Pager load={events} />
    </Modal>
  );
}
export function AttachSession({
  api,
  projectId,
  taskId,
  revision,
  onClose,
  onSaved,
}: {
  api: ApiClient;
  projectId: string;
  taskId: string;
  revision: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sessions = usePage<SessionSummary>(
    api,
    "/sessions/unassigned?" + query({ projectId, limit: 20 }),
  );
  const action = useAction();
  return (
    <Modal title="Attach a session" onClose={onClose}>
      <p>
        Choose a session from this project or confirm an unbound session belongs
        here.
      </p>
      <ErrorNotice error={sessions.error} />
      <ErrorNotice error={action.error} focus />
      {sessions.data?.data.map((session) => (
        <div className="source-row" key={session.id}>
          <div>
            <strong>{session.agent ?? "Unknown Agent"}</strong>
            <p>
              {session.projectId
                ? "Bound to this project"
                : "Unbound · attaching confirms project ownership"}
            </p>
            <small>{dateLabel(session.lastEventAt)}</small>
          </div>
          <button
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api.request("/tasks/" + taskId + "/sessions", "POST", {
                  sessionId: session.id,
                  expectedRevision: revision,
                });
                onSaved();
              })
            }
          >
            Attach session
          </button>
        </div>
      ))}
      {sessions.data?.data.length === 0 && (
        <p>No unassigned sessions available.</p>
      )}
      <Pager load={sessions} />
    </Modal>
  );
}
