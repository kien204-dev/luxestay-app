import { useTranslation } from "react-i18next";

// A yes/no question in a dialog, in the theme of the page it opens on.
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "default",
  loading = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation("common");
  if (!open) return null;

  return (
    <div className="confirm-backdrop" onClick={() => !loading && onCancel?.()}>
      <div
        className={`confirm-dialog confirm-dialog--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title">{title}</h3>
        <p id="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={onCancel} disabled={loading}>
            {cancelLabel || t("dialog.cancel")}
          </button>
          <button type="button" className="confirm-ok" onClick={onConfirm} disabled={loading} data-testid="confirm-ok">
            {loading ? t("dialog.working") : confirmLabel || t("dialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
