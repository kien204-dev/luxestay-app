import Icon from "../utils/icon";

export default function StarRating({
  value = 0,
  onChange,
  size = 16,
  color = "#C5A059",
  emptyColor = "#e2e8f0",
}) {
  const interactive = typeof onChange === "function";
  const rounded = Math.round(value);

  return (
    <div style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          role={interactive ? "button" : undefined}
          aria-label={interactive ? `${n} sao` : undefined}
          onClick={interactive ? () => onChange(n) : undefined}
          style={{
            color: n <= rounded ? color : emptyColor,
            width: size,
            height: size,
            display: "inline-flex",
            cursor: interactive ? "pointer" : "default",
          }}
        >
          <Icon.Star />
        </span>
      ))}
    </div>
  );
}
