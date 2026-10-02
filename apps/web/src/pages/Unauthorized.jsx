import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Icon from "../utils/icon";

function Unauthorized() {
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
        <span
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "rgba(248,113,113,0.12)",
            color: "var(--color-danger)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <Icon.Lock />
        </span>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 28,
            fontWeight: 700,
            margin: "0 0 8px",
            color: "var(--color-text-primary)",
          }}
        >
          Không có quyền truy cập
        </h1>
        <p style={{ color: "var(--color-text-muted)", margin: "0 0 28px", lineHeight: 1.6 }}>
          Tài khoản của bạn không có quyền xem trang này. Nếu bạn cho rằng đây là
          nhầm lẫn, hãy liên hệ quản trị viên.
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

export default Unauthorized;
