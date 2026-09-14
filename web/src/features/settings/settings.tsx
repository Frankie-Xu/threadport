import {DeleteData} from './delete-data.js';
import {Maintenance} from './maintenance.js';
import {Diagnostics,StorageInfo} from "./diagnostics.js";
import { useEffect, useState } from "react";
import {
  type ApiClient,
  type Envelope,
  type Source,
  useLoad,
} from "../../api.js";
import { ErrorNotice, Modal, useAction } from "../../components.js";
import { WorkspaceForm } from "../onboarding/workspace.js";
export function Settings({
  api,
  onSaved,
}: {
  api: ApiClient;
  onSaved: () => void;
}) {
  const sources = useLoad<Envelope<Source[]>>(api, "/sources");
  const [root, setRoot] = useState(""),
    [agent, setAgent] = useState("claude"),
    [job, setJob] = useState<string | null>(null),
    [status, setStatus] = useState(""),
    [revoking, setRevoking] = useState<Source | null>(null);
  const action = useAction();
  const [diagnostic,setDiagnostic]=useState(false),[storageRevision,setStorageRevision]=useState(0);
  useEffect(() => {
    if (!job) return;
    let stopped = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api.request<
          Envelope<{ progress: { state: string; events: number }[] }>
        >("/index-jobs/" + job, "GET", undefined, controller.signal);
        if (stopped) return;
        const progress = result.data.progress;
        if (
          progress.some((p) => p.state === "running" || p.state === "queued")
        ) {
          setStatus("Indexing source…");
          timer = setTimeout(() => void poll(), 500);
        } else {
          setStatus(
            progress.every((p) => p.state === "completed")
              ? "Index completed"
              : progress.some((p) => p.state === "failed")
                ? "Index failed. Check the source directory."
                : progress.some((p) => p.state === "cancelled")
                  ? "Index cancelled"
                  : "Index partially completed. Some files could not be read.",
          );
          setJob(null);
          onSaved();
          sources.reload();
        }
      } catch (error) {
        if (!stopped) {
          setStatus("Index status unavailable. Refresh and try again.");
          setJob(null);
        }
      }
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, job]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LOCAL CONFIGURATION</p>
          <h1>Settings</h1>
        </div>
      </div>
      <StorageInfo key={storageRevision} api={api}/><Maintenance api={api} onChanged={()=>{sources.reload();setStorageRevision(n=>n+1);onSaved();}}/><section className="panel"><h2>Diagnostics</h2><p>Preview a report before you choose to share it.</p><button className="quiet" onClick={()=>setDiagnostic(true)}>Preview diagnostics</button></section>{diagnostic&&<Diagnostics api={api} onClose={()=>setDiagnostic(false)}/>}
      <section className="panel">
        <h2>Workspaces</h2>
        <WorkspaceForm api={api} onSaved={onSaved} />
      </section>
      <section className="panel">
        <h2>Session sources</h2>
        <p>
          Only directories you explicitly add are indexed. Your original logs
          remain unchanged.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              const source = await api.request<Envelope<Source>>(
                "/sources",
                "POST",
                { agent, root },
              );
              sources.reload();
              const result = await api.request<Envelope<{ jobId: string }>>(
                "/index-jobs",
                "POST",
                { sourceIds: [source.data.id] },
              );
              setJob(result.data.jobId);
              setStatus("Indexing source…");
              setRoot("");
            });
          }}
        >
          <label>
            Agent
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          <label>
            Source directory
            <input
              required
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder="Absolute path to session logs"
            />
          </label>
          <ErrorNotice error={action.error} focus />
          <button disabled={action.busy || !!job}>Add and index source</button>
        </form>
        {status && <p role="status">{status}</p>}
        {job && (
          <button
            className="quiet"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api.request("/index-jobs/" + job, "DELETE");
              })
            }
          >
            Cancel indexing
          </button>
        )}
        <ErrorNotice error={sources.error} />
        {sources.data?.data.map((source) => (
          <div className="source-row" key={source.id}>
            <div>
              <strong>{source.agent}</strong>
              {source.roots.map((root) => (
                <p className="path" key={root}>
                  {root}
                </p>
              ))}
            </div>
            <button className="quiet" onClick={() => setRevoking(source)}>
              Remove source
            </button>
          </div>
        ))}
      </section>
      {revoking && (
        <Modal title="Remove this source?" onClose={() => setRevoking(null)}>
          <p>
            This removes its indexed evidence. Manual task fields and original
            session logs are preserved.
          </p>
          <ErrorNotice error={action.error} focus />
          <button
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api.request("/sources/" + revoking.id, "DELETE", {
                  confirmation: true,
                });
                setRevoking(null);
                sources.reload();
                onSaved();
              })
            }
          >
            Remove source
          </button>
        </Modal>
      )}
      <DeleteData api={api}/>
    </>
  );
}
