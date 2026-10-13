import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { axisMoney, dayMonth, formatNumber, longDay, percent, rangeText, shortWeekday } from "../../../utils/adminFormat";
import { formatMoney } from "../../../utils/format";

// The dashboard's two charts, drawn as plain SVG from the API's day-by-day
// series. A long window is shown by week (up to 92 days) or by month, so the
// bars and points stay readable.

const W = 720;
const H = 240;
const PAD = 16;

const daysIn = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;

export function bucketize(series, sellable) {
  const n = series.length;
  if (n <= 31) return { kind: "day", buckets: series.map((d) => ({ ...d, from: d.date, to: d.date, prevFrom: d.prevDate, nights: 1 })) };
  const kind = n <= 92 ? "week" : "month";
  const groups = [];
  series.forEach((d, i) => {
    const key = kind === "week" ? Math.floor(i / 7) : d.date.slice(0, 7);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      group = { key, from: d.date, to: d.date, prevFrom: d.prevDate, revenue: 0, prevRevenue: 0, bookings: 0, nightsSold: 0 };
      groups.push(group);
    }
    group.to = d.date;
    group.revenue += d.revenue;
    group.prevRevenue += d.prevRevenue;
    group.bookings += d.bookings;
    group.nightsSold += d.nightsSold;
  });
  groups.forEach((g) => {
    g.nights = daysIn(g.from, g.to);
    g.occupancy = sellable ? g.nightsSold / (sellable * g.nights) : null;
  });
  return { kind, buckets: groups };
}

function niceMax(value) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * power >= value);
  return step * power;
}

const xAt = (i, n) => (n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
const pct = (value, total) => `${(value / total) * 100}%`;

function useLabels(kind, n, today) {
  const { t, i18n } = useTranslation("dashboard");
  const lang = i18n.language;
  const every = kind === "day" ? Math.ceil(n / 8) : Math.ceil(n / 10);
  return {
    axis: (bucket, i) => {
      // Every few points, and the last one (without crowding the one before).
      if (i !== n - 1 && (i % every !== 0 || n - 1 - i < every / 2)) return "";
      if (kind === "day" && bucket.from === today) return t("overview.chart.today");
      if (kind === "month") return new Date(`${bucket.from}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-US" : "vi-VN", { timeZone: "UTC", month: "short" });
      if (kind === "day" && n <= 7) return `${shortWeekday(bucket.from)} ${bucket.from.slice(8, 10)}`;
      return dayMonth(bucket.from, lang);
    },
    long: (bucket) => (kind === "day" ? longDay(bucket.from, lang) : rangeText(bucket.from, bucket.to, lang)),
  };
}

// Keyboard: the plot takes focus; ←/→ move between points.
function useActive(n) {
  const [active, setActive] = useState(null);
  const onKeyDown = (event) => {
    if (event.key === "ArrowRight") setActive((i) => (i === null ? 0 : Math.min(n - 1, i + 1)));
    else if (event.key === "ArrowLeft") setActive((i) => (i === null ? n - 1 : Math.max(0, i - 1)));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };
  return { active, setActive, onKeyDown };
}

export function RevenueChart({ overview }) {
  const { t, i18n } = useTranslation("dashboard");
  const lang = i18n.language;
  const id = useId();
  const { kind, buckets } = bucketize(overview.series, overview.rooms.sellable);
  const n = buckets.length;
  const labels = useLabels(kind, n, overview.today);
  const { active, setActive, onKeyDown } = useActive(n);

  const top = niceMax(Math.max(...buckets.map((b) => Math.max(b.revenue, b.prevRevenue)), 0));
  const y = (v) => H - (v / top) * (H - PAD);
  const points = buckets.map((b, i) => [xAt(i, n), y(b.revenue)]);
  const prev = buckets.map((b, i) => [xAt(i, n), y(b.prevRevenue)]);
  const line = (pts) => pts.map(([x, yy], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${yy.toFixed(1)}`).join("");
  const area = `${line(points)}L${points.at(-1)[0].toFixed(1)} ${H}L${points[0][0].toFixed(1)} ${H}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const peak = buckets.reduce((best, b, i) => (b.revenue > buckets[best].revenue ? i : best), 0);
  const hasPeak = buckets[peak].revenue > 0;
  const shown = active ?? null;
  const unit = t(`overview.chart.per.${kind}`);

  return (
    <section className="ax-card ax-ch" aria-labelledby={`${id}-t`} data-testid="revenue-chart">
      <div className="ax-ch__h">
        <div>
          <h2 id={`${id}-t`}>{t("overview.chart.revenue", { per: unit })}</h2>
          <p>
            {rangeText(overview.from, overview.to, lang)}
            {hasPeak && ` · ${t("overview.chart.peak", { when: labels.long(buckets[peak]), amount: axisMoney(buckets[peak].revenue, lang) })}`}
          </p>
        </div>
        <div className="ax-legend">
          <span><i />{t("overview.chart.thisPeriod")}</span>
          <span><i className="is-prev" />{t("overview.chart.prevPeriod", { range: rangeText(overview.previous.from, overview.previous.to, lang) })}</span>
        </div>
      </div>

      <div className="ax-plotwrap">
        <div
          className="ax-plotarea"
          tabIndex={0}
          role="group"
          aria-label={t("overview.chart.revenueLabel", { range: rangeText(overview.from, overview.to, lang) })}
          aria-describedby={`${id}-table`}
          onKeyDown={onKeyDown}
          onMouseLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
        >
          <div className="ax-plotbox">
            <div className="ax-axisy" aria-hidden="true">
              {ticks.map((v) => (
                <span key={v} style={{ top: pct(y(v), H) }}>{axisMoney(v, lang)}</span>
              ))}
            </div>
            <svg className="ax-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              {ticks.map((v) => (
                <line key={v} className={v === 0 ? "base" : "grid"} x1="0" x2={W} y1={y(v)} y2={y(v)} />
              ))}
              <path className="area" d={area} />
              <path className="ln-prev" d={line(prev)} />
              <path className="ln" d={line(points)} />
              {shown !== null && <line className="cross" x1={points[shown][0]} x2={points[shown][0]} y1={PAD} y2={H} />}
              {buckets.map((b, i) => (
                <rect key={b.from} className="hit" x={xAt(i, n) - W / n / 2} y="0" width={W / n} height={H} onMouseEnter={() => setActive(i)} />
              ))}
            </svg>
            {hasPeak && <span className="ax-dot" style={{ left: pct(points[peak][0], W), top: pct(points[peak][1], H) }} />}
            {shown !== null && shown !== peak && <span className="ax-dot" style={{ left: pct(points[shown][0], W), top: pct(points[shown][1], H) }} />}
            {shown !== null && (
              <div className="ax-tip" role="status" style={{ left: `clamp(90px, ${pct(points[shown][0], W)}, calc(100% - 90px))`, top: 0 }}>
                <b>{labels.long(buckets[shown])}</b>
                <i />
                {formatMoney(buckets[shown].revenue, lang)} · {t("overview.chart.bookings", { count: buckets[shown].bookings })}
                <br />
                <span>
                  {t("overview.chart.prevShort")}: {formatMoney(buckets[shown].prevRevenue, lang)}
                </span>
              </div>
            )}
          </div>
          <div className="ax-axisx" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }} aria-hidden="true">
            {buckets.map((b, i) => (
              <span key={b.from}>{labels.axis(b, i)}</span>
            ))}
          </div>
        </div>
      </div>

      <table className="sr-only" id={`${id}-table`}>
        <caption>{t("overview.chart.revenue", { per: unit })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("overview.chart.when")}</th>
            <th scope="col">{t("overview.chart.thisPeriod")}</th>
            <th scope="col">{t("overview.chart.prevShort")}</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.from}>
              <th scope="row">{labels.long(b)}</th>
              <td>{formatMoney(b.revenue, lang)}</td>
              <td>{formatMoney(b.prevRevenue, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function OccupancyChart({ overview }) {
  const { t, i18n } = useTranslation("dashboard");
  const lang = i18n.language;
  const id = useId();
  const sellable = overview.rooms.sellable;
  const { kind, buckets } = bucketize(overview.series, sellable);
  const n = buckets.length;
  const labels = useLabels(kind, n, overview.today);
  const { active, setActive, onKeyDown } = useActive(n);
  const occupancy = overview.current.occupancy;

  const slot = W / n;
  const barW = Math.max(2, Math.min(36, slot * 0.6));
  const y = (v) => H - Math.min(1, v || 0) * (H - PAD);
  const peak = buckets.reduce((best, b, i) => ((b.occupancy || 0) > (buckets[best].occupancy || 0) ? i : best), 0);
  const bar = (b, i) => {
    const x = i * slot + (slot - barW) / 2;
    const top = y(b.occupancy);
    const r = Math.min(4, barW / 2, H - top);
    if (H - top < 0.5) return "";
    return `M${x} ${H}V${top + r}a${r} ${r} 0 0 1 ${r}-${r}h${barW - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${H}Z`;
  };
  const shown = active;
  const labelled = new Set([peak, n - 1]);

  return (
    <section className="ax-card ax-ch" aria-labelledby={`${id}-t`} data-testid="occupancy-chart">
      <div className="ax-ch__h">
        <div>
          <h2 id={`${id}-t`}>{t("overview.chart.occupancy")}</h2>
          <p>{t(`overview.chart.occupancySub.${kind}`)}</p>
        </div>
        <div className="ax-ch__big">{occupancy === null ? "—" : `${percent(occupancy, lang, 0)}%`}</div>
      </div>

      {!sellable ? (
        <p className="ax-muted">{t("overview.chart.noRooms")}</p>
      ) : (
        <div
          className="ax-plotarea ax-plotarea--bars"
          tabIndex={0}
          role="group"
          aria-label={t("overview.chart.occupancyLabel", { range: rangeText(overview.from, overview.to, lang) })}
          aria-describedby={`${id}-table`}
          onKeyDown={onKeyDown}
          onMouseLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
        >
          <div className="ax-plotbox">
            <svg className="ax-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <line className="grid" x1="0" x2={W} y1={PAD} y2={PAD} />
              <line className="grid" x1="0" x2={W} y1={(H + PAD) / 2} y2={(H + PAD) / 2} />
              <line className="base" x1="0" x2={W} y1={H} y2={H} />
              {buckets.map((b, i) => (
                <path key={b.from} className={`bar${i === peak && b.occupancy ? " is-hi" : ""}`} d={bar(b, i)} />
              ))}
              {buckets.map((b, i) => (
                <rect key={`h${b.from}`} className="hit" x={i * slot} y="0" width={slot} height={H} onMouseEnter={() => setActive(i)} />
              ))}
            </svg>
            <span className="ax-axisy-r" aria-hidden="true">100%</span>
            {n <= 31 &&
              buckets.map((b, i) =>
                labelled.has(i) && b.occupancy ? (
                  <span key={`l${b.from}`} className="ax-barlbl" style={{ left: pct(i * slot + slot / 2, W), top: pct(y(b.occupancy), H) }} aria-hidden="true">
                    {percent(b.occupancy, lang, 0)}%
                  </span>
                ) : null
              )}
            {shown !== null && (
              <div className="ax-tip" role="status" style={{ left: `clamp(90px, ${pct(shown * slot + slot / 2, W)}, calc(100% - 90px))`, top: 0 }}>
                <b>{labels.long(buckets[shown])}</b>
                {percent(buckets[shown].occupancy, lang, 0)}% · {t("overview.chart.nights", { sold: formatNumber(buckets[shown].nightsSold, lang), total: formatNumber(sellable * buckets[shown].nights, lang) })}
              </div>
            )}
          </div>
          <div className="ax-axisx" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }} aria-hidden="true">
            {buckets.map((b, i) => (
              <span key={b.from}>{labels.axis(b, i)}</span>
            ))}
          </div>
        </div>
      )}

      <div className="ax-legend">
        <span><i className="is-bar" style={{ background: "var(--accent)" }} />{t(`overview.chart.perBar.${kind}`)}</span>
        <span><i className="is-bar" style={{ background: "var(--brass)" }} />{t("overview.chart.highest")}</span>
      </div>

      <table className="sr-only" id={`${id}-table`}>
        <caption>{t("overview.chart.occupancy")}</caption>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.from}>
              <th scope="row">{labels.long(b)}</th>
              <td>{b.occupancy === null ? "—" : `${percent(b.occupancy, lang, 0)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
