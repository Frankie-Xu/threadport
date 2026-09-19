import { usePage } from "./api.js";
import { ApiError, type RecoveryAction } from "./api.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function ErrorNotice({
  error,
  focus = false,
  onRecovery,
}: {
  error?: Error | null;
  focus?: boolean;
  onRecovery?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error && focus) ref.current?.focus();
  }, [error, focus]);
  if (!error) return null;
  const recovery = error instanceof ApiError ? error.recovery : "none";
  const labels: Record<RecoveryAction, string> = {
    reconnect: "Reconnect",
    retry: "Try again",
    refresh: "Refresh",
    "edit-and-save": "Review and save",
    "review-path": "Review path",
    "export-only": "Export instead",
    none: "",
  };
  // Recovery must be supplied by the owner; reloading loses in-memory drafts and auth.
  const recover = onRecovery;
  return (
    <div className="notice error" role="alert" tabIndex={-1} ref={ref}>
      <div>{error.message}</div>
      {recovery !== "none" && recover && (
        <button type="button" className="quiet" onClick={recover}>
          {labels[recovery]}
        </button>
      )}
    </div>
  );
}
export function useAction() {
  const guard = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  return {
    busy,
    error,
    setError,
    async run(action: () => Promise<void>) {
      if (guard.current) return;
      guard.current = true;
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (error) {
        setError(
          error instanceof Error
            ? error
            : new Error("The operation failed. Try again."),
        );
      } finally {
        guard.current = false;
        setBusy(false);
      }
    },
  };
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void | boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (onClose() === false) ref.current?.showModal();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="quiet"
          aria-label="Close dialog"
          onClick={() => ref.current?.close()}
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">
        ◇
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function PageControls({
  page,
  hasNext,
  loading,
  onPrevious,
  onNext,
  onReset,
}: {
  page: number;
  hasNext: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onReset: () => void;
}) {
  return (
    <div className="pagination">
      <button className="quiet" onClick={onReset} disabled={loading}>
        Refresh results
      </button>
      <span>Page {page}</span>
      <button
        className="quiet"
        onClick={onPrevious}
        disabled={page === 1 || loading}
      >
        Previous
      </button>
      <button className="quiet" onClick={onNext} disabled={!hasNext || loading}>
        Next
      </button>
    </div>
  );
}
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning";
}) {
  return <span className={"badge " + tone}>{children}</span>;
}

export function Pager({ load }: { load: ReturnType<typeof usePage<unknown>> }) {
  return (
    <PageControls
      page={load.page}
      hasNext={!!load.data?.nextCursor}
      loading={load.loading}
      onPrevious={load.previous}
      onNext={load.next}
      onReset={load.reset}
    />
  );
}
