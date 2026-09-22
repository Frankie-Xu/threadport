import { type Page, type Project, type SessionSummary, type TaskSummary, attentionLabel, dateLabel, query } from "../../api.js";
import { Icon, type IconName } from "../../components/icons.js";

type PageState<T> = { data?: Page<T>; loading: boolean; error?: Error; page: number };
type HomeProps = {
  projects: Project[];
  params: URLSearchParams;
  tasks: PageState<TaskSummary>;
  sessions: PageState<SessionSummary>;
  navigate: (values: Record<string, string | null>) => void;
  onCreate: (session?: SessionSummary) => void;
};

export function Home({ projects, params, tasks, sessions, navigate, onCreate }: HomeProps) {
  // Page projections do not establish global totals or handoff readiness.
  const taskItems = tasks.data?.data ?? [];
  const latestTask = taskItems.find((task) => task.lifecycle !== "completed");
  const tasksAvailable = !!tasks.data && !tasks.loading && !tasks.error;
  const sessionsAvailable = !!sessions.data && !sessions.loading && !sessions.error;
  const scope = `Task page ${tasks.page} · ${taskItems.length} shown${tasks.data?.nextCursor ? " · more available" : ""}`;
  const active = taskItems.filter((task) => task.lifecycle === "active").length;
  const attention = taskItems.filter((task) => task.attention.length > 0).length;
  const selectedProject = projects.find((project) => project.id === params.get("p"));
  const taskHref = (task: TaskSummary) => "?" + query({ v: "inbox", t: task.id, p: params.get("p") });
  const openTask = (event: React.MouseEvent<HTMLAnchorElement>, task: TaskSummary) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate({ t: task.id });
  };
  const heroStatus = tasks.error ? "Task index unavailable" : tasks.loading ? "Reading your task index…"
    : latestTask ? (latestTask.attention.length ? "Evidence needs review" : "Review context to continue")
      : taskItems.length ? "No unfinished tasks on this page" : "Start with a task or imported session";
  return (
    <div className="home-view">
      <section className="home-hero" aria-labelledby="home-heading">
        <div className="hero-copy">
          <div className="hero-kicker"><Icon name="inbox" size={15} /> Your local inbox</div>
          <h1 id="home-heading">Continue where<br />the work left off.</h1>
          <p>Your tasks, decisions and evidence, together.<br className="desktop-break" /> Pick up the thread. Carry the context forward.</p>
          <div className="hero-task-line" role="status"><span className={"signal " + (latestTask?.attention.length || tasks.error ? "signal-warning" : "")} aria-hidden="true" /><span>{heroStatus}</span></div>
          {tasksAvailable && latestTask && <p className="hero-task-title" title={latestTask.title}>{latestTask.title}</p>}
          <div className="hero-actions">
            {tasksAvailable && latestTask && <a className="primary-link" href={taskHref(latestTask)} onClick={(event) => openTask(event, latestTask)}>Open task <Icon name="arrow-up-right" size={17} /></a>}
            <button className={latestTask ? "quiet" : ""} onClick={() => onCreate()}><Icon name="plus" size={17} /> New task</button>
            <button className="text-button" onClick={() => navigate({ v: "history", t: null })}>Browse history <Icon name="chevron-right" size={15} /></button>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" />
          <div className="orbit-core"><Icon name="layers" size={32} strokeWidth={1.4} /></div>
          <span className="orbit-label orbit-label-top">THREADPORT</span><span className="orbit-label orbit-label-bottom">KEEP THE CONTEXT</span>
        </div>
        <div className="hero-rail">
          <h2>From thread to next step</h2>
          <ol className="workflow-steps">
            <li><Icon name="inbox" /><div><strong>Find your task</strong><small>Bring unfinished work together.</small></div></li>
            <li><Icon name="layers" /><div><strong>Review the evidence</strong><small>Decisions, files and results.</small></div></li>
            <li><Icon name="arrow-up-right" /><div><strong>Prepare a continuation</strong><small>Review before you launch.</small></div></li>
          </ol>
          <p className="hero-rail-note"><Icon name="terminal" size={15} /> You confirm in the terminal.</p>
        </div>
      </section>
      <div className="overview-heading"><span>{selectedProject?.name ?? "All projects"}</span><small>{tasksAvailable ? scope : tasks.error ? "Task counts unavailable" : "Loading task counts…"}</small></div>
      <section className="metric-grid" aria-label="Current page counts">
        <MetricCard icon="layers" label="Active tasks" value={tasksAvailable ? String(active) : "—"} detail="On this task page" tone="blue" />
        <MetricCard icon="activity" label="Need review" value={tasksAvailable ? String(attention) : "—"} detail="Tasks with evidence flags" tone="amber" />
        <MetricCard icon="box" label="Unassigned sessions" value={sessionsAvailable ? String(sessions.data!.data.length) + (sessions.data!.nextCursor ? "+" : "") : "—"} detail={sessions.error ? "Session counts unavailable" : `Session page ${sessions.page} · includes unbound`} tone="violet" />
      </section>
      <section className="home-grid">
        <div className="surface-panel activity-panel">
          <div className="panel-heading-row"><div><h2>Recently edited</h2><p>From the current task page</p></div><button className="text-button" onClick={() => navigate({ list: "1" })}>All tasks <Icon name="arrow-up-right" size={15} /></button></div>
          <div className="activity-list" aria-busy={tasks.loading}>
            {tasks.loading ? <p className="loading-line">Reading your local task index…</p> : tasks.error ? <p className="loading-line">Task data unavailable. Retry in Your tasks below.</p> : taskItems.slice(0, 5).map((task) => (
              <a className="activity-row" key={task.id} href={taskHref(task)} onClick={(event) => openTask(event, task)}>
                <span className={"activity-icon " + (task.attention.length ? "activity-icon-warning" : "")}><Icon name={task.attention.length ? "activity" : task.lifecycle === "completed" ? "check" : "terminal"} size={17} /></span>
                <span className="activity-main"><strong>{task.title}</strong><small>{task.attention.length ? attentionLabel(task.attention[0]) : task.nextAction.text || task.objective.text || "No next action recorded"}</small></span>
                <span className="activity-meta"><small>Edited {dateLabel(task.updatedAt)}</small><span className="activity-tag">{task.lifecycle}</span></span>
              </a>
            ))}
            {tasksAvailable && !taskItems.length && <div className="empty-home"><Icon name="inbox" size={22} /><p>No tasks match this view. Create one or adjust the filters below.</p></div>}
          </div>
        </div>
        <div className="surface-panel projects-panel">
          <div className="panel-heading-row"><div><h2>Projects</h2><p>Task distribution on this page</p></div><span className="panel-count">{projects.length} local</span></div>
          {selectedProject && <button className="text-button clear-project" onClick={() => navigate({ p: null, t: null })}>Clear project filter</button>}
          <div className="project-list">
            {projects.map((project, index) => {
              const count = taskItems.filter((task) => task.projectId === project.id).length;
              return <button className={"project-row " + (project.id === params.get("p") ? "project-row-selected" : "")} key={project.id} aria-pressed={project.id === params.get("p")} onClick={() => navigate({ p: project.id, t: null })}>
                <span className={"project-dot project-dot-" + (index % 5)} />
                <span className="project-name"><strong>{project.name}</strong><small>{tasksAvailable ? `${count} shown on task page ${tasks.page}` : "Task counts unavailable"}</small></span>
                <span className="project-load"><meter min={0} max={Math.max(1, taskItems.length)} value={tasksAvailable ? count : 0} aria-label={`${project.name}: tasks on the current page`} /><small>{tasksAvailable ? count : "—"}</small></span>
              </button>;
            })}
          </div>
          <button className="project-footer" onClick={() => navigate({ v: "settings", t: null })}><Icon name="settings" size={15} /> Manage workspaces & sources <Icon name="chevron-right" size={15} /></button>
        </div>
      </section>
      <section className="home-footer-strip"><div className="footer-statement"><Icon name="link" size={19} /><span><strong>Your code. Your context.</strong><small>Stored on this device.</small></span></div><span className="footer-meta">Review evidence before every continuation.</span></section>
    </div>
  );
}

function MetricCard({ icon, label, value, detail, tone }: { icon: IconName; label: string; value: string; detail: string; tone: string }) {
  return <article className={`metric-card metric-${tone}`}>
    <span className="metric-icon"><Icon name={icon} size={22} /></span>
    <div><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>
    <span className="metric-decoration" aria-hidden="true" />
  </article>;
}