import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import BookingBadge from "../../../components/admin/BookingBadge";
import OrderCard from "../../../components/admin/OrderCard";
import { Alert, Crumbs, Delta, EmptyState, Skel } from "../../../components/admin/ax";
import { initials } from "../../../layout/admin/AccountMenu";
import { useDismiss } from "../../../layout/admin/useDismiss";
import { useProperty } from "../../../context/PropertyContext";
import { useToast } from "../../../context/ToastContext";
import { exportDashboardReport, getDashboardOverview } from "../../../services/dashboardService";
import { getBookings } from "../../../services/bookingService";
import { apiErrorText } from "../../../utils/apiError";
import { bookingCode } from "../../../utils/bookingCode";
import { localDateString } from "../../../utils/date";
import { formatMoney } from "../../../utils/format";
import { change, compactMoney, formatNumber, percent, rangeText, stayText, timeAgo } from "../../../utils/adminFormat";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";
import { PHONE_QUERY, useMedia } from "../../../utils/useMedia";
import { OccupancyChart, RevenueChart } from "./charts";
import RangePicker from "./RangePicker";

// The window in the address: ?days=30, or ?from=…&to=… (custom). Nothing
// means the last 7 days.
function readWindow(params) {
  const from = params.get("from");
  const to = params.get("to");
  if (from && to) return { key: "custom", query: { from, to } };
  if (params.get("days") === "30") return { key: "30", query: { days: 30 } };
  return { key: "7", query: { days: 7 } };
}

function Kpi({ label, icon, value, unit, none, delta, note, testId }) {
  return (
    <div className="ax-card ax-kpi" data-testid={testId}>
      <div className="ax-kpi__k">
        {label}
        <AxIcon name={icon} />
      </div>
      <div className={`ax-kpi__v${none ? " is-none" : ""}`}>
        {none ? "—" : value}
        {!none && unit && <small>{unit}</small>}
      </div>
      <div className="ax-kpi__d">
        {delta}
        <span className="ax-kpi__note">{note}</span>
      </div>
    </div>
  );
}

function Kpis({ overview }) {
  const { t, i18n } = useTranslation("dashboard");
  const lang = i18n.language;
  const { current: now, before, days } = overview;
  const pctText = (value) => `${formatNumber(Math.abs(value) * 100, lang, 1)}%`;
  const deltaPct = (cur, prev) => {
    const value = change(cur, prev);
    return value === null ? null : <Delta value={value} text={pctText(value)} />;
  };
  const occupancyPoints = now.occupancy !== null && before.occupancy !== null && before.nightsSold > 0 ? (now.occupancy - before.occupancy) * 100 : null;
  const revenue = compactMoney(now.revenue, lang);
  const adr = now.adr === null ? null : compactMoney(now.adr, lang);

  return (
    <div className="ax-kpis">
      <Kpi
        testId="kpi-revenue"
        label={t("overview.kpi.revenue")}
        icon="cash"
        value={revenue.value}
        unit={revenue.unit}
        delta={deltaPct(now.revenue, before.revenue)}
        note={before.revenue ? t("overview.kpi.vsBefore", { count: days }) : t("overview.kpi.noBefore")}
      />
      <Kpi
        testId="kpi-occupancy"
        label={t("overview.kpi.occupancy")}
        icon="bed"
        none={now.occupancy === null}
        value={percent(now.occupancy, lang, 1)}
        unit="%"
        delta={occupancyPoints === null ? null : <Delta value={occupancyPoints} text={t("overview.kpi.points", { value: formatNumber(Math.abs(occupancyPoints), lang, 1) })} />}
        note={t("overview.kpi.roomNights", { sold: formatNumber(now.nightsSold, lang), total: formatNumber(now.nightsAvailable, lang) })}
      />
      <Kpi
        testId="kpi-bookings"
        label={t("overview.kpi.bookings")}
        icon="receipt"
        value={formatNumber(now.bookings, lang)}
        delta={deltaPct(now.bookings, before.bookings)}
        note={t("overview.kpi.cancelled", { count: now.cancelled })}
      />
      <Kpi
        testId="kpi-adr"
        label={t("overview.kpi.adr")}
        icon="moon"
        none={adr === null}
        value={adr?.value}
        unit={adr?.unit}
        delta={deltaPct(now.adr, before.adr)}
        note={t("overview.kpi.adrNote")}
      />
    </div>
  );
}

function TodayStrip({ overview }) {
  const { t } = useTranslation("dashboard");
  const at = overview.todayAt;
  return (
    <div className="ax-card ax-today" aria-label={t("overview.today.label")} role="group" data-testid="today-strip">
      <div>
        <AxIcon name="checkIn" />
        <div><b>{at.checkIns}</b><span>{t("overview.today.checkIns")}</span></div>
      </div>
      <div>
        <AxIcon name="checkOut" />
        <div><b>{at.checkOuts}</b><span>{t("overview.today.checkOuts")}</span></div>
      </div>
      <Link to="/admin/orders?tab=in_house">
        <AxIcon name="bed" />
        <div><b>{at.occupiedRooms} / {overview.rooms.sellable}</b><span>{t("overview.today.occupied")}</span></div>
      </Link>
      <Link to="/admin/orders?tab=pending" className={at.pendingPayment ? "is-warn" : ""}>
        <AxIcon name="clock" />
        <div>
          <b>{at.pendingPayment}</b>
          <span>
            {t("overview.today.pending")}
            {at.refundPending > 0 && ` · ${t("overview.today.refunds", { count: at.refundPending })}`}
          </span>
        </div>
      </Link>
    </div>
  );
}

function RecentTable({ rows, today }) {
  const { t, i18n } = useTranslation("dashboard");
  const lang = i18n.language;
  const [now] = useState(() => Date.now());
  return (
    <section className="ax-tablewrap ax-hidephone" aria-labelledby="recent-t" data-testid="recent-bookings">
      <div className="ax-tablebar">
        <h2 id="recent-t">{t("overview.recent.title")}</h2>
        <span style={{ flex: 1 }} />
        <Link className="g-btn g-btn--link ax-linkbtn" to="/admin/orders">{t("overview.recent.all")}</Link>
      </div>
      {rows.length === 0 ? (
        <p className="ax-dd__empty">{t("overview.recent.empty")}</p>
      ) : (
        <table className="ax-table">
          <thead>
            <tr>
              <th scope="col">{t("overview.recent.guest")}</th>
              <th scope="col">{t("overview.recent.room")}</th>
              <th scope="col">{t("overview.recent.stay")}</th>
              <th scope="col" className="is-num">{t("overview.recent.total")}</th>
              <th scope="col">{t("overview.recent.status")}</th>
              <th scope="col">{t("overview.recent.created")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="ax-person">
                    <span className="ax-avatar" aria-hidden="true">{initials(row.guest_name)}</span>
                    <div>
                      <Link className="ax-rowlink" to={`/admin/orders?booking=${row.id}`}><b>{row.guest_name}</b></Link>
                      <div className="ax-code">{bookingCode(row.id)}</div>
                    </div>
                  </div>
                </td>
                <td>{row.room_name}</td>
                <td>{stayText(row.check_in, row.check_out, lang)}</td>
                <td className="is-num">{formatMoney(row.total_price, lang)}</td>
                <td><BookingBadge booking={row} today={today} /></td>
                <td className="ax-muted">{timeAgo(row.created_at, now, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// Phone: the bookings that wait on the admin (payment, refund).
function NeedsAction({ today }) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const { data } = useAsyncData("dashboard:needs-action", async () => {
    const [pending, refunds] = await Promise.all([
      getBookings({ status: "pending", page: 1, limit: 3 }),
      getBookings({ payment_status: "refund_pending", page: 1, limit: 3 }),
    ]);
    return [...refunds.data.data, ...pending.data.data];
  });
  if (!data) return null;
  return (
    <section className="ax-onlyphone" aria-labelledby="needs-t">
      <div className="ax-msec">
        <h2 id="needs-t">{t("overview.needs.title")}</h2>
        <Link className="g-btn g-btn--link ax-linkbtn" to="/admin/orders">{t("overview.needs.all")}</Link>
      </div>
      {data.length === 0 ? (
        <p className="ax-muted">{t("overview.needs.none")}</p>
      ) : (
        <div className="ax-ocards">
          {data.map((booking) => (
            <OrderCard key={booking.id} booking={booking} today={today} onOpen={(b) => navigate(`/admin/orders?booking=${b.id}`)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ExportMenu({ overview }) {
  const { t } = useTranslation("dashboard");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const box = useRef(null);
  const button = useRef(null);
  useDismiss(box, open, () => setOpen(false), button);

  const run = async (format) => {
    setOpen(false);
    setBusy(format);
    try {
      await exportDashboardReport({ from: overview.from, to: overview.to }, format);
      toast.success(t("overview.export.done"));
    } catch (err) {
      toast.error(apiErrorText(err, "dashboard:errors.exportFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ax-dd-anchor" ref={box}>
      <button ref={button} type="button" className="g-btn g-btn--outline g-btn--small" aria-haspopup="menu" aria-expanded={open} disabled={!overview || busy !== null} onClick={() => setOpen((v) => !v)} data-testid="export-button">
        <AxIcon name="download" small />
        {busy ? t("overview.export.working") : t("overview.export.label")}
      </button>
      {open && (
        <div className="ax-dd ax-dd--acct ax-dd--narrow" role="menu">
          <button role="menuitem" type="button" className="ax-option" onClick={() => run("xlsx")}>
            <AxIcon name="file" />
            {t("overview.export.excel")}
          </button>
          <button role="menuitem" type="button" className="ax-option" onClick={() => run("pdf")}>
            <AxIcon name="file" />
            {t("overview.export.pdf")}
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingBody() {
  return (
    <div className="ax-dash" aria-hidden="true">
      <div className="ax-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ax-card ax-kpi">
            <Skel variant="text" width="50%" />
            <Skel height={40} width="65%" />
            <Skel variant="text" width="70%" />
          </div>
        ))}
      </div>
      <div className="ax-card ax-card--pad"><Skel height={36} /></div>
      <div className="ax-charts">
        <div className="ax-card ax-ch"><Skel variant="title" width="30%" /><Skel height={240} /></div>
        <div className="ax-card ax-ch"><Skel variant="title" width="50%" /><Skel height={240} /></div>
      </div>
    </div>
  );
}

// Nothing happened in the window: no booking made, no night sold, no money.
const isEmpty = (overview) => overview.current.bookings === 0 && overview.current.nightsSold === 0 && overview.current.revenue === 0;

// Admin home: the chosen window of days against the one before it, today at
// the property, revenue and occupancy day by day, the latest bookings.
// Everything comes from GET /dashboard/overview, counted in the property's
// timezone (APP_TIMEZONE).
export default function DashboardPage() {
  const { t, i18n } = useTranslation("dashboard");
  const lang = i18n.language;
  const property = useProperty();
  const phone = useMedia(PHONE_QUERY);
  const [params, setParams] = useSearchParams();
  const [picking, setPicking] = useState(false);
  const customButton = useRef(null);
  const win = readWindow(params);
  const key = JSON.stringify(win.query);
  useDocumentTitle(t("overview.title"));

  const { data, loading, error, reload } = useAsyncData(`dashboard:${key}`, () => getDashboardOverview(win.query));
  // The previous figures stay on screen while another window loads.
  const [shown, setShown] = useState(null);
  if (data && data !== shown) setShown(data);
  const overview = data || (loading ? shown : null);
  const today = overview?.today || localDateString();

  const choose = (next) => {
    setPicking(false);
    setParams(next, { replace: true });
  };

  const header = (
    <div className="ax-head">
      <div>
        <Crumbs current={t("overview.crumb")} />
        <h1>{t("overview.title")}</h1>
        <p>{overview ? `${property.name} · ${rangeText(overview.from, overview.to, lang)}` : property.name}</p>
      </div>
      <div className="ax-actions">
        <div className="ax-seg" role="group" aria-label={t("overview.range.label")}>
          <button type="button" aria-pressed={win.key === "7"} onClick={() => choose({})}>{t("overview.range.d7")}</button>
          <button type="button" aria-pressed={win.key === "30"} onClick={() => choose({ days: "30" })}>{t("overview.range.d30")}</button>
          <button
            ref={customButton}
            type="button"
            aria-pressed={win.key === "custom"}
            aria-expanded={picking}
            aria-haspopup="dialog"
            onClick={() => setPicking((v) => !v)}
            data-testid="range-custom"
          >
            <AxIcon name="calendar" small />
            {win.key === "custom" && overview ? rangeText(overview.from, overview.to, lang) : t("overview.range.custom")}
          </button>
        </div>
        <span className="ax-hidephone">
          <ExportMenu overview={overview} />
        </span>
        {picking && (
          <RangePicker
            today={today}
            initial={overview ? { from: overview.from, to: overview.to } : { from: today, to: today }}
            anchorRef={customButton}
            onCancel={() => setPicking(false)}
            onApply={(range) => choose(range)}
          />
        )}
      </div>
    </div>
  );

  let body;
  if (!overview && error) {
    body = (
      <>
        <Alert title={t("overview.error.title")}>{apiErrorText(error, "dashboard:errors.loadFailed")}</Alert>
        <div className="ax-state">
          <EmptyState
            error
            icon="chart"
            title={t("overview.error.chartTitle")}
            actions={
              <button type="button" className="g-btn g-btn--primary" onClick={reload}>
                <AxIcon name="refund" small />
                {t("overview.error.retry")}
              </button>
            }
            testId="dashboard-error"
          >
            {t("overview.error.text")}
          </EmptyState>
        </div>
      </>
    );
  } else if (!overview) {
    body = <LoadingBody />;
  } else if (isEmpty(overview)) {
    body = (
      <>
        <div className="ax-kpis">
          {["revenue", "occupancy", "bookings", "adr"].map((name) => (
            <div key={name} className="ax-card ax-kpi">
              <div className="ax-kpi__k">{t(`overview.kpi.${name}`)}</div>
              <div className="ax-kpi__v is-none">—</div>
              <div className="ax-kpi__d">{t("overview.empty.noData")}</div>
            </div>
          ))}
        </div>
        <div className="ax-state">
          <EmptyState
            icon="calendar"
            title={t("overview.empty.title")}
            actions={
              <>
                <Link className="g-btn g-btn--primary" to="/admin/orders?new=desk">
                  <AxIcon name="plus" small />
                  {t("overview.empty.walkIn")}
                </Link>
                {win.key !== "30" && (
                  <button type="button" className="g-btn g-btn--outline" onClick={() => choose({ days: "30" })}>
                    {t("overview.empty.try30")}
                  </button>
                )}
              </>
            }
            testId="dashboard-empty"
          >
            {t("overview.empty.text", { range: rangeText(overview.from, overview.to, lang) })}
          </EmptyState>
        </div>
      </>
    );
  } else {
    body = (
      <div className={`ax-dash${loading ? " is-busy" : ""}`}>
        {error && <Alert>{apiErrorText(error, "dashboard:errors.loadFailed")}</Alert>}
        {phone ? (
          <>
            <TodayStrip overview={overview} />
            <Kpis overview={overview} />
            <RevenueChart overview={overview} />
            <NeedsAction today={today} />
          </>
        ) : (
          <>
            <Kpis overview={overview} />
            <TodayStrip overview={overview} />
            <div className="ax-charts">
              <RevenueChart overview={overview} />
              <OccupancyChart overview={overview} />
            </div>
            <RecentTable rows={overview.recent} today={today} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="ax-screen" aria-busy={loading} data-testid="dashboard-page" data-state={!overview ? (error ? "error" : "loading") : isEmpty(overview) ? "empty" : "ready"}>
      {header}
      {body}
    </div>
  );
}
