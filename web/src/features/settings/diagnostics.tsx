import { type ApiClient, type Envelope, useLoad } from "../../api.js";
import { ErrorNotice, Modal, useAction } from "../../components.js";
import { useState } from "react";
export function Diagnostics({
  api,
  onClose,
}: {
  api: ApiClient;
  onClose: () => void;
}) {
  const value = useLoad<Envelope<unknown>>(api, "/diagnostics"),
    action = useAction(),
    [copied, setCopied] = useState(false);
  const text = value.data ? JSON.stringify(value.data.data, null, 2) : "";
  return (
    <Modal title="Diagnostic preview" onClose={onClose}>
      <p>
        Version, platform, counts and known error codes only. Nothing is
        uploaded automatically.
      </p>
      <ErrorNotice error={value.error} />
      <ErrorNotice error={action.error} focus />
      {value.loading && <p role="status">Loading diagnostics…</p>}
      {text && (
        <>
          <pre className="evidence" aria-label="Diagnostic content">
            {text}
          </pre>
          <button
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await navigator.clipboard.writeText(text);
                setCopied(true);
              })
            }
          >
            Copy diagnostic report
          </button>
        </>
      )}
      {copied && <p role="status">Diagnostic report copied.</p>}
    </Modal>
  );
}
export function StorageInfo({ api }: { api: ApiClient }) {
  const settings = useLoad<Envelope<{ dataDir: string }>>(api, "/settings"),
    status = useLoad<
      Envelope<{
        capacity: {
          events: number;
          eventLimit: number;
          indexedBytes: number;
          byteLimit: number;
        };
      }>
    >(api, "/status");
  return (
    <section className="panel">
      <h2>Local storage</h2>
      <button
        className="quiet"
        onClick={() => {
          settings.reload();
          status.reload();
        }}
      >
        Refresh storage
      </button>
      <ErrorNotice error={settings.error} />
      <ErrorNotice error={status.error} />
      {settings.data && <p className="path">{settings.data.data.dataDir}</p>}
      {status.data && (
        <p>
          {status.data.data.capacity.events.toLocaleString()} /{" "}
          {status.data.data.capacity.eventLimit.toLocaleString()} events ·{" "}
          {(status.data.data.capacity.indexedBytes / 1024 ** 2).toFixed(1)} /{" "}
          {(status.data.data.capacity.byteLimit / 1024 ** 2).toFixed(0)} MiB
          indexed
        </p>
      )}
    </section>
  );
}
