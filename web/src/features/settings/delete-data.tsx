import { useState } from "react";
import type { ApiClient } from "../../api.js";
import { Modal, ErrorNotice, useAction } from "../../components.js";
export function DeleteData({ api }: { api: ApiClient }) {
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [deleted, setDeleted] = useState(false);
  const action = useAction();
  return (
    <section className="panel">
      <h2>Delete local data</h2>
      <p>
        This removes tasks, manual revisions, configured sources, cached
        evidence, transfer packages and migration backups from this data
        directory. Original session logs, project files, exported files outside
        the data directory and unrelated files remain.
      </p>
      <p>
        Close other ThreadPort processes, including older versions, first.
        Deletion is not recoverable without your own external backup. This is
        ordinary file deletion, not secure disk erasure. A small empty process
        registry remains.
      </p>
      {deleted ? (
        <p role="status">
          Local data deleted. The service has stopped. Close this tab and start
          ThreadPort again for a fresh workspace.
        </p>
      ) : (
        <button
          className="quiet"
          onClick={() => {
            setConfirmation("");
            setOpen(true);
          }}
        >
          Delete local data…
        </button>
      )}
      {open && (
        <Modal
          title="Permanently delete local data"
          onClose={() => {
            if (!action.busy) setOpen(false);
          }}
        >
          <p>
            Type DELETE LOCAL DATA to remove application data and migration
            backups, then stop this service. If deletion fails, inspect the data
            directory before retrying; do not assume every file was removed.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (confirmation !== "DELETE LOCAL DATA") return;
              void action.run(async () => {
                await api.request("/data/delete-all", "POST", { confirmation });
                setDeleted(true);
                setOpen(false);
              });
            }}
          >
            <label>
              Deletion confirmation
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              disabled={action.busy || confirmation !== "DELETE LOCAL DATA"}
            >
              Delete and stop service
            </button>
            <button
              type="button"
              className="quiet"
              disabled={action.busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </form>
          <ErrorNotice error={action.error} focus />
        </Modal>
      )}
    </section>
  );
}
