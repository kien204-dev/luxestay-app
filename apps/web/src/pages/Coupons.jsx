import { useEffect, useState } from "react";
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  setCouponActive,
} from "../services/couponService";
import { useToast } from "../context/ToastContext";
import Icon from "../utils/icon";
import useIsMobile from "../utils/useIsMobile";
import ConfirmModal from "../components/ConfirmModal";

const PANEL_STYLE = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border-soft)",
  background: "var(--color-navy-900)",
  color: "var(--color-text-primary)",
  fontSize: 13,
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--color-text-muted)",
  marginBottom: 6,
  fontWeight: 700,
};

const EMPTY_FORM = {
  code: "",
  discount_type: "percent",
  discount_value: "",
  max_discount_amount: "",
  min_booking_amount: "",
  expires_at: "",
  usage_limit: "",
};

function formatMoney(value) {
  return (Number(value) || 0).toLocaleString("vi-VN") + " đ";
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("vi-VN");
}

function discountLabel(coupon) {
  return coupon.discount_type === "percent"
    ? `${Number(coupon.discount_value)}%`
    : formatMoney(coupon.discount_value);
}

// datetime-local <input> wants "YYYY-MM-DDTHH:mm" in local time, with no
// timezone suffix — build it from local getters, not toISOString(), for the
// same reason the calendar feature normalizes dates that way.
function toDateTimeLocalValue(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Coupons() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [toggleTarget, setToggleTarget] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const loadCoupons = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await listCoupons();
      setCoupons(data);
    } catch (err) {
      setError(err.response?.data?.message || "Không tải được danh sách mã giảm giá");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const openEditForm = (coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      max_discount_amount: coupon.max_discount_amount != null ? String(coupon.max_discount_amount) : "",
      min_booking_amount: coupon.min_booking_amount != null ? String(coupon.min_booking_amount) : "",
      expires_at: toDateTimeLocalValue(coupon.expires_at),
      usage_limit: coupon.usage_limit != null ? String(coupon.usage_limit) : "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setFormOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    const payload = {
      code: form.code,
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      max_discount_amount: form.max_discount_amount || undefined,
      min_booking_amount: form.min_booking_amount || undefined,
      expires_at: form.expires_at,
      usage_limit: form.usage_limit || undefined,
    };

    try {
      if (editingId) {
        await updateCoupon(editingId, payload);
        toast.success("Đã cập nhật mã giảm giá");
      } else {
        await createCoupon(payload);
        toast.success("Đã tạo mã giảm giá");
      }
      setFormOpen(false);
      await loadCoupons();
    } catch (err) {
      setFormError(err.response?.data?.message || "Lưu mã giảm giá thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const requestToggle = (coupon) => {
    if (coupon.is_active) {
      // Turning a coupon off can strand a customer mid-checkout, so confirm
      // first — turning it back on is harmless and doesn't need a prompt.
      setToggleTarget(coupon);
    } else {
      applyToggle(coupon, true);
    }
  };

  const applyToggle = async (coupon, nextActive) => {
    setTogglingId(coupon.id);
    try {
      await setCouponActive(coupon.id, nextActive);
      setCoupons((list) =>
        list.map((c) => (c.id === coupon.id ? { ...c, is_active: nextActive } : c))
      );
      toast.success(nextActive ? "Đã kích hoạt mã giảm giá" : "Đã tắt mã giảm giá");
      setToggleTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Thao tác thất bại, vui lòng thử lại");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <header
        style={{
          marginBottom: 28,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Mã giảm giá
          </h1>
          <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
            Tạo và quản lý mã giảm giá áp dụng khi khách đặt phòng.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          style={{
            background: "var(--color-gold-100)",
            color: "var(--color-gold-400)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "10px 16px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <Icon.Tag />
          Tạo mã mới
        </button>
      </header>

      <div style={{ ...PANEL_STYLE, overflow: "hidden" }}>
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--color-border-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: "var(--color-text-primary)" }}>Danh sách mã</h2>
        </div>

        {error && (
          <div style={{ padding: "16px 22px", color: "var(--color-danger)", fontSize: 14 }}>{error}</div>
        )}

        {loading ? (
          <div style={{ padding: 22 }} aria-busy="true" aria-label="Loading coupons">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0" }}>
                <div className="luxe-skeleton" style={{ height: 14, width: "14%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "14%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "14%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "18%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "14%" }} />
              </div>
            ))}
          </div>
        ) : coupons.length === 0 ? (
          <div style={{ padding: "56px 22px", textAlign: "center" }}>
            <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>Chưa có mã giảm giá nào.</p>
          </div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
            {coupons.map((c) => (
              <div
                key={c.id}
                style={{
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: "var(--radius-md)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{c.code}</span>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      color: c.is_active ? "var(--color-success)" : "var(--color-danger)",
                      background: c.is_active ? "rgba(103,232,180,0.12)" : "rgba(248,113,113,0.12)",
                    }}
                  >
                    {c.is_active ? "Đang bật" : "Đã tắt"}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  Giảm {discountLabel(c)} · Đã dùng {c.used_count}/{c.usage_limit ?? "∞"}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Hạn dùng: {formatDateTime(c.expires_at)}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={() => openEditForm(c)} style={{ ...mobileActionBtn, color: "var(--color-gold-400)" }}>
                    Sửa
                  </button>
                  <button
                    onClick={() => requestToggle(c)}
                    disabled={togglingId === c.id}
                    style={{
                      ...mobileActionBtn,
                      color: c.is_active ? "var(--color-danger)" : "var(--color-success)",
                    }}
                  >
                    {c.is_active ? "Tắt" : "Bật"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Mã", "Loại giảm", "Giá trị", "Đã dùng / Giới hạn", "Hạn dùng", "Trạng thái", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "14px 18px",
                        textAlign: "left",
                        color: "var(--color-text-muted)",
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid var(--color-border-soft)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td style={tdStyle}>
                      <strong>{c.code}</strong>
                    </td>
                    <td style={tdStyle}>{c.discount_type === "percent" ? "Phần trăm" : "Cố định"}</td>
                    <td style={tdStyle}>{discountLabel(c)}</td>
                    <td style={tdStyle}>
                      {c.used_count} / {c.usage_limit ?? "∞"}
                    </td>
                    <td style={tdStyle}>{formatDateTime(c.expires_at)}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          color: c.is_active ? "var(--color-success)" : "var(--color-danger)",
                          background: c.is_active ? "rgba(103,232,180,0.12)" : "rgba(248,113,113,0.12)",
                        }}
                      >
                        {c.is_active ? "Đang bật" : "Đã tắt"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => openEditForm(c)}
                          style={{
                            background: "var(--color-gold-100)",
                            color: "var(--color-gold-400)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 8,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => requestToggle(c)}
                          disabled={togglingId === c.id}
                          style={{
                            background: c.is_active ? "rgba(248,113,113,0.12)" : "rgba(103,232,180,0.12)",
                            color: c.is_active ? "var(--color-danger)" : "var(--color-success)",
                            border: `1px solid ${c.is_active ? "rgba(248,113,113,0.3)" : "rgba(103,232,180,0.3)"}`,
                            borderRadius: 8,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: togglingId === c.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {togglingId === c.id ? "..." : c.is_active ? "Tắt" : "Bật"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div
          onClick={closeForm}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 3500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            style={{
              ...PANEL_STYLE,
              width: "100%",
              maxWidth: 480,
              padding: 24,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 18px", fontSize: 18, color: "var(--color-text-primary)" }}>
              {editingId ? "Sửa mã giảm giá" : "Tạo mã giảm giá"}
            </h3>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Mã (chữ, số, - hoặc _)</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="VD: SUMMER2026"
                style={inputStyle}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Loại giảm</label>
                <select
                  value={form.discount_type}
                  onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                  style={inputStyle}
                >
                  <option value="percent">Phần trăm (%)</option>
                  <option value="fixed">Số tiền cố định (đ)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>
                  Giá trị {form.discount_type === "percent" ? "(%)" : "(đ)"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Giảm tối đa (đ, không bắt buộc)</label>
                <input
                  type="number"
                  min="0"
                  value={form.max_discount_amount}
                  onChange={(e) => setForm({ ...form, max_discount_amount: e.target.value })}
                  placeholder="Không giới hạn"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Đơn tối thiểu (đ, không bắt buộc)</label>
                <input
                  type="number"
                  min="0"
                  value={form.min_booking_amount}
                  onChange={(e) => setForm({ ...form, min_booking_amount: e.target.value })}
                  placeholder="Không yêu cầu"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Hạn dùng</label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Giới hạn lượt dùng (không bắt buộc)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.usage_limit}
                  onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
                  placeholder="Không giới hạn"
                  style={inputStyle}
                />
              </div>
            </div>

            {formError && (
              <div
                style={{
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.3)",
                  borderRadius: 8,
                  color: "var(--color-danger)",
                  fontSize: 12,
                  padding: "8px 10px",
                  marginBottom: 16,
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={closeForm}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--color-border-soft)",
                  background: "transparent",
                  color: "var(--color-text-secondary)",
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--color-gold-500)",
                  color: "var(--color-navy-950)",
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Tạo mã"}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={toggleTarget != null}
        title="Tắt mã giảm giá"
        message={`Bạn có chắc muốn tắt mã "${toggleTarget?.code}"? Khách đang định dùng mã này sẽ không áp dụng được nữa.`}
        confirmLabel="Tắt mã"
        tone="danger"
        loading={togglingId === toggleTarget?.id}
        onConfirm={() => applyToggle(toggleTarget, false)}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}

const tdStyle = {
  padding: "16px 18px",
  borderBottom: "1px solid var(--color-border-soft)",
  color: "var(--color-text-primary)",
  fontSize: 14,
};

const mobileActionBtn = {
  flex: 1,
  background: "transparent",
  border: "1px solid var(--color-border-soft)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
