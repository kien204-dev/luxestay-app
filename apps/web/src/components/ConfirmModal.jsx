const TONE_COLOR = {
  danger: "var(--color-danger)",
  warning: "var(--color-warning)",
  default: "var(--color-gold-500)",
};

const LIGHT_TONE_COLOR = {
  danger: "#dc2626",
  warning: "#d97706",
  default: "#002366",
};

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  tone = "default",
  loading = false,
  onConfirm,
  onCancel,
  variant = "dark",
}) {
  if (!open) return null;

  const isLight = variant === "light";
  const accent = (isLight ? LIGHT_TONE_COLOR : TONE_COLOR)[tone] || (isLight ? LIGHT_TONE_COLOR.default : TONE_COLOR.default);

  return (
    <div
      onClick={() => !loading && onCancel?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3500,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          background: isLight ? "#fff" : "var(--color-navy-700)",
          border: isLight ? "1px solid #e2e8f0" : "1px solid var(--color-border-soft)",
          borderRadius: isLight ? 16 : "var(--radius-lg)",
          padding: 24,
          boxShadow: isLight ? "0 24px 80px rgba(15,23,42,0.25)" : "var(--shadow-card-hover)",
        }}
      >
        <h3
          style={{
            margin: "0 0 10px",
            fontFamily: isLight ? undefined : "var(--font-serif)",
            fontSize: 18,
            fontWeight: 700,
            color: isLight ? "#002366" : "var(--color-text-primary)",
          }}
        >
          {title}
        </h3>

        <p
          style={{
            margin: "0 0 22px",
            fontSize: 14,
            lineHeight: 1.6,
            color: isLight ? "#64748b" : "var(--color-text-secondary)",
          }}
        >
          {message}
        </p>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 10,
              border: isLight ? "1px solid #d1d5db" : "1px solid var(--color-border-soft)",
              background: "transparent",
              color: isLight ? "#475569" : "var(--color-text-secondary)",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: accent,
              color: isLight ? "#fff" : "var(--color-navy-950)",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Đang xử lý..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
