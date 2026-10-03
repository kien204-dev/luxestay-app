import { useTranslation } from "react-i18next";
import Icon from "../utils/icon";

// 1–5 stars, read-only or clickable (onChange). Colours follow the theme.
export default function StarRating({
  value = 0,
  onChange,
  size = 16,
  color = "var(--brand-accent)",
  emptyColor = "color-mix(in srgb, currentColor 22%, transparent)",
}) {
  const { t } = useTranslation("common");
  const interactive = typeof onChange === "function";
  const rounded = Math.round(value);

  return (
    <div style={{ display: "inline-flex", gap: 2 }} aria-label={interactive ? undefined : t("stars", { count: rounded })} role={interactive ? undefined : "img"}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          role={interactive ? "button" : undefined}
          aria-label={interactive ? t("stars", { count: n }) : undefined}
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
