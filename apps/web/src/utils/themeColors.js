// Chart libraries, the favicon and the placeholder drawings are SVG with
// colour attributes, which cannot use CSS variables reliably. This reads the
// theme's colours as plain rgb() values, resolved through the browser (so
// color-mix() and var() chains work).

const NAMES = {
  accent: "--accent",
  onAccent: "--on-accent",
  brassInverse: "--brass-inverse",
  text: "--ink-muted",
  muted: "--ink-subtle",
  grid: "--line",
  surface: "--surface",
  border: "--line-strong",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  info: "--info",
};

// `theme` is the token set to read ("light" or "dark"). Charts pass the
// theme on screen; the favicon and placeholders are drawn from the light set
// so they do not change when the visitor switches theme.
export function readThemeColors(theme = "light") {
  if (typeof document === "undefined") return {};
  const probe = document.createElement("span");
  probe.className = `theme-${theme}`;
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
