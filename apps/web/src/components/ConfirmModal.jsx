import { useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "./Dialog";

function ConfirmDialog({ title, message, confirmLabel, cancelLabel, tone, loading, confirmCode, onConfirm, onCancel }) {
  const { t } = useTranslation("common");
  const [typed, setTyped] = useState("");
  const danger = tone === "danger";
  const codeMatches = !confirmCode || typed.trim().toUpperCase() === confirmCode.toUpperCase();
  const cancel = () => !loading && onCancel?.();

  return (
    <Dialog onClose={cancel} role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <div className="ui-dialog-head">
        <div>
          {danger && (
            <div className="ui-confirm-mark">
              <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
              </svg>
            </div>
          )}
          <h2 id="confirm-title">{title}</h2>
        </div>
        <button type="button" className="ui-button ui-button--icon" aria-label={t("dialog.close")} onClick={cancel} disabled={loading}>
          <CloseIcon />
        </button>
      </div>

      <div className="ui-dialog-body">
        <p id="confirm-message">{message}</p>
        {confirmCode && (
          <label className="ui-confirm-code">
            <span>
              {t("dialog.typeToConfirm")} <b>{confirmCode}</b>
            </span>
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-testid="confirm-code"
            />
          </label>
        )}
      </div>

      <div className="ui-dialog-foot">
        {/* Focus starts on the safe choice. */}
        <button type="button" className="ui-button ui-button--secondary" onClick={onCancel} disabled={loading} data-autofocus>
          {cancelLabel || t("dialog.cancel")}
        </button>
        <button
          type="button"
          className={`ui-button ${danger ? "ui-button--danger" : "ui-button--primary"}`}
          onClick={onConfirm}
          disabled={loading || !codeMatches}
          data-testid="confirm-ok"
        >
          {loading ? t("dialog.working") : confirmLabel || t("dialog.confirm")}
        </button>
      </div>
    </Dialog>
  );
}

// A yes/no question in a modal dialog, the same on the guest site and in the
// admin area. `tone="danger"` is for deleting. `confirmCode` makes the user
// type that code before the confirm button works: for deletions that cannot
// be undone and take other records with them.
export default function ConfirmModal({ open, tone = "default", loading = false, ...rest }) {
  if (!open) return null;
  return <ConfirmDialog tone={tone} loading={loading} {...rest} />;
}
