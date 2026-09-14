import {
  type ApiClient,
  type SearchItem,
  usePage,
  query,
  dateLabel,
} from "../../api.js";
import { ErrorNotice, Empty, StatusBadge, Pager } from "../../components.js";
function filterDate(value: string, end: boolean) {
  const date = new Date(value + (end ? "T23:59:59.999" : "T00:00:00"));
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}
function Highlight({
  text,
  ranges,
}: {
  text: string;
  ranges: { start: number; end: number }[];
}) {
  const parts: React.ReactNode[] = [];
  let offset = 0;
  for (const range of ranges) {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < offset ||
      range.end <= range.start ||
      range.end > text.length
    )
      continue;
    parts.push(
      text.slice(offset, range.start),
      <mark key={range.start}>{text.slice(range.start, range.end)}</mark>,
    );
    offset = range.end;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}
export function History({
  api,
  params,
  navigate,
}: {
  api: ApiClient;
  params: URLSearchParams;
  navigate: (values: Record<string, string | null>) => void;
}) {
  const results = usePage<SearchItem>(
    api,
    "/sessions?" +
      query({
        q: params.get("q"),
        projectId: params.get("p"),
        agent: params.get("agent"),
        from: params.get("from")
          ? filterDate(params.get("from")!, false)
          : null,
        to: params.get("to") ? filterDate(params.get("to")!, true) : null,
        limit: 20,
      }),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FOLLOW THE EVIDENCE</p>
          <h1>History</h1>
          <p>Search session messages, commands and task context.</p>
        </div>
      </div>
      <div className="filters">
        <label className="filter-agent">
          Agent
          <select
            value={params.get("agent") ?? ""}
            onChange={(e) => navigate({ agent: e.target.value })}
          >
            <option value="">All agents</option>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <label>
          From date
          <input
            type="date"
            value={params.get("from") ?? ""}
            onChange={(e) => navigate({ from: e.target.value })}
          />
        </label>
        <label>
          To date
          <input
            type="date"
            value={params.get("to") ?? ""}
            onChange={(e) => navigate({ to: e.target.value })}
          />
        </label>
      </div>
      <ErrorNotice error={results.error} />
      {results.loading && <p role="status">Searching history…</p>}
      {results.data?.data.map((item) => (
        <article className="panel" key={item.id}>
          <div className="result-meta">
            <StatusBadge>{item.agent ?? "Unknown agent"}</StatusBadge>
            <span>{dateLabel(item.lastActivityAt)}</span>
          </div>
          <h2>
            {item.task ? (
              <a
                href={"?v=inbox&t=" + encodeURIComponent(item.task.id)}
                onClick={(e) => {
                  e.preventDefault();
                  navigate({ v: "inbox", t: item.task!.id });
                }}
              >
                {item.task.title}
              </a>
            ) : (
              "Unassigned session"
            )}
          </h2>
          {item.matches.map((match, index) => (
            <div key={index}>
              <small>{match.field}</small>
              <pre className="evidence">
                <Highlight text={match.text} ranges={match.highlights} />
              </pre>
            </div>
          ))}
        </article>
      ))}
      {results.data?.data.length === 0 && (
        <Empty title="No matching history">
          Try different words or another project. Only configured sources are
          searched.
        </Empty>
      )}
      <Pager load={results} />
    </>
  );
}
