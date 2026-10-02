import { useTranslation } from "react-i18next";
import { normalizeImageUrl, useFallbackImage } from "../../utils/imageUrl";
import { STATUS_STYLE, getStatusLabel, formatMoney, formatDate, calculateNights, buildTimeline } from "./helpers";

export default function BookingDetailModal({ booking, onClose }) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const statusLabel = getStatusLabel(t);
  const style = STATUS_STYLE[booking.status] || STATUS_STYLE.pending;
  const nights = calculateNights(booking.check_in, booking.check_out);
  const timeline = buildTimeline(booking, t);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.65)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="booking-detail-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 920,
          background: "#fff",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(15,23,42,0.35)",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: 12 }}>
              {t("myBookings:detailModal.bookingId", { id: String(booking.id).padStart(4, "0") })}
            </p>
            <h2 style={{ margin: 0, color: "#002366", fontSize: 22 }}>
              {t("myBookings:detailModal.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              fontSize: 20,
              color: "#334155",
            }}
          >
            ×
          </button>
        </div>

        <div
          className="booking-detail-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "320px 1fr",
            gap: 0,
          }}
        >
          <div
            style={{
              minHeight: 280,
              overflow: "hidden",
            }}
          >
            <img
              src={normalizeImageUrl(booking.room_image)}
              alt={booking.room_name || "Room"}
              onError={useFallbackImage}
              style={{
                width: "100%",
                height: "100%",
                minHeight: 280,
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>

          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: "0 0 6px", color: "#002366", fontSize: 20 }}>
                  {booking.room_name || "-"}
                </h3>
                <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
                  {booking.room_type || "-"}
                  {booking.room_capacity ? ` · ${t("myBookings:card.maxGuests", { count: booking.room_capacity })}` : ""}
                </p>
              </div>
              <span
                style={{
                  alignSelf: "flex-start",
                  padding: "5px 12px",
                  borderRadius: 20,
                  color: style.color,
                  background: style.bg,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {statusLabel[booking.status] || booking.status || statusLabel.pending}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <DetailItem label={t("myBookings:detailModal.checkIn")} value={formatDate(booking.check_in, lang)} />
              <DetailItem label={t("myBookings:detailModal.checkOut")} value={formatDate(booking.check_out, lang)} />
              <DetailItem label={t("myBookings:detailModal.nights")} value={t("myBookings:detailModal.nightsValue", { count: nights })} />
              <DetailItem label={t("myBookings:detailModal.guests")} value={t("myBookings:detailModal.guestsValue", { count: booking.guests || 1 })} />
              {booking.room_capacity && (
                <DetailItem label={t("myBookings:detailModal.roomCapacity")} value={t("myBookings:detailModal.roomCapacityValue", { count: booking.room_capacity })} />
              )}
              {booking.room_price !== undefined && booking.room_price !== null && (
                <DetailItem label={t("myBookings:detailModal.currentRoomPrice")} value={t("myBookings:detailModal.perNight", { amount: formatMoney(booking.room_price, lang) })} />
              )}
              <DetailItem label={t("myBookings:detailModal.createdAt")} value={formatDate(booking.created_at, lang)} />
              <DetailItem label={t("myBookings:detailModal.totalLocked")} value={formatMoney(booking.total_price, lang)} highlight />
              <DetailItem label={t("myBookings:detailModal.status")} value={statusLabel[booking.status] || booking.status || "-"} />
            </div>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: "0 0 4px", color: "#002366", fontSize: 16 }}>
                  {t("myBookings:detailModal.timelineTitle")}
                </h3>
                <p style={{ margin: 0, color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>
                  {t("myBookings:detailModal.timelineNote")}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {timeline.map((item, index) => (
                  <div key={`${item.label}-${index}`} style={{ display: "flex", gap: 12 }}>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: item.active ? "#002366" : "#cbd5e1",
                        marginTop: 4,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <p style={{ margin: 0, color: item.active ? "#1e293b" : "#94a3b8", fontWeight: 700, fontSize: 13 }}>
                        {item.label}
                      </p>
                      <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 12 }}>
                        {item.date ? formatDate(item.date, lang) : t("myBookings:detailModal.asOfCurrentStatus")}
                      </p>
                      {item.note && (
                        <p style={{ margin: "3px 0 0", color: "#94a3b8", fontSize: 12 }}>
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, highlight = false }) {
  return (
    <div
      style={{
        background: highlight ? "#fffbeb" : "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <p style={{ margin: "0 0 5px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </p>
      <p style={{ margin: 0, color: highlight ? "#C5A059" : "#1e293b", fontWeight: 800, fontSize: 14 }}>
        {value}
      </p>
    </div>
  );
}
