import { useState } from "react";
import {
  type ApiClient,
  type Envelope,
  type Task,
  type Project,
  type SessionSummary,
} from "../../api.js";
import { ErrorNotice, Modal, useAction } from "../../components.js";
import { previewTaskPatch } from "../../../../src/tasks/contracts.js";
export function CreateTask({
  api,
  projects,
  session,
  onClose,
  onSaved,
}: {
  api: ApiClient;
  projects: Project[];
  session?: SessionSummary;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [title, setTitle] = useState(""),
    [projectId, setProject] = useState(
      session?.projectId ?? projects[0]?.id ?? "",
    );
  const action = useAction();
  return (
    <Modal title="Create task" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const preview = previewTaskPatch({ title });
            if (preview.redactedFields.length) {
              setTitle(preview.patch.title!);
              throw new Error(
                "Credentials were removed. Review the revised title and submit again.",
              );
            }
            const result = await api.request<Envelope<Task>>("/tasks", "POST", {
              projectId,
              title,
              ...(session ? { sessionId: session.id } : {}),
            });
            onSaved(result.data.id);
          });
        }}
      >
        <label>
          Task title
          <input
            autoFocus
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Project
          <select
            required
            value={projectId}
            onChange={(e) => setProject(e.target.value)}
            disabled={!!session?.projectId}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <ErrorNotice error={action.error} focus />
        <button disabled={action.busy || !projectId}>Create task</button>
      </form>
    </Modal>
  );
}
