import { useAppStore, type Toast } from "../lib/store";

const colorMap: Record<Toast["type"], { bg: string; fg: string }> = {
  success: { bg: "var(--color-success)", fg: "#c0d0c0" },
  error: { bg: "#5a3a3a", fg: "#d0c0c0" },
  info: { bg: "var(--color-primary)", fg: "var(--color-primary-fg)" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useAppStore((s) => s.removeToast);
  const c = colorMap[toast.type];

  return (
    <div
      onClick={() => removeToast(toast.id)}
      style={{
        background: c.bg,
        color: c.fg,
        padding: "10px 16px",
        fontSize: 12,
        cursor: "pointer",
        animation: "toast-in 0.25s ease",
        maxWidth: 360,
      }}
    >
      {toast.message}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  );
}
