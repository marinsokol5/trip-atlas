import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  CloudAlert,
  CloudCheck,
  CloudDownload,
  CloudOff,
  CloudSync,
} from "lucide-react";
import {
  fetchOfflineManifest,
  isDocument,
  offlineChanges,
  offlineSupported,
  readOfflineState,
  removeOffline,
  standalone,
  syncOffline,
} from "./offline";
import type { OfflineManifest, OfflineState } from "./offline";

type Status =
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "unsaved"; manifest: OfflineManifest }
  | { kind: "saving"; done: number; total: number }
  | { kind: "saved" }
  | { kind: "offline" }
  | { kind: "error"; message: string; manifest?: OfflineManifest };

const megabytes = (files: { size: number }[]) =>
  `${(files.reduce((sum, f) => sum + f.size, 0) / 1e6).toFixed(1)} MB`;
const documentCount = (files: { url: string }[]) => {
  const count = files.filter((f) => isDocument(f.url)).length;
  return `${count} document${count === 1 ? "" : "s"}`;
};
const savedAt = (state: OfflineState) =>
  new Date(state.savedAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
// Safari clears a website's storage after a week without visits; Home Screen apps keep it.
const iosBrowser = () =>
  /iPhone|iPad|Macintosh/.test(navigator.userAgent) &&
  navigator.maxTouchPoints > 1 &&
  !standalone();

/** Header control for the offline copy: save, automatic sync and offline status. */
export function OfflineMenu() {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(() =>
    offlineSupported() ? { kind: "checking" } : { kind: "unavailable" },
  );
  const [state, setState] = useState<OfflineState>();
  const busy = useRef(false);

  const sync = useCallback(async (manifest: OfflineManifest) => {
    busy.current = true;
    try {
      setState(
        await syncOffline(manifest, (done, total) =>
          setStatus({ kind: "saving", done, total }),
        ),
      );
      setStatus({ kind: "saved" });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
        manifest,
      });
    } finally {
      busy.current = false;
    }
  }, []);

  const check = useCallback(async () => {
    if (busy.current || !offlineSupported()) return;
    const saved = await readOfflineState();
    setState(saved);
    let manifest: OfflineManifest;
    try {
      manifest = await fetchOfflineManifest();
    } catch {
      // No saved copy and no list: this server or build has no offline copy to offer.
      setStatus(saved ? { kind: "offline" } : { kind: "unavailable" });
      return;
    }
    if (!saved) setStatus({ kind: "unsaved", manifest });
    else if (saved.version === manifest.version) setStatus({ kind: "saved" });
    // Saved once on this device: keep it current without asking again.
    else await sync(manifest);
  }, [sync]);

  useEffect(() => {
    // Every update happens after the saved copy and server answer, never during the effect.
    void Promise.resolve().then(check);
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [check]);

  useEffect(() => {
    const node = popup.current;
    if (!open || !node) return;
    node.showPopover();
    const position = () => {
      const rect = trigger.current!.getBoundingClientRect();
      node.style.maxWidth = `${window.innerWidth - 16}px`;
      const bounds = node.getBoundingClientRect();
      node.style.left = `${Math.max(8, Math.min(rect.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
      node.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - bounds.height - 8))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(node);
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", position);
    document.addEventListener("pointerdown", outside);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", keyboard);
      node.hidePopover();
      window.removeEventListener("resize", position);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  if (status.kind === "checking" || status.kind === "unavailable") return null;

  const [Icon, label] =
    status.kind === "unsaved"
      ? [CloudDownload, "Save offline"]
      : status.kind === "saving"
        ? [CloudSync, "Saving offline copy"]
        : status.kind === "saved"
          ? [CloudCheck, "Offline copy up to date"]
          : status.kind === "offline"
            ? [CloudOff, "Offline: showing the saved copy"]
            : [CloudAlert, "Offline copy needs attention"];
  const changes =
    status.kind === "error" && status.manifest
      ? offlineChanges(state, status.manifest)
      : undefined;

  return (
    <div className="offline-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={`theme-button offline-button ${status.kind}`}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        onClick={() => setOpen(!open)}
      >
        <Icon className="icon" strokeWidth={1.75} aria-hidden="true" />
        {status.kind === "offline" && <span>Offline</span>}
      </button>
      <div
        ref={popup}
        id={id}
        className="offline-popup"
        popover="manual"
        role="dialog"
        aria-label="Offline copy"
      >
        <h2>Offline copy</h2>
        {status.kind === "unsaved" && (
          <>
            <p>
              Save the calendar, bookings and documents on this device so they
              open without internet. {megabytes(status.manifest.files)},{" "}
              {documentCount(status.manifest.files)}.
            </p>
            {iosBrowser() && (
              <p className="offline-note">
                On iPhone or iPad, add Trip Atlas to the Home Screen and save it
                from there: Safari clears saved website data after a week
                without visits.
              </p>
            )}
            <button type="button" onClick={() => void sync(status.manifest)}>
              Save offline
            </button>
          </>
        )}
        {status.kind === "saving" && (
          <>
            <p role="status">
              Saving {status.done} of {status.total} files…
            </p>
            <progress value={status.done} max={status.total || 1} />
          </>
        )}
        {status.kind === "saved" && state && (
          <>
            <p>
              Saved on this device and up to date: {megabytes(state.files)},{" "}
              {documentCount(state.files)}. Synced {savedAt(state)}.
            </p>
            <p className="offline-note">
              It syncs by itself whenever Trip Atlas opens with a connection.
            </p>
          </>
        )}
        {status.kind === "offline" && state && (
          <>
            <p>
              Trip Atlas can’t reach the server, so it shows the copy saved{" "}
              {savedAt(state)}: {documentCount(state.files)}.
            </p>
            <p className="offline-note">
              Zoomed-in map outlines aren’t saved offline.
            </p>
            <button type="button" onClick={() => void check()}>
              Check again
            </button>
          </>
        )}
        {status.kind === "error" && (
          <>
            <p role="alert">Couldn’t save the offline copy: {status.message}</p>
            {state && (
              <p className="offline-note">
                The copy saved {savedAt(state)} still works offline
                {changes
                  ? `; ${changes.download.length} changed file${changes.download.length === 1 ? "" : "s"} not saved yet`
                  : ""}
                .
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                void (status.manifest ? sync(status.manifest) : check())
              }
            >
              Try again
            </button>
          </>
        )}
        {state && status.kind !== "saving" && (
          <button
            type="button"
            className="offline-remove"
            onClick={async () => {
              await removeOffline();
              setState(undefined);
              setOpen(false);
              void check();
            }}
          >
            Remove from this device
          </button>
        )}
      </div>
    </div>
  );
}
