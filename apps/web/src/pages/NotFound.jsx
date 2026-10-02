import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Icon from "../utils/icon";

function NotFound() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const homePath = user?.role === "admin" ? "/admin" : "/";
  const homeLabel = user?.role === "admin" ? "Về Dashboard" : "Về trang chủ";

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-navy-950)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <span style={{ color: "var(--color-gold-400)", display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <Icon.CalendarOff />
        </span>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 72,
            fontWeight: 700,
            margin: "0 0 8px",
            color: "var(--color-gold-400)",
            lineHeight: 1,
          }}
        >
          404
        </h1>
        <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px", color: "var(--color-text-primary)" }}>
          Không tìm thấy trang bạn yêu cầu
        </p>
        <p style={{ color: "var(--color-text-muted)", margin: "0 0 28px", lineHeight: 1.6 }}>
          Đường dẫn này có thể đã bị đổi tên, xóa, hoặc chưa từng tồn tại.
        </p>
        <button
          onClick={() => navigate(homePath, { replace: true })}
          style={{
            background: "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
            color: "var(--color-navy-950)",
            border: "none",
            borderRadius: 10,
            padding: "12px 28px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {homeLabel}
        </button>
      </div>
    </div>
  );
}

export default NotFound;
