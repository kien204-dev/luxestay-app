import { useState } from "react";
import { useProperty } from "../context/PropertyContext";
import { useToast } from "../context/ToastContext";
import {
  deleteHeroImage,
  deleteLogo,
  getAdminSettings,
  updateSettings,
  uploadHeroImage,
  uploadLogo,
} from "../services/settingsService";
import { normalizeImageUrl } from "../utils/imageUrl";
import { useAsyncData } from "../utils/useAsyncData";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const PANEL = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  padding: 24,
};
const LABEL = { display: "block", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6 };
const INPUT = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--color-navy-950)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
};
const HINT = { fontSize: 12, color: "var(--color-text-muted)", margin: "6px 0 0" };
const BUTTON = {
  background: "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
  color: "var(--color-navy-950)",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontWeight: 700,
  cursor: "pointer",
};
const GHOST_BUTTON = {
  background: "transparent",
  color: "var(--color-gold-400)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: "9px 16px",
  fontWeight: 700,
  cursor: "pointer",
};

const FIELDS = [
  { key: "name", label: "Tên cơ sở lưu trú", type: "text", maxLength: 100 },
  { key: "phone", label: "Số điện thoại", type: "tel", maxLength: 30 },
  { key: "email", label: "Email liên hệ", type: "email", maxLength: 255 },
  { key: "address", label: "Địa chỉ", type: "text", maxLength: 255 },
  { key: "checkInTime", label: "Giờ nhận phòng", type: "time" },
  { key: "checkOutTime", label: "Giờ trả phòng", type: "time" },
  { key: "freeCancellationDays", label: "Số ngày hủy miễn phí trước ngày nhận phòng", type: "number", min: 0, max: 365 },
];

// A stored value of null means "not set here": the field is shown empty and
// the value that applies instead is given as a hint.
function toForm(stored) {
  return Object.fromEntries(FIELDS.map(({ key }) => [key, stored?.[key] ?? ""]));
}

// Admin page for the property's identity and house rules. What is saved here
// is used by the guest site, emails and PDF confirmations straight away.
function SettingsForm({ settings, onSaved }) {
  const toast = useToast();
  const property = useProperty();
  const [form, setForm] = useState(() => toForm(settings.stored));
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [error, setError] = useState("");

  const storedLogo = settings.stored.logoUrl;
  const storedHero = settings.stored.heroImageUrl;

  // Everything that shows the property (header, tab title, footer) reads the
  // public settings; refresh them so this very page updates too.
  const afterChange = (saved, message) => {
    onSaved(saved);
    property.reload();
    toast.success(message);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const saved = await updateSettings({
        ...form,
        freeCancellationDays: form.freeCancellationDays === "" ? null : Number(form.freeCancellationDays),
      });
      setForm(toForm(saved.stored));
      afterChange(saved, saved.message);
    } catch (err) {
      setError(err.response?.data?.message || "Không lưu được cấu hình");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!LOGO_TYPES.includes(file.type)) {
      setError("Logo phải là ảnh PNG, JPG hoặc WebP");
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError("Logo không được lớn hơn 2 MB");
      return;
    }

    setLogoBusy(true);
    setError("");
    try {
      const saved = await uploadLogo(file);
      afterChange(saved, saved.message);
    } catch (err) {
      setError(err.response?.data?.message || "Không tải được logo lên");
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoRemove = async () => {
    setLogoBusy(true);
    setError("");
    try {
      const saved = await deleteLogo();
      afterChange(saved, saved.message);
    } catch (err) {
      setError(err.response?.data?.message || "Không xóa được logo");
    } finally {
      setLogoBusy(false);
    }
  };

  const handleHeroChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!LOGO_TYPES.includes(file.type)) {
      setError("Ảnh nền phải là ảnh PNG, JPG hoặc WebP");
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError("Ảnh nền không được lớn hơn 2 MB (nên dùng ảnh ngang khoảng 1600–2000 px)");
      return;
    }

    setHeroBusy(true);
    setError("");
    try {
      const saved = await uploadHeroImage(file);
      afterChange(saved, saved.message);
    } catch (err) {
      setError(err.response?.data?.message || "Không tải được ảnh nền lên");
    } finally {
      setHeroBusy(false);
    }
  };

  const handleHeroRemove = async () => {
    setHeroBusy(true);
    setError("");
    try {
      const saved = await deleteHeroImage();
      afterChange(saved, saved.message);
    } catch (err) {
      setError(err.response?.data?.message || "Không xóa được ảnh nền");
    } finally {
      setHeroBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 24, maxWidth: 820 }}>
      {error && (
        <div role="alert" style={{ ...PANEL, padding: "12px 16px", color: "var(--color-danger)", fontSize: 14 }}>
          {error}
        </div>
      )}

      <section style={PANEL} aria-label="Logo">
        <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "var(--color-text-primary)" }}>Logo</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 16,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              fontFamily: "var(--font-serif)",
              fontSize: 40,
              fontWeight: 700,
              color: "#002366",
            }}
          >
            {storedLogo ? (
              <img
                src={normalizeImageUrl(storedLogo, "")}
                alt="Logo hiện tại"
                data-testid="logo-preview"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              property.initial
            )}
          </div>

          <div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ ...BUTTON, opacity: logoBusy ? 0.6 : 1 }}>
                {logoBusy ? "Đang xử lý..." : storedLogo ? "Đổi logo" : "Tải logo lên"}
                <input
                  type="file"
                  accept={LOGO_TYPES.join(",")}
                  onChange={handleLogoChange}
                  disabled={logoBusy}
                  data-testid="logo-input"
                  style={{ display: "none" }}
                />
              </label>
              {storedLogo && (
                <button type="button" style={GHOST_BUTTON} onClick={handleLogoRemove} disabled={logoBusy}>
                  Xóa logo
                </button>
              )}
            </div>
            <p style={HINT}>
              PNG, JPG hoặc WebP, tối đa 2 MB. Không có logo thì trang hiện chữ cái đầu của tên. Phiếu PDF chỉ
              in được logo PNG hoặc JPG.
            </p>
          </div>
        </div>
      </section>

      <section style={PANEL} aria-label="Ảnh nền trang chủ">
        <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "var(--color-text-primary)" }}>Ảnh nền trang chủ</h2>
        <div
          style={{
            aspectRatio: "16 / 6",
            borderRadius: 12,
            overflow: "hidden",
            background: "linear-gradient(135deg, #002366, #001640)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.75)",
            fontSize: 14,
          }}
        >
          {storedHero ? (
            <img
              src={normalizeImageUrl(storedHero, "")}
              alt="Ảnh nền hiện tại"
              data-testid="hero-preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            "Chưa có ảnh: trang chủ dùng nền màu"
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <label style={{ ...BUTTON, opacity: heroBusy ? 0.6 : 1 }}>
            {heroBusy ? "Đang xử lý..." : storedHero ? "Đổi ảnh nền" : "Tải ảnh nền lên"}
            <input
              type="file"
              accept={LOGO_TYPES.join(",")}
              onChange={handleHeroChange}
              disabled={heroBusy}
              data-testid="hero-input"
              style={{ display: "none" }}
            />
          </label>
          {storedHero && (
            <button type="button" style={GHOST_BUTTON} onClick={handleHeroRemove} disabled={heroBusy}>
              Xóa ảnh nền
            </button>
          )}
        </div>
        <p style={HINT}>
          Ảnh ngang, PNG, JPG hoặc WebP, tối đa 2 MB. Trang chủ phủ một lớp tối lên ảnh để chữ trắng và ô tìm kiếm
          luôn dễ đọc. Chỉ dùng ảnh bạn có quyền sử dụng.
        </p>
      </section>

      <form onSubmit={handleSubmit} style={PANEL} aria-label="Thông tin cơ sở lưu trú">
        <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "var(--color-text-primary)" }}>
          Thông tin và quy định
        </h2>
        <p style={{ ...HINT, margin: "0 0 18px" }}>
          Để trống một ô để dùng giá trị mặc định ghi bên dưới ô đó.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
          {FIELDS.map(({ key, label, ...input }) => (
            <div key={key} style={key === "address" || key === "name" ? { gridColumn: "1 / -1" } : undefined}>
              <label htmlFor={`property-${key}`} style={LABEL}>{label}</label>
              <input
                id={`property-${key}`}
                name={key}
                style={INPUT}
                value={form[key]}
                onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                {...input}
              />
              <p style={HINT}>
                Mặc định: {settings.fallback[key] === "" ? "(không có)" : String(settings.fallback[key])}
              </p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 22 }}>
          <button type="submit" style={{ ...BUTTON, opacity: saving ? 0.6 : 1 }} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu cấu hình"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PropertySettings() {
  const { data, loading, error, reload, setData } = useAsyncData("admin-settings", getAdminSettings);

  return (
    <div>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: 30, color: "var(--color-text-primary)" }}>
          Cơ sở lưu trú
        </h1>
        <p style={{ color: "var(--color-text-muted)", margin: "8px 0 0", maxWidth: 640, lineHeight: 1.6 }}>
          Tên, logo, thông tin liên hệ và quy định. Thay đổi có hiệu lực ngay trên trang khách, email và phiếu
          xác nhận, không cần cài đặt lại.
        </p>
      </header>

      {data ? (
        <SettingsForm settings={data} onSaved={setData} />
      ) : loading ? (
        <div className="luxe-skeleton" style={{ height: 320, maxWidth: 820 }} />
      ) : (
        <div style={{ ...PANEL, maxWidth: 820 }}>
          <p style={{ color: "var(--color-danger)", margin: "0 0 14px" }}>
            {error?.response?.data?.message || "Không tải được cấu hình"}
          </p>
          <button type="button" style={GHOST_BUTTON} onClick={reload}>Thử lại</button>
        </div>
      )}
    </div>
  );
}
