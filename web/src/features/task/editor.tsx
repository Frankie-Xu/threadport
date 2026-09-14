import { useEffect, useState } from "react";
import { type ApiClient, type Task, ApiError } from "../../api.js";
import { ErrorNotice, Modal, useAction } from "../../components.js";
import {
  previewTaskPatch,
  type TaskPatch,
} from "../../../../src/tasks/contracts.js";
export function Editor({
  api,
  task,
  onClose,
  onSaved,
}: {
  api: ApiClient;
  task: Task;
  onClose: () => void;
  onSaved: () => void;
}) {
  const baseline = {
    title: task.title,
    objective: task.objective.text,
    nextAction: task.nextAction.text,
    constraints: task.constraints.map((c) => c.text).join("\n"),
  };
  const [draft, setDraft] = useState(baseline);
  const action = useAction();
  const dirty = Object.keys(baseline).some(
    (key) =>
      draft[key as keyof typeof draft] !==
      baseline[key as keyof typeof baseline],
  );
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    addEventListener("beforeunload", prevent);
    return () => removeEventListener("beforeunload", prevent);
  }, [dirty]);
  return (
    <Modal
      title="Edit task"
      onClose={() => {
        if (dirty && !window.confirm("Discard unsaved changes?")) return false;
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const patch: TaskPatch = {};
            for (const key of ["title", "objective", "nextAction"] as const)
              if (draft[key] !== baseline[key]) patch[key] = draft[key];
            if (draft.constraints !== baseline.constraints)
              patch.constraints = draft.constraints
                ? draft.constraints.split("\n")
                : [];
            const preview = previewTaskPatch(patch);
            if (preview.redactedFields.length) {
              setDraft((previous) => ({
                ...previous,
                ...Object.fromEntries(
                  Object.entries(preview.patch).map(([key, value]) => [
                    key,
                    Array.isArray(value) ? value.join("\n") : value,
                  ]),
                ),
              }));
              throw new Error(
                "Credentials were removed. Review the revised fields and save again.",
              );
            }
            await api.request("/tasks/" + task.id, "PATCH", {
              expectedRevision: task.revision,
              patch,
            });
            onSaved();
          });
        }}
      >
        <p>
          Only changed fields are saved. Existing evidence remains separate.
        </p>
        <label>
          Task title
          <input
            autoFocus
            required
            maxLength={120}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label htmlFor="edit-objective">Objective</label>
        <textarea
          id="edit-objective"
          rows={4}
          maxLength={8000}
          value={draft.objective}
          onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
        />
        <label htmlFor="edit-constraints">Constraints</label>
        <textarea
          id="edit-constraints"
          rows={4}
          value={draft.constraints}
          onChange={(e) => setDraft({ ...draft, constraints: e.target.value })}
        />
        <p className="hint">
          One constraint per line, up to 50 constraints and 2,000 characters
          each.
        </p>
        <label htmlFor="edit-next">Next action</label>
        <textarea
          id="edit-next"
          rows={3}
          maxLength={4000}
          value={draft.nextAction}
          onChange={(e) => setDraft({ ...draft, nextAction: e.target.value })}
        />
        <ErrorNotice error={action.error} focus />
        {action.error instanceof ApiError &&
          action.error.code === "REVISION_CONFLICT" && (
            <button type="button" className="quiet" onClick={onSaved}>
              Discard draft and reload
            </button>
          )}
        <button disabled={action.busy || !dirty}>Save changes</button>
      </form>
    </Modal>
  );
}
