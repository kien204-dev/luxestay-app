import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { APP_NAME } from "../config/brand";
import {
  changeCurrentUserPassword,
  getCurrentUser,
  updateCurrentUserProfile,
  uploadAvatar,
} from "../services/userService";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

const initialProfile = {
  name: "",
  email: "",
  phone: "",
  bio: "",
  avatar_url: "",
};

const initialPassword = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

function Settings() {
  const menu = ["Profile", "Security", "Notifications", "System"];
  const { updateCurrentUser } = useAuth();
  const [profile, setProfile] = useState(initialProfile);
  const [savedProfile, setSavedProfile] = useState(initialProfile);
  const [passwordForm, setPasswordForm] = useState(initialPassword);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const initials = useMemo(() => {
    return (profile.name || profile.email || "?")
      .split(" ")
      .map((item) => item[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [profile.email, profile.name]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        setProfileError("");

        const data = await getCurrentUser();
        const nextProfile = normalizeProfile(data);

        setProfile(nextProfile);
        setSavedProfile(nextProfile);
        updateCurrentUser(data);
      } catch (err) {
        setProfileError(
          err.response?.data?.message || "Unable to load profile"
        );
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [updateCurrentUser]);

  const handleProfileChange = (event) => {
    const { name, value } = event.target;

    setProfile((prev) => ({
      ...prev,
      [name]: value,
    }));
    setProfileError("");
    setProfileSuccess("");
  };

  const handleAvatarFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setProfileError("");

    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setProfileError("Only jpg, png, and webp images are allowed");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setProfileError("Image size must be 2MB or smaller");
      return;
    }

    try {
      setUploadingAvatar(true);
      const result = await uploadAvatar(file);
      setProfile((prev) => ({ ...prev, avatar_url: result.avatarUrl || "" }));
    } catch (err) {
      setProfileError(err.response?.data?.message || "Avatar upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePasswordChange = (event) => {
    const { name, value } = event.target;

    setPasswordForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    setPasswordError("");
    setPasswordSuccess("");
  };

  const handleResetProfile = () => {
    setProfile(savedProfile);
    setProfileError("");
    setProfileSuccess("");
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!profile.name.trim() || !profile.email.trim()) {
      setProfileError("Name and email are required");
      return;
    }

    try {
      setSaving(true);
      const result = await updateCurrentUserProfile({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        bio: profile.bio,
        avatar_url: profile.avatar_url,
      });
      const nextProfile = normalizeProfile(result.user);

      setProfile(nextProfile);
      setSavedProfile(nextProfile);
      updateCurrentUser(result.user);
      setProfileSuccess(result.message || "Profile updated successfully");
    } catch (err) {
      setProfileError(
        err.response?.data?.message || "Unable to update profile"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordError("Current password and new password are required");
      return;
    }

    if (
      passwordForm.newPassword.length < 8 ||
      !/[A-Za-z]/.test(passwordForm.newPassword) ||
      !/[0-9]/.test(passwordForm.newPassword)
    ) {
      setPasswordError(
        "New password must be at least 8 characters and include both letters and numbers"
      );
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password confirmation does not match");
      return;
    }

    try {
      setChangingPassword(true);
      const result = await changeCurrentUserPassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      setPasswordForm(initialPassword);
      updateCurrentUser({ must_change_password: false });
      setPasswordSuccess(result.message || "Password changed successfully");
    } catch (err) {
      setPasswordError(
        err.response?.data?.message || "Unable to change password"
      );
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: 320 }}>
        <div className="luxe-skeleton" style={{ height: 32, width: "20%", marginBottom: 28 }} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)", gap: 28 }}>
          <div className="luxe-skeleton" style={{ height: 220, borderRadius: "var(--radius-lg)" }} />
          <div className="luxe-skeleton" style={{ height: 380, borderRadius: "var(--radius-lg)" }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <header style={{ marginBottom: 28 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-serif)",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          Settings
        </h1>
        <p
          style={{
            color: "var(--color-text-muted)",
            marginTop: 8,
            maxWidth: 640,
            lineHeight: 1.6,
          }}
        >
          Refine the digital environment of {APP_NAME}. Manage your identity,
          security protocols, and notification layers.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)",
          gap: 28,
          alignItems: "start",
        }}
      >
        <aside
          style={{
            background: "var(--color-navy-800)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
          }}
        >
          <p
            style={{
              color: "var(--color-gold-400)",
              fontSize: 12,
              letterSpacing: "0.2em",
              fontWeight: 700,
              margin: "0 0 16px",
            }}
          >
            CONFIGURATION
          </p>

          {menu.map((item) => {
            const active = item === "Profile" || item === "Security";
            return (
              <button
                key={item}
                type="button"
                disabled={!active}
                title={active ? item : "This settings section is not available yet"}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  border: "none",
                  borderRadius: 10,
                  background: item === "Profile" ? "var(--color-gold-100)" : "transparent",
                  color: active ? "var(--color-gold-400)" : "var(--color-text-muted)",
                  textAlign: "left",
                  cursor: active ? "default" : "not-allowed",
                  marginBottom: 6,
                  fontWeight: 600,
                  opacity: active ? 1 : 0.55,
                }}
              >
                {item}
              </button>
            );
          })}
        </aside>

        <section>
          <form onSubmit={handleSaveProfile} style={panelStyle}>
            <h2 style={{ margin: "0 0 24px", color: "var(--color-text-primary)" }}>
              Profile Information
            </h2>
            <p style={{ margin: "-14px 0 22px", color: "var(--color-text-muted)", fontSize: 13 }}>
              Your profile details are used across bookings and account
              communication.
            </p>

            {profileError && <Alert type="error">{profileError}</Alert>}
            {profileSuccess && <Alert type="success">{profileSuccess}</Alert>}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px minmax(0, 1fr)",
                gap: 28,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 24,
                    background: "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
                    color: "var(--color-navy-950)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 34,
                    fontWeight: 800,
                    margin: "0 auto 14px",
                    overflow: "hidden",
                  }}
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.name || "Profile avatar"}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    initials
                  )}
                </div>
                <span
                  style={{
                    color: "var(--color-gold-400)",
                    fontWeight: 700,
                    fontSize: 13,
                    display: "block",
                    marginBottom: 10,
                  }}
                >
                  Profile Photo
                </span>

                <label
                  style={{
                    display: "inline-block",
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--color-border-soft)",
                    color: "var(--color-text-primary)",
                    fontSize: 12,
                    cursor: uploadingAvatar || saving ? "not-allowed" : "pointer",
                    opacity: uploadingAvatar || saving ? 0.6 : 1,
                  }}
                >
                  {uploadingAvatar ? "Uploading..." : "Change photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarFileChange}
                    disabled={uploadingAvatar || saving}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              <div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 18,
                    marginBottom: 18,
                  }}
                >
                  <Field
                    label="Full Name"
                    name="name"
                    value={profile.name}
                    onChange={handleProfileChange}
                    disabled={saving}
                  />
                  <Field
                    label="Email Address"
                    name="email"
                    type="email"
                    value={profile.email}
                    onChange={handleProfileChange}
                    disabled={saving}
                  />
                  <Field
                    label="Phone"
                    name="phone"
                    value={profile.phone}
                    onChange={handleProfileChange}
                    disabled={saving}
                  />
                  <Field
                    label="Avatar URL"
                    name="avatar_url"
                    value={profile.avatar_url}
                    onChange={handleProfileChange}
                    disabled={saving}
                  />
                </div>

                <label style={labelStyle}>Bio</label>

                <textarea
                  name="bio"
                  value={profile.bio}
                  onChange={handleProfileChange}
                  disabled={saving}
                  style={{
                    width: "100%",
                    minHeight: 110,
                    background: "var(--color-navy-950)",
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 12,
                    color: "var(--color-text-primary)",
                    padding: 14,
                    resize: "vertical",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 12,
                    marginTop: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleResetProfile}
                    disabled={saving}
                    style={secondaryButtonStyle}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      ...primaryButtonStyle,
                      opacity: saving ? 0.7 : 1,
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >
                    {saving ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </div>
            </div>
          </form>

          <form onSubmit={handleChangePassword} style={panelStyle}>
            <h2 style={{ margin: "0 0 18px", color: "var(--color-text-primary)" }}>
              Security
            </h2>
            <p style={{ margin: "-8px 0 22px", color: "var(--color-text-muted)", fontSize: 13 }}>
              Change your password using your current credentials.
            </p>

            {passwordError && <Alert type="error">{passwordError}</Alert>}
            {passwordSuccess && <Alert type="success">{passwordSuccess}</Alert>}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 18,
              }}
            >
              <Field
                label="Current Password"
                name="currentPassword"
                type="password"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
                disabled={changingPassword}
              />
              <Field
                label="New Password"
                name="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={handlePasswordChange}
                disabled={changingPassword}
              />
              <Field
                label="Confirm Password"
                name="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange}
                disabled={changingPassword}
              />
            </div>

            <p style={{ margin: "10px 0 0", color: "var(--color-text-muted)", fontSize: 12 }}>
              Password must be at least 8 characters and include both letters and numbers.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                type="submit"
                disabled={changingPassword}
                style={{
                  ...primaryButtonStyle,
                  opacity: changingPassword ? 0.7 : 1,
                  cursor: changingPassword ? "not-allowed" : "pointer",
                }}
              >
                {changingPassword ? "Updating..." : "Change Password"}
              </button>
            </div>
          </form>

          <h2 style={{ color: "var(--color-text-primary)", marginBottom: 18 }}>
            Notification Preferences
          </h2>
          <p style={{ margin: "-10px 0 18px", color: "var(--color-text-muted)", fontSize: 13 }}>
            Notification toggles are not connected yet.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 16,
            }}
          >
            {[
              "Email Digest",
              "Real-time Alerts",
              "Security Logs",
              "Marketing Updates",
            ].map((item) => (
              <div
                key={item}
                style={{
                  background: "var(--color-navy-800)",
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: "var(--radius-lg)",
                  padding: 20,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, color: "var(--color-text-primary)", fontSize: 16 }}>
                    {item}
                  </h3>
                  <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)" }}>
                    Manage {item.toLowerCase()}
                  </p>
                </div>

                <div
                  title="Notification preferences are not available yet"
                  style={{
                    width: 48,
                    height: 26,
                    borderRadius: 20,
                    background: "var(--color-gold-100)",
                    position: "relative",
                    cursor: "not-allowed",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      right: 3,
                      top: 3,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "var(--color-text-primary)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function normalizeProfile(user) {
  return {
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    bio: user?.bio || "",
    avatar_url: user?.avatar_url || "",
  };
}

function Field({ label, name, value, onChange, type = "text", disabled = false }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={{
          width: "100%",
          background: "var(--color-navy-950)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 12,
          color: "var(--color-text-primary)",
          padding: "13px 14px",
          boxSizing: "border-box",
          outline: "none",
        }}
      />
    </div>
  );
}

function Alert({ children, type }) {
  const isError = type === "error";

  return (
    <div
      style={{
        background: isError ? "rgba(248,113,113,0.12)" : "rgba(103,232,180,0.12)",
        border: `1px solid ${isError ? "rgba(248,113,113,0.3)" : "rgba(103,232,180,0.3)"}`,
        borderRadius: 10,
        color: isError ? "var(--color-danger)" : "var(--color-success)",
        fontSize: 13,
        marginBottom: 18,
        padding: "11px 13px",
      }}
    >
      {children}
    </div>
  );
}

const panelStyle = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  padding: 28,
  marginBottom: 28,
};

const labelStyle = {
  display: "block",
  color: "var(--color-text-muted)",
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 8,
};

const secondaryButtonStyle = {
  padding: "11px 20px",
  borderRadius: 10,
  background: "transparent",
  border: "1px solid var(--color-border-soft)",
  color: "var(--color-text-primary)",
  cursor: "pointer",
};

const primaryButtonStyle = {
  padding: "11px 22px",
  borderRadius: 10,
  background: "var(--color-gold-500)",
  color: "var(--color-navy-950)",
  border: "none",
  fontWeight: 800,
};

export default Settings;
