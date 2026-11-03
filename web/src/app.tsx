import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ApiClient,
  type Envelope,
  type Project,
  type SessionSummary,
  useLoad,
  reconnectClient,
  dateLabel,
} from "./api.js";
import { ErrorNotice, Modal, useAction } from "./components.js";
import { WorkspaceForm } from "./features/onboarding/workspace.js";
import { Settings } from "./features/settings/settings.js";
import { CreateTask } from "./features/inbox/create-task.js";
import { Inbox } from "./features/inbox/inbox.js";
import { History } from "./features/history/history.js";
import { Detail } from "./features/task/detail.js";
import { loadDraftKey, restoreDraft, sealDraft, type DraftIdentity, type TaskDraft } from "./draft-recovery.js";
export function App({ initialApi, recovery }: { initialApi: ApiClient | null; recovery: string | null }) {
  const [api, setApi] = useState(initialApi),
    [locationSearch, setSearch] = useState(location.search),
    [revision, setRevision] = useState(0),
    [create, setCreate] = useState<{ session?: SessionSummary } | null>(null);
  const params = new URLSearchParams(locationSearch),
    [search, setSearchInput] = useState(params.get("q") ?? ""),
    searchRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [expired, setExpired] = useState(false);
  const reconnect = useAction();
  const draftRef = useRef<TaskDraft | null>(null);
  const identity = useRef<DraftIdentity | null>(null);
  const pendingRecovery = useRef(recovery);
  const [recovered, setRecovered] = useState<TaskDraft>();
  const [recoveryError, setRecoveryError] = useState(false);
  const onDraft = useCallback((draft:TaskDraft|null) => { draftRef.current=draft; },[]);
  useEffect(() => {
    if (!api) return;
    const controller=new AbortController();
    void loadDraftKey(api,controller.signal).then(async key=>{
      if (controller.signal.aborted) return;
      identity.current=key;
      const envelope=pendingRecovery.current;
      if (!envelope) return;
      const draft=await restoreDraft(envelope,key.key,new URL(location.href));
      if (controller.signal.aborted) return;
      pendingRecovery.current=null;
      const next=new URLSearchParams({v:"inbox",t:draft.taskId});
      history.replaceState(null,"","/?"+next);
      setSearch(location.search);
      setRecovered(draft);
    }).catch(()=>{
      if (!controller.signal.aborted && pendingRecovery.current) {
        pendingRecovery.current=null;
        setRecoveryError(true);
      }
    });
    return ()=>controller.abort();
  },[api]);
  useEffect(() => {
    const pop = () => setSearch(location.search);
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(
    () => setSearchInput(new URLSearchParams(locationSearch).get("q") ?? ""),
    [locationSearch],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (api) api.onExpired = api.onUnavailable = () => setExpired(true);
    return () => {
      if (api) api.onExpired = api.onUnavailable = undefined;
    };
  }, [api]);
  const navigate = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(values))
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    history.pushState(null, "", "/?" + next);
    setSearch(location.search);
  };
  const reconnectForm = (
      <main className="reconnect">
        <p className="eyebrow">THREADPORT · LOCAL</p>
        <h1>Reconnect to your terminal</h1>
        <p>
          Paste the link printed by your running ThreadPort service. If the port changed,
          an unsaved task edit can be restored in a new tab for the same workspace data.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void reconnect.run(async () => {
              const { url, client } = reconnectClient(link);
              const draft = draftRef.current, currentIdentity = identity.current;
              if (client) {
                if (draft) {
                  const fresh = await loadDraftKey(client,AbortSignal.timeout(5000));
                  if (!currentIdentity || fresh.fingerprint!==currentIdentity.fingerprint)
                    throw new Error("This link does not match the workspace data for your draft.");
                }
                setApi(client); setExpired(false);
              } else if (draft) {
                if (!currentIdentity) throw new Error("The draft cannot be moved. It remains open in this tab.");
                // Preserve the original if the new terminal link is invalid or
                // belongs to a different database. Detach before navigating.
                const target = window.open("about:blank","_blank");
                if (!target) throw new Error("Allow a new tab to restore the draft. It remains open in this tab.");
                target.opener=null;
                try {
                  const hash = new URLSearchParams(url.hash.slice(1));
                  hash.set("draft",await sealDraft(draft,currentIdentity.key,url));
                  url.hash=hash.toString();
                  target.location.replace(url.href);
                } catch(error) { target.close(); throw error; }
              } else {
                location.assign(url.href);
              }
              setLink("");
            });
          }}
        >
          <label>
            Current terminal link
            <input
              type="password"
              autoComplete="off"
              required
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </label>
          <ErrorNotice error={reconnect.error} focus />
          <button disabled={reconnect.busy}>Reconnect</button>
        </form>
      </main>
    );
  if (!api) return reconnectForm;
  return (
    <>
    {expired && <Modal title="Reconnect to your terminal" onClose={() => { setExpired(false); return true; }}>{reconnectForm}</Modal>}
    {recoveryError && <p role="alert">This tab could not restore the draft. Check the terminal link; the draft remains in the original tab.</p>}
    <Shell
      disconnected={expired}
      recovered={recovered?.taskId===params.get("t")?recovered:undefined}
      clearRecovered={()=>setRecovered(undefined)}
      onDraft={onDraft}
      api={api}
      params={params}
      revision={revision}
      navigate={navigate}
      refresh={() => setRevision((r) => r + 1)}
      create={create}
      setCreate={setCreate}
      search={search}
      setSearchInput={setSearchInput}
      searchRef={searchRef}
    />
    </>
  );
}
function Shell({
  api,
  params,
  revision,
  navigate,
  refresh,
  create,
  setCreate,
  search,
  setSearchInput,
  searchRef,
  disconnected,
  recovered,
  clearRecovered,
  onDraft,
}: {
  api: ApiClient;
  params: URLSearchParams;
  revision: number;
  navigate: (v: Record<string, string | null>) => void;
  refresh: () => void;
  create: { session?: SessionSummary } | null;
  setCreate: (v: { session?: SessionSummary } | null) => void;
  search: string;
  setSearchInput: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  disconnected: boolean;
  recovered?: TaskDraft;
  clearRecovered: () => void;
  onDraft: (draft:TaskDraft|null)=>void;
}) {
  const projects = useLoad<Envelope<Project[]>>(api, "/projects", revision);
  const view = params.get("v") ?? "inbox";
  return (
    <div className="shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <aside>
        <a
          className="brand"
          href="?v=inbox"
          onClick={(e) => {
            e.preventDefault();
            navigate({ v: "inbox", t: null });
          }}
        >
          ThreadPort<span>LOCAL WORKSPACE</span>
        </a>
        <nav aria-label="Main navigation">
          {["inbox", "history", "settings"].map((item) => (
            <a
              key={item}
              href={"?v=" + item}
              aria-current={view === item ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate({ v: item, t: null });
              }}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </a>
          ))}
        </nav>
        <div className="local-note">
          <span className="dot" />
          Stored on this device
          <ServiceStatus api={api} disconnected={disconnected} />
          {document.documentElement.dataset.demo === "true" && (
            <p>DEMO · Synthetic data</p>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ v: "history", q: search, t: null });
            }}
          >
            <input
              ref={searchRef}
              type="search"
              aria-label="Search history"
              placeholder="Search history…"
              value={search}
              onChange={(e) => setSearchInput(e.target.value)}
              maxLength={1024}
            />
            <button className="quiet">Search</button>
          </form>
          <label className="project-filter">
            Project
            <select
              value={params.get("p") ?? ""}
              onChange={(e) => navigate({ p: e.target.value, t: null })}
            >
              <option value="">All projects</option>
              {projects.data?.data.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </header>
        <main id="content" tabIndex={-1}>
          <ErrorNotice error={projects.error} />
          {projects.loading && !projects.data ? (
            <p role="status">Loading workspace…</p>
          ) : projects.data?.data.length === 0 && view !== "settings" ? (
            <section className="onboarding">
              <p className="eyebrow">WELCOME TO THREADPORT</p>
              <h1>Start with a workspace</h1>
              <p>
                Keep tasks, find past decisions, and carry work into your next
                Agent session.
              </p>
              <WorkspaceForm api={api} onSaved={refresh} />
            </section>
          ) : view === "settings" ? (
            <Settings api={api} onSaved={refresh} />
          ) : view === "history" ? (
            <History api={api} params={params} navigate={navigate} />
          ) : params.get("t") ? (
            <Detail
              key={params.get("t")}
              api={api}
              id={params.get("t")!}
              navigate={navigate}
              recovered={recovered}
              clearRecovered={clearRecovered}
              onDraft={onDraft}
            />
          ) : (
            <Inbox
              api={api}
              params={params}
              revision={revision}
              navigate={navigate}
              onCreate={(session) => setCreate({ session })}
            />
          )}
        </main>
      </div>
      {create && (
        <CreateTask
          api={api}
          projects={projects.data?.data ?? []}
          session={create.session}
          onClose={() => setCreate(null)}
          onSaved={(id) => {
            setCreate(null);
            refresh();
            navigate({ v: "inbox", t: id });
          }}
        />
      )}
    </div>
  );
}

function ServiceStatus({ api, disconnected }: { api: ApiClient; disconnected: boolean }) {
  const [revision, setRevision] = useState(0);
  const status = useLoad<
    Envelope<{
      version: string;
      index: { running: number; lastRefreshAt: string | null };
    }>
  >(api, "/status", revision);
  useEffect(() => {
    if (disconnected) return;
    const timer = setInterval(() => setRevision((n) => n + 1), 15000);
    return () => clearInterval(timer);
  }, [disconnected]);
  return (
    <div className="service-status">
      {status.data && (
        <>
          <p>Version {status.data.data.version}</p>
          <p>
            {status.data.data.index.running
              ? "Indexing sources…"
              : "Last refresh: " +
                dateLabel(status.data.data.index.lastRefreshAt)}
          </p>
        </>
      )}
      {status.error && <p>Service status unavailable</p>}
    </div>
  );
}
