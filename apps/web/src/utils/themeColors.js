// Chart libraries draw SVG with colour attributes, which cannot use CSS
// variables reliably. This reads the theme's colours as plain rgb() values,
// resolved through the browser (so color-mix() and var() chains work).

const NAMES = {
  accent: "--color-gold-500",
  accentSoft: "--color-gold-400",
  primary: "--brand-primary",
  text: "--color-text-secondary",
  muted: "--color-text-muted",
  grid: "--color-border-soft",
  surface: "--color-navy-800",
  border: "--color-border",
  success: "--color-success",
  warning: "--color-warning",
  danger: "--color-danger",
  info: "--color-info",
};

export function readThemeColors() {
  if (typeof document === "undefined") return {};
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const colors = {};
  for (const [key, variable] of Object.entries(NAMES)) {
    probe.style.color = `var(${variable})`;
    colors[key] = getComputedStyle(probe).color;
  }
  probe.remove();
  return colors;
}
