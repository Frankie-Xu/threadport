import { useEffect, useState } from "react";
import { ApiError, type ApiClient, type Envelope } from "../../api.js";
import { ErrorNotice, Modal, useAction } from "../../components.js";
export function ExportReview({
  api,
  id,
  kind,
  onClose,
}: {
  api: ApiClient;
  id: string;
  kind: "task" | "handoff";
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<{
      text: string;
      fileName: string;
      digest: string;
    } | null>(null),
    [directory, setDirectory] = useState(""),
    [ack, setAck] = useState(false),
    [notice, setNotice] = useState(""),
    [tick, setTick] = useState(0);
  const action = useAction();
  const [format, setFormat] = useState<"markdown" | "json">(
    kind === "handoff" ? "json" : "markdown",
  );
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setAck(false);
    setNotice("");
    action.setError(null);
    api
      .request<Envelope<NonNullable<typeof preview>>>(
        "/exports/preview",
        "POST",
        { kind, id, format },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) setPreview(result.data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) action.setError(error);
      });
    return () => controller.abort();
  }, [api, id, kind, format, tick]);
  return (
    <Modal title="Export metadata" onClose={onClose}>
      <p>Review the complete metadata. Existing files are never replaced.</p>
      {kind === "handoff" && (
        <label>
          Export format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "markdown" | "json")}
            disabled={action.busy}
          >
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
          </select>
        </label>
      )}
      <ErrorNotice
        error={action.error}
        focus
        onRecovery={action.error instanceof ApiError &&
          (action.error.recovery === "refresh" || (!preview && action.error.recovery === "retry"))
          ? () => {
            action.setError(null);
            setTick((n) => n + 1);
          }
          : undefined}
      />
      {!preview && !action.error && <p role="status">Preparing export…</p>}
      {preview && (
        <>
          <p>
            File: <strong>{preview.fileName}</strong>
          </p>
          <pre className="evidence" aria-label="Export content" tabIndex={0}>
            {preview.text}
          </pre>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api.request("/exports", "POST", {
                  kind,
                  id,
                  format,
                  directory,
                  expectedDigest: preview.digest,
                });
                setNotice("Export saved: " + preview.fileName);
                setAck(false);
              });
            }}
          >
            <label>
              Export directory
              <input
                required
                value={directory}
                onChange={(e) => {
                  setDirectory(e.target.value);
                  setNotice("");
                }}
                placeholder="Existing absolute directory"
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I reviewed this metadata export
            </label>
            <button disabled={action.busy || !ack}>Write export</button>
          </form>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      <button
        className="quiet"
        disabled={action.busy}
        onClick={() => {
          action.setError(null);
          setTick((n) => n + 1);
        }}
      >
        Refresh export preview
      </button>
    </Modal>
  );
}
