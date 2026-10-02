// Full-page placeholder while a route's code or the session check is loading.
export default function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#fafafa",
        color: "#64748b",
        fontFamily: "var(--font-sans)",
        fontSize: 14,
      }}
    >
      …
    </div>
  );
}
