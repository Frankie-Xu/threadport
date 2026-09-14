import { useState } from "react";
import type { ApiClient } from "../../api.js";
import { ErrorNotice, useAction } from "../../components.js";
export function WorkspaceForm({
  api,
  onSaved,
}: {
  api: ApiClient;
  onSaved: () => void;
}) {
  const [root, setRoot] = useState("");
  const action = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(async () => {
          await api.request("/workspaces", "POST", {
            root,
            confirmBinding: true,
          });
          setRoot("");
          onSaved();
        });
      }}
    >
      <label>
        Workspace directory
        <input
          required
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          placeholder="Absolute path to your project"
        />
      </label>
      <p className="hint">
        Choose a physical directory. This creates an explicit project binding.
      </p>
      <ErrorNotice error={action.error} focus />
      <button disabled={action.busy}>
        {action.busy ? "Adding…" : "Add workspace"}
      </button>
    </form>
  );
}
