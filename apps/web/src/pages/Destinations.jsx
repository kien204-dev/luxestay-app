import { useState } from "react";
import { useToast } from "../context/ToastContext";
import {
  deleteDestinationImage,
  getAdminDestinations,
  updateDestinationCredit,
  uploadDestinationImage,
} from "../services/destinationService";
import { normalizeImageUrl, placeholderFor } from "../utils/imageUrl";
import { useAsyncData } from "../utils/useAsyncData";

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const PANEL = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  padding: 20,
};
const LABEL = { display: "block", fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 4 };
const INPUT = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--color-navy-950)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 14,
};
const BUTTON = {
  background: "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
  color: "var(--color-navy-950)",
  border: "none",
  borderRadius: 10,
  padding: "9px 16px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
};
const GHOST_BUTTON = {
  background: "transparent",
  color: "var(--color-gold-400)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: "8px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
};

const CREDIT_FIELDS = [
  { key: "place", label: "Địa danh trong ảnh", maxLength: 255 },
  { key: "author", label: "Tác giả", maxLength: 255 },
  { key: "license", label: "Giấy phép (vd. CC BY 4.0)", maxLength: 100 },
  { key: "licenseUrl", label: "Link giấy phép", maxLength: 500, type: "url" },
  { key: "title", label: "Tiêu đề gốc", maxLength: 255 },
  { key: "sourceUrl", label: "Link trang gốc của ảnh", maxLength: 500, type: "url" },
];

const creditForm = (destination) => Object.fromEntries(CREDIT_FIELDS.map(({ key }) => [key, destination[key] || ""]));

function DestinationRow({ destination, onChanged }) {
  const toast = useToast();
  const [form, setForm] = useState(() => creditForm(destination));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = `dest-${encodeURIComponent(destination.name)}`;

  const run = async (action, fallbackMessage) => {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      toast.success(result.message);
      onChanged();
    } catch (err) {
      setError(err.response?.data?.message || fallbackMessage);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setError("Ảnh phải là PNG, JPG hoặc WebP");
    if (file.size > MAX_IMAGE_SIZE) return setError("Ảnh không được lớn hơn 2 MB");
    run(() => uploadDestinationImage(destination.name, file), "Không tải được ảnh lên");
  };

  return (
    <section style={PANEL} aria-label={destination.name} data-testid="destination-row">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)", gap: 20 }} className="settings-grid">
        <div>
          <img
            src={normalizeImageUrl(destination.image, placeholderFor(destination.name, "place"))}
            alt={destination.name}
            style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 10, display: "block" }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <label style={{ ...BUTTON, opacity: busy ? 0.6 : 1 }}>
              {destination.image ? "Đổi ảnh" : "Tải ảnh lên"}
              <input
                type="file"
                accept={IMAGE_TYPES.join(",")}
                onChange={handleFile}
                disabled={busy}
                data-testid="destination-image-input"
                style={{ display: "none" }}
              />
            </label>
            {destination.image && (
              <button
                type="button"
                style={GHOST_BUTTON}
                disabled={busy}
                onClick={() => run(() => deleteDestinationImage(destination.name), "Không xóa được ảnh")}
              >
                Xóa ảnh
              </button>
            )}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => updateDestinationCredit(destination.name, form), "Không lưu được ghi công");
          }}
        >
          <h2 style={{ margin: 0, fontSize: 19, color: "var(--color-text-primary)" }}>{destination.name}</h2>
          <p style={{ margin: "2px 0 14px", fontSize: 13, color: "var(--color-text-muted)" }}>
            {destination.roomCount} phòng
            {destination.image ? "" : " · chưa có ảnh riêng: thẻ dùng ảnh phòng đầu tiên hoặc hình vẽ"}
          </p>

          {destination.image ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {CREDIT_FIELDS.map(({ key, label, ...input }) => (
                  <div key={key}>
                    <label htmlFor={`${id}-${key}`} style={LABEL}>{label}</label>
                    <input
                      id={`${id}-${key}`}
                      style={INPUT}
                      value={form[key]}
                      onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                      {...input}
                    />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "10px 0 12px", lineHeight: 1.5 }}>
                Ảnh của bạn: để trống phần giấy phép. Ảnh CC BY / CC BY-SA: ghi đủ tác giả và giấy phép, thẻ điểm đến
                và trang Ghi công ảnh sẽ hiển thị.
              </p>
              <button type="submit" style={{ ...GHOST_BUTTON, opacity: busy ? 0.6 : 1 }} disabled={busy}>
                Lưu ghi công
              </button>
            </>
          ) : null}

          {error && (
            <p role="alert" style={{ color: "var(--color-danger)", fontSize: 14, margin: "10px 0 0" }}>
              {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

// Admin page: the photo shown for each destination on the home page, and
// the credit its licence asks for.
export default function Destinations() {
  const { data, loading, error, reload } = useAsyncData("admin-destinations", getAdminDestinations);
  const destinations = Array.isArray(data) ? data : [];

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: 30, color: "var(--color-text-primary)" }}>
          Ảnh điểm đến
        </h1>
        <p style={{ color: "var(--color-text-muted)", margin: "8px 0 0", maxWidth: 680, lineHeight: 1.6 }}>
          Ảnh trên các thẻ "Điểm đến" ở trang chủ. Điểm đến lấy từ địa chỉ của phòng (phần sau dấu phẩy cuối). Đổi
          ảnh ở đây có hiệu lực ngay.
        </p>
      </header>

      {loading && !data ? (
        <div className="luxe-skeleton" style={{ height: 260, maxWidth: 980 }} />
      ) : error ? (
        <div style={{ ...PANEL, maxWidth: 980 }}>
          <p style={{ color: "var(--color-danger)", margin: "0 0 14px" }}>
            {error?.response?.data?.message || "Không tải được danh sách điểm đến"}
          </p>
          <button type="button" style={GHOST_BUTTON} onClick={reload}>Thử lại</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16, maxWidth: 980 }} data-testid="destinations-page">
          {destinations.map((destination) => (
            <DestinationRow
              key={`${destination.name}:${destination.image || ""}`}
              destination={destination}
              onChanged={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
