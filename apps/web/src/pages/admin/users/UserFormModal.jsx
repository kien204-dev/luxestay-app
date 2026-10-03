import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Field, Modal } from "../../../components/admin/ui";
import { createUser, updateUser } from "../../../services/userService";
import { isStrongPassword } from "../../../utils/password";
import { apiErrorText } from "../../../utils/apiError";

// Add a user (with a temporary password) or edit one. `user` is null when
// adding. Calls onSaved(savedUser, created).
export default function UserFormModal({ user, isSelf, onClose, onSaved }) {
  const { t } = useTranslation("users");
  const adding = !user;
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    password: "",
    role: user?.role || "user",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) return setError(t("form.nameEmailRequired"));
    if (adding && !isStrongPassword(form.password)) return setError(t("form.passwordRule"));

    setSaving(true);
    try {
      const payload = { name: form.name.trim(), email: form.email.trim(), role: form.role };
      const result = adding ? await createUser({ ...payload, password: form.password }) : await updateUser(user.id, payload);
      onSaved(result.user, adding);
    } catch (err) {
      setError(apiErrorText(err, "users:form.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={adding ? t("form.addTitle") : t("form.editTitle")} onClose={onClose} busy={saving} labelledBy="user-form-title">
      <form onSubmit={submit} className="adm-modal-body" data-testid="user-form">
        <Field label={t("form.name")} htmlFor="user-name">
          <input id="user-name" className="adm-input" value={form.name} onChange={set("name")} maxLength={100} autoComplete="off" />
        </Field>
        <Field label={t("form.email")} htmlFor="user-email">
          <input id="user-email" type="email" className="adm-input" value={form.email} onChange={set("email")} maxLength={255} autoComplete="off" />
        </Field>
        {adding && (
          <Field label={t("form.password")} htmlFor="user-password" hint={t("form.passwordHint")}>
            <input id="user-password" type="password" className="adm-input" value={form.password} onChange={set("password")} autoComplete="new-password" />
          </Field>
        )}
        <Field label={t("form.role")} htmlFor="user-role" hint={isSelf ? t("form.ownRole") : undefined}>
          <select id="user-role" className="adm-select" value={form.role} onChange={set("role")} disabled={isSelf}>
            <option value="user">{t("admin:roles.user")}</option>
            <option value="admin">{t("admin:roles.admin")}</option>
          </select>
        </Field>

        <Alert>{error}</Alert>

        <div className="adm-modal-footer">
          <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
            {saving ? t("admin:saving") : t("admin:save")}
          </button>
          <button type="button" className="adm-btn adm-btn--muted" onClick={onClose} disabled={saving}>
            {t("admin:cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
