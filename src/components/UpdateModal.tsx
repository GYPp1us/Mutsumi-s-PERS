import { useAppStore } from "../lib/store";
import { ActionButton } from "./ActionButton";
import { checkForUpdate, downloadAndInstallUpdate } from "../lib/tauri";
import { useState } from "react";

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 200,
  background: "rgba(0,0,0,0.5)", display: "flex",
  alignItems: "center", justifyContent: "center",
};

const panelStyle: React.CSSProperties = {
  background: "var(--color-panel)", width: 420,
  padding: "24px 28px",
};

const barOuter: React.CSSProperties = {
  background: "var(--color-card)", height: 6, marginTop: 12, overflow: "hidden",
};

const barInner: React.CSSProperties = {
  background: "var(--color-primary)", height: "100%",
  transition: "width 0.2s ease",
};

export function UpdateModal() {
  const available = useAppStore((s) => s.updateAvailable);
  const progress = useAppStore((s) => s.updateProgress);
  const status = useAppStore((s) => s.updateStatus);
  const setAvailable = useAppStore((s) => s.setUpdateAvailable);
  const setProgress = useAppStore((s) => s.setUpdateProgress);
  const setStatus = useAppStore((s) => s.setUpdateStatus);
  const [error, setError] = useState("");

  const handleCheck = async () => {
    setStatus("checking");
    setError("");
    try {
      const update = await checkForUpdate();
      if (update) {
        setAvailable({ version: update.version, body: update.body });
        setStatus("available");
      } else {
        setAvailable(null);
        setStatus("idle");
      }
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  };

  const handleInstall = async () => {
    const update = await checkForUpdate();
    if (!update) return;
    setStatus("downloading");
    setProgress({ downloaded: 0, total: 0 });
    try {
      let downloaded = 0;
      await downloadAndInstallUpdate(update, (event) => {
        if (event.event === "Started") {
          setProgress({ downloaded: 0, total: event.data.contentLength ?? 0 });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const prev = useAppStore.getState().updateProgress;
          setProgress({ downloaded, total: prev?.total ?? 0 });
        }
      });
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  };

  const handleDismiss = () => {
    setAvailable(null);
    setProgress(null);
    setStatus("idle");
    setError("");
  };

  const pct = progress && progress.total > 0
    ? Math.round((progress.downloaded / progress.total) * 100)
    : 0;

  const show = status === "available" || status === "downloading" || status === "error";
  if (!show) return null;

  return (
    <div style={overlayStyle} onClick={handleDismiss}>
      <div onClick={(e) => e.stopPropagation()} style={panelStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text)", marginBottom: 16 }}>
          Update Available
        </div>

        {status === "available" && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
              Version {available?.version}
            </div>
            {available?.body && (
              <div style={{
                fontSize: 11, color: "var(--color-text-muted)", marginBottom: 16,
                maxHeight: 120, overflowY: "auto", whiteSpace: "pre-wrap",
                background: "var(--color-card)", padding: "10px 12px",
              }}>
                {available.body}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <ActionButton
                loading={false}
                onClick={handleDismiss}
                style={{ background: "var(--color-card)", color: "var(--color-text-secondary)" }}
              >
                Later
              </ActionButton>
              <ActionButton
                loading={false}
                onClick={handleInstall}
                style={{ background: "var(--color-primary)", color: "var(--color-primary-fg)" }}
              >
                Download &amp; Install
              </ActionButton>
            </div>
          </>
        )}

        {status === "downloading" && (
          <>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              Downloading... {progress ? `${pct}%` : ""}
            </div>
            <div style={barOuter}>
              <div style={{ ...barInner, width: `${pct}%` }} />
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 12, color: "var(--color-warning)", marginBottom: 16 }}>
              {error || "Update failed."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <ActionButton
                loading={false}
                onClick={handleDismiss}
                style={{ background: "var(--color-card)", color: "var(--color-text-secondary)" }}
              >
                Close
              </ActionButton>
              <ActionButton
                loading={false}
                onClick={handleCheck}
                style={{ background: "var(--color-primary)", color: "var(--color-primary-fg)" }}
              >
                Retry
              </ActionButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
