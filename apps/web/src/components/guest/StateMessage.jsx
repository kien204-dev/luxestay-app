// A boxed message for when a list or page has nothing to show: "nothing
// here", "nothing matches" or "could not load" (`error`, announced as an
// alert). `children` are what the visitor can do next (buttons, links).
// `heading` is the title's level in the page's outline.
export default function StateMessage({ error = false, compact = false, heading: Heading = "h3", title, text, children, testId }) {
  return (
    <div
      className={`guest-message${error ? " guest-message--error" : ""}${compact ? " guest-message--compact" : ""}`}
      role={error ? "alert" : undefined}
      data-testid={testId}
    >
      <svg viewBox="0 0 96 96" aria-hidden="true">
        {error ? (
          <>
            <path d="M28 70h44a14 14 0 0 0 0-28 22 22 0 0 0-42-4 16 16 0 0 0-2 32z" />
            <path d="M48 46v14M48 66v1" />
          </>
        ) : (
          <>
            <path d="M20 84V44a28 28 0 0 1 56 0v40" />
            <path d="M12 84h72" />
            <path d="M30 84V48a18 18 0 0 1 36 0v36" />
            <circle cx="58" cy="64" r="1.6" />
          </>
        )}
      </svg>
      <Heading>{title}</Heading>
      {text && <p>{text}</p>}
      {children && <div className="guest-message-actions">{children}</div>}
    </div>
  );
}
