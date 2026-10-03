const SYMBOL = { success: "✓", error: "×", pending: "…" };

// A centred message with an icon and one action: payment results, 404, no
// access.
export default function StatusCard({ variant, title, children, action, testId }) {
  return (
    <div className="auth-wrap status-card" data-testid={testId}>
      <div className="auth-card">
        <span className={`status-icon status-icon--${variant}`} aria-hidden="true">{SYMBOL[variant]}</span>
        <h1 style={{ fontSize: 26 }}>{title}</h1>
        <p className="status-text">{children}</p>
        {action}
      </div>
    </div>
  );
}
