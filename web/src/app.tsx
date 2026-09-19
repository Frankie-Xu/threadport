import { useEffect, useRef, useState } from "react";
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
export function App({ initialApi }: { initialApi: ApiClient | null }) {
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
    if (api)
      api.onExpired = () =>
        setExpired(true);
    return () => {
      if (api) api.onExpired = undefined;
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
          Paste the link printed by your running ThreadPort service. Your tasks
          and search filters are preserved. Unsaved edits stay open while you reconnect.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void reconnect.run(async () => {
              const client = reconnectClient(link);
              setLink("");
              if (client) { setApi(client); setExpired(false); }
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
    <Shell
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
          <ServiceStatus api={api} />
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

function ServiceStatus({ api }: { api: ApiClient }) {
  const [revision, setRevision] = useState(0);
  const status = useLoad<
    Envelope<{
      version: string;
      index: { running: number; lastRefreshAt: string | null };
    }>
  >(api, "/status", revision);
  useEffect(() => {
    const timer = setInterval(() => setRevision((n) => n + 1), 15000);
    return () => clearInterval(timer);
  }, []);
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
