import { useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../../../components/Dialog";
import { Alert } from "../../../components/admin/ax";
import { Control, Field, FieldError, PasswordInput, inputProps } from "../../../components/auth/fields";
import { createUser, updateUser } from "../../../services/userService";
import { apiErrorText } from "../../../utils/apiError";
import { EMAIL_PATTERN } from "../../../utils/format";
import { isStrongPassword } from "../../../utils/password";

export const LOCK_REASONS = ["fraud", "spam", "abuse", "request", "other"];
const NOTE_MAX = 500;

// Locking an account: what it does (signed out everywhere, no new sign-in
// or booking; bookings to come are kept), why (required, from the API's
// list) and an internal note. The account holder never sees either.
export function LockDialog({ user, busy, onConfirm, onClose }) {
  const { t } = useTranslation("users");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const error = tried && !reason ? t("lock.reasonRequired") : "";
  const close = () => !busy && onClose();

  return (
    <Dialog className="ui-dialog ax-modal" onClose={close} aria-labelledby="lock-title" data-testid="lock-dialog">
      <div className="ui-dialog-head">
        <h2 id="lock-title">{t("lock.title", { name: user.name })}</h2>
        <button type="button" className="ui-button ui-button--icon" aria-label={t("common:dialog.close")} onClick={close} disabled={busy}>
          <CloseIcon />
        </button>
      </div>
      <div className="ui-dialog-body ax-modal__body">
        <p>
          {t("lock.effect", { email: user.email })}{" "}
          {user.upcoming_count > 0 && <b className="ax-ink">{t("lock.upcoming", { count: user.upcoming_count })}</b>}
        </p>
        <div className="g-field">
          <label className="g-label" htmlFor="lock-reason">{t("lock.reason")}</label>
          <select
            id="lock-reason"
            className={`ax-select${error ? " is-invalid" : ""}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "lock-reason-error" : undefined}
            data-autofocus
          >
            <option value="">{t("lock.chooseReason")}</option>
            {LOCK_REASONS.map((key) => (
              <option key={key} value={key}>{t(`lock.reasons.${key}`)}</option>
            ))}
          </select>
          <FieldError id="lock-reason-error">{error}</FieldError>
        </div>
        <div className="g-field">
          <label className="g-label" htmlFor="lock-note">{t("lock.note")} <span className="ax-opt">{t("lock.optional")}</span></label>
          <div className="fx-control">
            <textarea id="lock-note" rows={3} maxLength={NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <p className="fx-help">{t("lock.noteHint", { count: note.length, max: NOTE_MAX })}</p>
        </div>
      </div>
      <div className="ui-dialog-foot">
        <button type="button" className="ui-button ui-button--secondary" onClick={close} disabled={busy}>
          {t("lock.cancel")}
        </button>
        <button
          type="button"
          className="ui-button ui-button--danger"
          disabled={busy}
          onClick={() => {
            setTried(true);
            if (reason) onConfirm({ reason, note: note.trim() });
          }}
          data-testid="lock-confirm"
        >
          {busy ? t("common:dialog.working") : t("lock.action")}
        </button>
      </div>
    </Dialog>
  );
}

// Add a user (with a temporary password they change at first sign-in) or
// edit one. An admin cannot take away their own admin role.
export function UserDrawer({ user, isSelf, onClose, onSaved, onDelete }) {
  const { t } = useTranslation("users");
  const adding = !user;
  const [form, setForm] = useState({ name: user?.name || "", email: user?.email || "", password: "", role: user?.role || "user" });
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const errors = {};
  if (!form.name.trim()) errors.name = t("form.nameRequired");
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = t("form.emailInvalid");
  if (adding && !isStrongPassword(form.password)) errors.password = t("form.passwordRule");
  const shown = tried ? errors : {};

  const submit = async (event) => {
    event.preventDefault();
    setTried(true);
    setFailure("");
    if (Object.keys(errors).length) {
      document.getElementById(`user-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), email: form.email.trim(), role: form.role };
      const result = adding ? await createUser({ ...payload, password: form.password }) : await updateUser(user.id, payload);
      onSaved(result.user, adding);
    } catch (err) {
      setFailure(apiErrorText(err, "users:form.saveFailed"));
      setSaving(false);
    }
  };
  const close = () => !saving && onClose();

  return (
    <Dialog className="ax-drawer" onClose={close} aria-labelledby="user-title" data-testid="user-drawer">
      <form className="ax-drawer__form" onSubmit={submit} noValidate data-testid="user-form">
        <div className="ax-drawer__head">
          <div>
            <div className="ax-eyebrow">{t("form.eyebrow")}</div>
            <h2 id="user-title">{adding ? t("form.addTitle") : user.name}</h2>
          </div>
          <button type="button" className="ax-iconbtn" aria-label={t("common:dialog.close")} onClick={close}>
            <CloseIcon />
          </button>
        </div>
        <div className="ax-drawer__body ax-drawer__body--form">
          <Field id="user-name" label={t("form.name")} error={shown.name}>
            <Control invalid={shown.name}>
              <input {...inputProps("user-name", shown.name)} value={form.name} maxLength={100} autoComplete="off" onChange={set("name")} data-autofocus />
            </Control>
          </Field>
          <Field id="user-email" label={t("form.email")} error={shown.email}>
            <Control invalid={shown.email}>
              <input {...inputProps("user-email", shown.email)} type="email" value={form.email} maxLength={255} autoComplete="off" onChange={set("email")} />
            </Control>
          </Field>
          {adding && (
            <Field id="user-password" label={t("form.password")} error={shown.password} help={<p className="fx-help">{t("form.passwordHint")}</p>}>
              <PasswordInput id="user-password" error={shown.password} value={form.password} onChange={set("password")} autoComplete="new-password" />
            </Field>
          )}
          <fieldset className="ax-radiocards">
            <legend className="g-label">{t("form.role")}</legend>
            {["user", "admin"].map((role) => (
              <label key={role} className={`ax-radiocard${form.role === role ? " is-on" : ""}`}>
                <input type="radio" name="role" value={role} checked={form.role === role} onChange={set("role")} disabled={isSelf} />
                <span>
                  <b>{t(`admin:roles.${role}`)}</b>
                  <small>{t(`form.roleHint.${role}`)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {isSelf && <p className="fx-help">{t("form.ownRole")}</p>}
          {failure && <Alert>{failure}</Alert>}
        </div>
        <div className="ax-drawer__foot">
          {!adding && !isSelf && (
            <button type="button" className="g-btn ax-btn-ghost-danger" onClick={() => onDelete(user)} disabled={saving}>
              {t("actions.delete")}
            </button>
          )}
          <span className="is-grow" />
          <button type="button" className="g-btn g-btn--outline" onClick={close} disabled={saving}>
            {t("form.cancel")}
          </button>
          <button type="submit" className="g-btn g-btn--primary" disabled={saving} data-testid="user-save">
            {saving ? t("admin:saving") : adding ? t("form.create") : t("form.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
