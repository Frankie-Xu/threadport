import { useState } from "react";
import type { ApiClient, Envelope } from "../../api.js";
import { ErrorNotice, Modal, useAction } from "../../components.js";
export function Maintenance({
  api,
  onChanged,
}: {
  api: ApiClient;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [ack, setAck] = useState(false),
    [notice, setNotice] = useState("");
  const action = useAction();
  return (
    <section className="panel">
      <h2>Data retention</h2>
      <p>
        Transfer text and approval are retained for 7 days; finished launch
        summaries for 30 days. Active continuations are retained. Old
        unreferenced snapshots are removed after 7 days. Cleanup runs at startup
        and hourly.
      </p>
      <ErrorNotice error={action.error} focus />
      {notice && <p role="status">{notice}</p>}
      <button
        className="quiet"
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            await api.request("/data/prune", "POST", { confirmation: true });
            setNotice(
              "Retention cleanup completed. Active continuations and manual tasks were kept.",
            );
          })
        }
      >
        Apply retention now
      </button>
      <button
        className="quiet"
        onClick={() => {
          setAck(false);
          setConfirm(true);
        }}
      >
        Clear cached index…
      </button>
      {confirm && (
        <Modal
          title="Clear cached index"
          onClose={() => {
            if (!action.busy) setConfirm(false);
          }}
        >
          <p>
            Remove imported events and index cursors, and pause all configured
            sources. Manual tasks, revision history, project bindings and
            session links remain. Source files are never modified. Re-enable
            each source and choose Refresh source to rebuild.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I understand that imported evidence will be unavailable until
            rebuilt
          </label>
          <button
            disabled={!ack || action.busy}
            onClick={() =>
              void action.run(async () => {
                const value = await api.request<
                  Envelope<{ eventsRemoved: number; sourcesPaused: number }>
                >("/data/clear-index", "POST", { confirmation: true });
                setNotice(
                  `Removed ${value.data.eventsRemoved} cached events; paused ${value.data.sourcesPaused} sources. Re-enable a source to rebuild its evidence.`,
                );
                setConfirm(false);
                onChanged();
              })
            }
          >
            Confirm clear index
          </button>
          <button
            className="quiet"
            disabled={action.busy}
            onClick={() => setConfirm(false)}
          >
            Cancel
          </button>
          <ErrorNotice error={action.error} />
        </Modal>
      )}
    </section>
  );
}
