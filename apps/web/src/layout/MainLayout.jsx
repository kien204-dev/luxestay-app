import { useEffect, useState } from "react";
import Sidebar from "../layout/components/Sidebar";
import { useAuth } from "../context/AuthContext";

function MainLayout({ children }) {
  const { user } = useAuth();
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const handleResize = () => setCompact(window.innerWidth < 900);
    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: compact ? "column" : "row",
        minHeight: "100vh",
        width: "100%",
        background: "var(--color-navy-950)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <Sidebar compact={compact} />

      <main
        style={{
          marginLeft: compact ? 0 : 240,
          width: compact ? "100%" : "calc(100% - 240px)",
          minHeight: "100vh",
          background: "var(--color-navy-950)",
          overflowX: "hidden",
        }}
      >
        <div
          style={{
            minHeight: 70,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: compact ? "0 18px" : "0 36px",
            borderBottom: "1px solid var(--color-border-soft)",
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-serif)",
              fontSize: compact ? 18 : 22,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Xin chào, {user?.name}
          </h2>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-gold-400)",
              background: "var(--color-gold-100)",
              border: "1px solid var(--color-border)",
              borderRadius: 20,
              padding: "5px 12px",
            }}
          >
            {user?.role}
          </span>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 1280,
            margin: "0 auto",
            padding: compact ? "22px 16px" : "32px 36px",
            boxSizing: "border-box",
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

export default MainLayout;
