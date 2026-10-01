import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { getRooms, getRoomLocations } from "../services/roomService";
import LocationAutocomplete from "../components/LocationAutocomplete";
import RoomReviews, { RoomRatingSummary } from "../components/RoomReviews";
import { createBooking } from "../services/bookingService";
import { createPayment } from "../services/paymentService";
import { validateCoupon } from "../services/couponService";
import { normalizeImageUrl, useFallbackImage } from "../utils/imageUrl";
import { useToast } from "../context/ToastContext";
import { usePaymentProviders } from "../utils/usePaymentProviders";
import { APP_NAME } from "../config/brand";
import { localDateString } from "../utils/date";

function mapRoomForDisplay(room) {
  return {
    id: room.id,
    name: room.room_name,
    location: room.room_type,
    price: Number(room.price),
    desc:
      room.description ||
      `${room.room_type} — tối đa ${room.capacity || 2} khách`,
    img: normalizeImageUrl(room.image),
    type: room.room_type,
    icons: ["restaurant", "spa", "pool"],
    status: room.status,
    capacity: Number(room.capacity) || 1,
  };
}

// Loads the Material Symbols icon glyphs. This is the one remaining
// external-font dependency on this page (headline/body type now use system
// font stacks, no network fetch needed) — icons have no system-font
// equivalent, so this stays until the page migrates to the app's inline-SVG
// Icon set (utils/icon.jsx), which the admin section already uses.
const materialIconsStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

  .material-symbols-outlined {
    font-family: 'Material Symbols Outlined';
    font-weight: normal;
    font-style: normal;
    font-size: 24px;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    display: inline-block;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    -webkit-font-feature-settings: 'liga';
    font-feature-settings: 'liga';
    -webkit-font-smoothing: antialiased;
  }

  .glass-nav {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

  /* Responsive nav links */
  @media (max-width: 768px) {
    .nav-links { display: none !important; }
    .hero-title { font-size: 2.5rem !important; }
    .search-bar { flex-direction: column !important; }
    .search-bar > * { border-right: none !important; border-bottom: 1px solid rgba(0,0,0,0.1) !important; }
    .search-bar > *:last-child { border-bottom: none !important; }
    .destinations-grid { grid-template-columns: 1fr !important; }
    .why-grid { grid-template-columns: 1fr !important; gap: 3rem !important; }
    .footer-grid { grid-template-columns: 1fr !important; }
    .booking-modal-panel { grid-template-columns: 1fr !important; max-height: 92vh !important; overflow-y: auto !important; }
    .booking-modal-image { min-height: 240px !important; }
    .booking-modal-form { padding: 24px !important; }
  }

  @media (min-width: 769px) and (max-width: 1024px) {
    .destinations-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .why-grid { grid-template-columns: repeat(3, 1fr) !important; }
  }

  /* Amenities row fix */
  .amenity-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    padding: 16px 0;
    border-top: 1px solid rgba(0,0,0,0.06);
    border-bottom: 1px solid rgba(0,0,0,0.06);
    margin-bottom: 2rem;
  }
  .amenity-item {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    color: #6b7280;
    font-size: 14px;
  }
  .amenity-item .material-symbols-outlined {
    font-size: 18px;
    color: #002366;
  }
`;


const destinations = [
    { city: "Tokyo", count: "86", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCsgL36oT6Tm2fqJq21_KxoLa1nG5If3TR9Z9RlOKvOBqxRtul2E2aKOX27KJ70tn5GwSjegpv2Y1yC5RWHKfc5Z1IZ_A7uXYOfJDNf_5HmCWorYTAK1SzQ-Z9fNvx7WUkogQ-mJviJXBRkleyALAGwP7H8M3fzM0AeWI_xi7cbvZgKZ7taJSaeSO_tu7riSa9Uk0m8bXK26J3lh7ILswSTxOAR0EW6f1I4TIICRgvBu7ATibv0a3JJUwXbW-xEZMOZEeR0L3VwQjY" },
    { city: "Amalfi Coast", count: "54", img: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800&h=600&fit=crop" },
    { city: "Santorini", count: "38", img: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&h=600&fit=crop" },
    { city: "Paris", count: "124", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuB_lf0xCLfQo1_bWb4BF4m-h5lKNxlKMqxJB6EHuXoY017Az0FQ_bYT5tmjLSarQ3b_rPlj531VlKXpRbfbdmOdKiDT_0mb34sIaC5XlDh07a6EL-J4-zTBp1uUnnQ0NPBGVO0_j1EhgIkV2cA5-MYCTqGjMLTkgE6gEDYSo-gb81csM4a1bfrlD_XoLe0gxY0ZEUB53OFSMgYkLf4rD4eIxconJ0JJQ6gPz0gcBrZqq0vmLY0ePvTTQ9oz0_QYESvi4DCB6rh9KCY" },
    { city: "Maldives", count: "42", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuB0lxva9nZICQHeckeawx44sgAuNmK2RBA9D0Cjc_S7vTz9nJB6919qigsPi2Gdx1X4fpjbMPG0FglKC1jza_DX3bP7Yvo490NpsPb5mlBr4dMukv3eNabaGWUmfqo05vIgO_OM6g8_GEh5osQ3hLL0AYP_F7EZf3svHIvTKLwKzpFcqfBsuM3XdRalEBtciRjMAvL0-S9sTe4fXDhQ2R81YPGFr9Db7kuyBMB6_N8Tcyh0_jbmo837e6odf3XPVoOpUP9BUBqKgs8" },
    { city: "Bali", count: "67", img: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=600&fit=crop" },
    { city: "New York", count: "210", img: "https://images.unsplash.com/photo-1522083165195-3424ed129620?w=800&h=600&fit=crop" },
    { city: "Dubai", count: "95", img: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&h=600&fit=crop" },
    { city: "Kyoto", count: "73", img: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=600&fit=crop" },
];
function Booking() {
    const { user, logout } = useAuth();
    const toast = useToast();
    const { t, i18n } = useTranslation(["booking", "common"]);

    const menuStyle = {
        cursor: "pointer",
        padding: "8px 0",
        fontSize: 14,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.8)",
    };

    const navigate = useNavigate();
    const [openSidebar, setOpenSidebar] = useState(false);
    const [page, setPage] = useState(0);
    const [vnPage, setVnPage] = useState(0);
    const [rooms, setRooms] = useState([]);
    const [roomsLoading, setRoomsLoading] = useState(true);
    const [roomsError, setRoomsError] = useState("");
    const [bookingSubmitting, setBookingSubmitting] = useState(false);
    const paymentProviders = usePaymentProviders();
    const [searchDates, setSearchDates] = useState({ checkIn: "", checkOut: "" });
    const [searchLocation, setSearchLocation] = useState("");
    const [searchGuests, setSearchGuests] = useState("");
    const [locations, setLocations] = useState([]);
    const [activeSearch, setActiveSearch] = useState(false);

    useEffect(() => {
      getRoomLocations()
        .then((list) => setLocations(Array.isArray(list) ? list : []))
        .catch(() => setLocations([]));
    }, []);

    const loadRooms = useCallback((params) => {
      setRoomsLoading(true);
      setRoomsError("");
      return getRooms(params)
        .then((result) => {
          const list = Array.isArray(result) ? result : result.data || [];
          const available = list.filter((r) => r.status !== "maintenance");
          setRooms(available.map(mapRoomForDisplay));
          // A fresh room list (e.g. from a new date search) can be shorter
          // than before; without resetting, a carousel page reached while
          // browsing the previous list can now be out of range and render
          // as empty even though the search actually found rooms.
          setVnPage(0);
        })
        .catch((err) => {
          setRooms([]);
          setRoomsError(
            err.response?.data?.message || t("booking:errors.loadRoomsFailed")
          );
        })
        .finally(() => setRoomsLoading(false));
    }, [t]);

    useEffect(() => {
      loadRooms();
    }, [loadRooms]);

    const handleSearchAvailability = () => {
      const { checkIn, checkOut } = searchDates;
      setRoomsError("");

      if ((checkIn && !checkOut) || (!checkIn && checkOut)) {
        setRoomsError(t("booking:errors.selectBothDates"));
        return;
      }

      if (checkIn && checkOut && checkOut <= checkIn) {
        setRoomsError(t("booking:errors.checkOutAfterCheckIn"));
        return;
      }

      const params = {};
      if (checkIn && checkOut) {
        params.checkIn = checkIn;
        params.checkOut = checkOut;
      }
      if (searchLocation) params.location = searchLocation;
      if (searchGuests) params.minCapacity = searchGuests;

      const hasActiveFilter = Object.keys(params).length > 0;
      setActiveSearch(hasActiveFilter);

      // Availability search should surface every free room, not just the
      // first page of the admin-style default (limit=10) — this is a
      // "browse what's open" view, not a paginated management table.
      loadRooms(hasActiveFilter ? { ...params, limit: 100 } : undefined);

      document
        .getElementById("featured-rooms")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const clearSearch = () => {
      setSearchDates({ checkIn: "", checkOut: "" });
      setSearchLocation("");
      setSearchGuests("");
      setActiveSearch(false);
      loadRooms();
    };

    // Modal booking room
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [bookingForm, setBookingForm] = useState({
        checkIn: "",
        checkOut: "",
        guests: 1,
    });
    const [bookingError, setBookingError] = useState("");
    const [createdBooking, setCreatedBooking] = useState(null);
    const [payingProvider, setPayingProvider] = useState(null);
    const [paymentError, setPaymentError] = useState("");
    const [showReviews, setShowReviews] = useState(false);
    const [couponCode, setCouponCode] = useState("");
    const [couponApplied, setCouponApplied] = useState(null);
    const [couponChecking, setCouponChecking] = useState(false);
    const [couponError, setCouponError] = useState("");

    const openBookingModal = (room) => {
        if (!room?.id) {
            toast.info(t("booking:errors.showcaseRoom"));
            return;
        }

        setSelectedRoom(room);
        setBookingForm({
            checkIn: "",
            checkOut: "",
            guests: 1,
        });
        setBookingError("");
        setCreatedBooking(null);
        setPaymentError("");
        setShowReviews(false);
        setCouponCode("");
        setCouponApplied(null);
        setCouponError("");
    };

    const closeBookingModal = () => {
        setSelectedRoom(null);
        setBookingError("");
        setCreatedBooking(null);
        setPaymentError("");
        setShowReviews(false);
        setCouponCode("");
        setCouponApplied(null);
        setCouponError("");
    };

    const handlePayNow = async (provider) => {
        if (!createdBooking?.id) return;

        setPaymentError("");
        setPayingProvider(provider);
        try {
            const res = await createPayment(createdBooking.id, provider);
            window.location.href = res.data.payUrl;
        } catch (err) {
            setPaymentError(
                err.response?.data?.message || t("booking:errors.paymentInitFailed")
            );
            setPayingProvider(null);
        }
    };

    const handlePayLater = () => {
        closeBookingModal();
        navigate("/my-bookings");
    };

    const calculateTotal = () => {
        if (!selectedRoom || !bookingForm.checkIn || !bookingForm.checkOut) {
            return 0;
        }

        const checkInDate = new Date(bookingForm.checkIn);
        const checkOutDate = new Date(bookingForm.checkOut);
        const diffTime = checkOutDate - checkInDate;
        const nights = diffTime / (1000 * 60 * 60 * 24);

        if (nights <= 0) return 0;

        const priceNumber = Number(selectedRoom.price);

        return nights * priceNumber;
    };

    const handleApplyCoupon = async () => {
        const subtotal = calculateTotal();

        if (!couponCode.trim()) {
            setCouponError(t("booking:errors.couponEmpty"));
            return;
        }
        if (subtotal <= 0) {
            setCouponError(t("booking:errors.couponNeedsDates"));
            return;
        }

        setCouponChecking(true);
        setCouponError("");
        try {
            const result = await validateCoupon(couponCode.trim(), subtotal);
            setCouponApplied(result);
            toast.success(
                t("booking:toasts.couponApplied", {
                    amount: result.discountAmount.toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN"),
                })
            );
        } catch (err) {
            setCouponApplied(null);
            setCouponError(err.response?.data?.message || t("booking:errors.couponInvalid"));
        } finally {
            setCouponChecking(false);
        }
    };

    const handleBookRoom = async (e) => {
        e.preventDefault();
        setBookingError("");

        const guests = Number(bookingForm.guests);
        const capacity = Number(selectedRoom?.capacity) || 1;

        if (!selectedRoom?.id) {
            setBookingError(t("booking:errors.invalidRoom"));
            return;
        }

        if (!bookingForm.checkIn || !bookingForm.checkOut) {
            setBookingError(t("booking:errors.selectBothDates"));
            return;
        }

        if (bookingForm.checkIn < todayStr) {
            setBookingError(t("booking:errors.checkInPast"));
            return;
        }

        if (bookingForm.checkOut <= bookingForm.checkIn || calculateTotal() <= 0) {
            setBookingError(t("booking:errors.checkOutAfterCheckIn"));
            return;
        }

        if (!Number.isInteger(guests) || guests <= 0) {
            setBookingError(t("booking:errors.guestsPositive"));
            return;
        }

        if (guests > capacity) {
            setBookingError(t("booking:errors.guestsExceedCapacity", { count: capacity }));
            return;
        }

        try {
            setBookingSubmitting(true);

            const res = await createBooking({
                room_id: selectedRoom.id,
                check_in: bookingForm.checkIn,
                check_out: bookingForm.checkOut,
                guests,
                ...(couponApplied ? { coupon_code: couponCode.trim() } : {}),
            });

            toast.success(res.data.message);
            // Nothing to pay (fully discounted): the booking is already
            // confirmed, so there is no payment step to show.
            if (res.data.booking.status === "confirmed") {
                closeBookingModal();
                navigate("/my-bookings");
                return;
            }
            setCreatedBooking(res.data.booking);
        } catch (err) {
            setBookingError(
                err.response?.data?.message ||
                t("booking:errors.bookingFailed")
            );
        } finally {
            setBookingSubmitting(false);
        }
    };

    const itemsPerPage = 3;
    const totalPages = Math.ceil(destinations.length / itemsPerPage);
    const visibleItems = destinations.slice(page * itemsPerPage, page * itemsPerPage + itemsPerPage);
    const next = () => setPage((p) => (p === totalPages - 1 ? 0 : p + 1));
    const prev = () => setPage((p) => (p === 0 ? totalPages - 1 : p - 1));

    const vnPerPage = 3;
    const vnTotalPages = Math.max(1, Math.ceil(rooms.length / vnPerPage));
    const vnVisible = rooms.slice(vnPage * vnPerPage, vnPage * vnPerPage + vnPerPage);

    const todayStr = localDateString();

    return (
        <div className="font-body" style={{ minHeight: "max(884px, 100dvh)", background: "#fafafa", color: "#1A1C1E" }}>
            <style>{materialIconsStyle}</style>

            {/* Sidebar */}
            <div style={{
                position: "fixed", top: 0, left: openSidebar ? 0 : "-260px",
                width: "250px", height: "100vh", background: "#0b0e14", color: "#fff",
                padding: "20px", transition: "left 0.3s ease", zIndex: 1000,
            }}>
                <h3 style={{ marginBottom: 20, fontFamily: "var(--font-serif)" }}>{t("common:nav.menu")}</h3>
                {user?.role === "admin" && (
                    <>
                        <p
                            onClick={() => {
                                navigate("/dashboard");
                                setOpenSidebar(false);
                            }}
                            style={menuStyle}
                        >
                            {t("common:nav.dashboard")}
                        </p>

                        <p
                            onClick={() => {
                                navigate("/users");
                                setOpenSidebar(false);
                            }}
                            style={menuStyle}
                        >
                            {t("common:nav.users")}
                        </p>

                        <p
                            onClick={() => {
                                navigate("/orders");
                                setOpenSidebar(false);
                            }}
                            style={menuStyle}
                        >
                            {t("common:nav.orders")}
                        </p>

                        <p
                            onClick={() => {
                                navigate("/settings");
                                setOpenSidebar(false);
                            }}
                            style={menuStyle}
                        >
                            {t("common:nav.settings")}
                        </p>
                    </>
                )}

                {user?.role !== "admin" && (
                    <p
                        onClick={() => {
                            navigate("/settings");
                            setOpenSidebar(false);
                        }}
                        style={menuStyle}
                    >
                        {t("common:nav.accountSettings")}
                    </p>
                )}

                <p
                    onClick={() => {
                        navigate("/my-bookings");
                        setOpenSidebar(false);
                    }}
                    style={menuStyle}
                >
                    {t("common:nav.myBookings")}
                </p>

                <p
                    onClick={() => {
                        navigate("/booking");
                        setOpenSidebar(false);
                    }}
                    style={menuStyle}
                >
                    {t("common:nav.booking")}
                </p>
                <button onClick={() => setOpenSidebar(false)}
                    style={{ marginTop: 20, padding: "8px 12px", background: "#C5A059", color: "#000", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {t("common:nav.close")}
                </button>
            </div>
            {openSidebar && (
                <div onClick={() => setOpenSidebar(false)}
                    style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.4)", zIndex: 999 }} />
            )}

            {/* Header */}
            <header className="glass-nav" style={{ position: "fixed", top: 0, width: "100%", zIndex: 50, boxShadow: "0 1px 20px rgba(0,0,0,0.08)" }}>
                <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span className="material-symbols-outlined" onClick={() => setOpenSidebar(true)}
                            style={{ color: "#002366", cursor: "pointer", fontSize: 24 }}>menu</span>
                        <span className="font-headline" style={{ fontSize: 22, fontWeight: "bold", color: "#002366", letterSpacing: "-0.5px" }}>{APP_NAME}</span>
                    </div>
                    <div className="nav-links" style={{ display: "flex", gap: 40, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.15em", color: "#64748b" }}>
                        {[
                            t("booking:topNav.destinations"),
                            t("booking:topNav.experiences"),
                            t("booking:topNav.offers"),
                            t("booking:topNav.concierge"),
                        ].map((item, i) => (
                            <a key={item} href="#" style={{ color: i === 0 ? "#002366" : undefined, fontWeight: i === 0 ? 600 : undefined, textDecoration: "none", transition: "color 0.2s" }}
                                onMouseEnter={e => e.target.style.color = "#C5A059"}
                                onMouseLeave={e => e.target.style.color = i === 0 ? "#002366" : "#64748b"}>
                                {item}
                            </a>
                        ))}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                border: "1px solid #002366",
                                borderRadius: 6,
                                overflow: "hidden",
                            }}
                        >
                            {["vi", "en"].map((lng) => (
                                <button
                                    key={lng}
                                    onClick={() => i18n.changeLanguage(lng)}
                                    aria-label={lng === "vi" ? t("common:language.vi") : t("common:language.en")}
                                    style={{
                                        padding: "8px 10px",
                                        border: "none",
                                        background: i18n.language === lng ? "#002366" : "transparent",
                                        color: i18n.language === lng ? "#fff" : "#002366",
                                        cursor: "pointer",
                                        fontSize: 12,
                                        fontWeight: 700,
                                    }}
                                >
                                    {lng.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        <span
                            style={{
                                color: "#002366",
                                fontWeight: 600,
                            }}
                        >
                            {user?.name}
                        </span>

                        <button
                            onClick={() => navigate("/settings")}
                            style={{
                                padding: "8px 14px",
                                border: "1px solid #002366",
                                background: "transparent",
                                color: "#002366",
                                cursor: "pointer",
                                borderRadius: 6,
                                fontSize: 13,
                            }}
                        >
                            {t("common:nav.settings")}
                        </button>

                        <button
                            onClick={() => navigate("/my-bookings")}
                            style={{
                                padding: "8px 14px",
                                border: "1px solid #002366",
                                background: "transparent",
                                color: "#002366",
                                cursor: "pointer",
                                borderRadius: 6,
                                fontSize: 13,
                            }}
                        >
                            {t("common:nav.myBookings")}
                        </button>

                        <button
                            onClick={() => {
                                logout();
                                navigate("/login");
                            }}
                            style={{
                                padding: "8px 14px",
                                border: "none",
                                background: "#002366",
                                color: "#fff",
                                cursor: "pointer",
                                borderRadius: 6,
                            }}
                        >
                            {t("common:nav.logout")}
                        </button>
                    </div>
                </nav>
            </header>

            <main>
                {/* Hero */}
                <section style={{ position: "relative", height: "795px", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                        <img alt="Luxury Hotel Lobby" onError={useFallbackImage} style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAe1eIrCHeHTRnMBMHnCSsRPwJt2r7uVIHNSbs8Y4L_JSF-yCK1ezkKDT2tQ0KBlDM7zKc5PvQMc1BB4rQIbRwR2gT6ArIp9bdggjM8xyhs5yVepCrRWoCLQzAaqGjFSiIh63y8UHCTixjtjtTE5QZ_1dzRvTQTY0qwqSsrr8OQXCEJlv5S9HOD8H5Gdx_niCODZXMsZBOs3QGZ_ZIIKxNaIlPT9TNPRAzc7EceXWHBKhvbbe0VRgb9Xl_J0PoLqWhMD8UalNr9UXc" />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,17,58,0.4) 0%, rgba(0,17,58,0.1) 50%, rgba(249,249,252,1) 100%)" }} />
                    </div>
                    <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 1100, padding: "0 32px 48px", textAlign: "center" }}>
                        <h1 className="hero-title font-headline" style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)", color: "#002366", marginBottom: 24, letterSpacing: "-1px" }}>{t("booking:hero.title")}</h1>
                        <p className="font-label" style={{ color: "#C5A059", textTransform: "uppercase", letterSpacing: "0.3em", marginBottom: 48, fontWeight: 600, fontSize: 13 }}>{t("booking:hero.subtitle")}</p>
                        {/* Search Bar */}
                        <div className="search-bar" style={{ background: "#fff", boxShadow: "0 4px 30px rgba(0,0,0,0.12)", padding: "8px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0, borderRadius: 6 }}>
                            <div style={{ flex: 1, minWidth: 160, padding: "12px 20px", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", fontWeight: 700, marginBottom: 4 }}>{t("booking:hero.checkIn")}</div>
                                <input
                                    type="date"
                                    min={todayStr}
                                    value={searchDates.checkIn}
                                    onChange={(e) => setSearchDates((prev) => ({ ...prev, checkIn: e.target.value }))}
                                    style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: "#002366", fontWeight: 500, fontSize: 14 }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: 160, padding: "12px 20px", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", fontWeight: 700, marginBottom: 4 }}>{t("booking:hero.checkOut")}</div>
                                <input
                                    type="date"
                                    min={searchDates.checkIn || todayStr}
                                    value={searchDates.checkOut}
                                    onChange={(e) => setSearchDates((prev) => ({ ...prev, checkOut: e.target.value }))}
                                    style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: "#002366", fontWeight: 500, fontSize: 14 }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: 200, padding: "12px 20px", borderRight: "1px solid rgba(0,0,0,0.08)", position: "relative" }}>
                                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", fontWeight: 700, marginBottom: 4 }}>{t("booking:hero.location")}</div>
                                <LocationAutocomplete
                                    value={searchLocation}
                                    onChange={setSearchLocation}
                                    options={locations}
                                    placeholder={t("booking:hero.allLocations")}
                                />
                            </div>
                            <div style={{ flex: "0 1 120px", minWidth: 100, padding: "12px 20px", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
                                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", fontWeight: 700, marginBottom: 4 }}>{t("booking:hero.guests")}</div>
                                <input
                                    type="number"
                                    min="1"
                                    placeholder={t("booking:hero.anyGuests")}
                                    value={searchGuests}
                                    onChange={(e) => setSearchGuests(e.target.value)}
                                    style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: "#002366", fontWeight: 500, fontSize: 14 }}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleSearchAvailability}
                                style={{ padding: "14px 32px", background: "#002366", color: "#fff", border: "none", borderRadius: 4, fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer", whiteSpace: "nowrap" }}
                            >
                                {t("booking:hero.searchButton")}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Signature Destinations */}
                <section style={{ padding: "96px 0", background: "#fff" }}>
                    <div style={{ padding: "0 32px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48 }}>
                            <div>
                                <span style={{ color: "#C5A059", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, display: "block", marginBottom: 8 }}>{t("booking:destinationsSection.eyebrow")}</span>
                                <h2 className="font-headline" style={{ fontSize: 36, color: "#002366", margin: 0 }}>{t("booking:destinationsSection.title")}</h2>
                            </div>
                            <div style={{ display: "flex", gap: 12 }}>
                                {[prev, next].map((fn, i) => (
                                    <button key={i} onClick={fn} style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {i === 0 ? "‹" : "›"}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="destinations-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
                            {visibleItems.map(({ city, count, img }) => (
                                <div key={city} style={{ cursor: "pointer" }}
                                    onMouseEnter={e => e.currentTarget.querySelector("img").style.transform = "scale(1.08)"}
                                    onMouseLeave={e => e.currentTarget.querySelector("img").style.transform = "scale(1)"}>
                                    <div style={{ borderRadius: 12, aspectRatio: "3/4", overflow: "hidden", position: "relative" }}>
                                        <img src={normalizeImageUrl(img)} alt={city} onError={useFallbackImage} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.7s ease" }} />
                                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,35,102,0.6) 0%, transparent 50%)" }} />
                                        <div style={{ position: "absolute", bottom: 24, left: 24 }}>
                                            <h3 className="font-headline" style={{ color: "#fff", fontSize: 28, margin: 0 }}>{city}</h3>
                                            <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", margin: "4px 0 0" }}>{count} {t("booking:destinationsSection.properties")}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 32 }}>
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <button key={i} onClick={() => setPage(i)}
                                style={{ height: 8, width: page === i ? 24 : 8, borderRadius: 4, background: page === i ? "#002366" : "#cbd5e1", border: "none", cursor: "pointer", transition: "all 0.3s", padding: 0 }} />
                        ))}
                    </div>
                </section>

                {/* Exquisite Vietnam */}
                <section id="featured-rooms" style={{ padding: "96px 0", background: "#f8f8f8", overflow: "hidden" }}>
                    <div style={{ padding: "0 32px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48, gap: 16 }}>
                            <div>
                                <span style={{ color: "#C5A059", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, display: "block", marginBottom: 8 }}>{t("booking:featuredRooms.eyebrow")}</span>
                                <h2 className="font-headline" style={{ fontSize: 36, color: "#002366", margin: 0 }}>{t("booking:featuredRooms.title")}</h2>
                                {activeSearch && (
                                    <p style={{ color: "#059669", fontSize: 13, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                        {t("booking:featuredRooms.filtering")}
                                        {searchDates.checkIn && searchDates.checkOut && (
                                            <span>{t("booking:featuredRooms.availableRange", { checkIn: searchDates.checkIn, checkOut: searchDates.checkOut })}</span>
                                        )}
                                        {searchLocation && <span>· {searchLocation}</span>}
                                        {searchGuests && <span>· {t("booking:featuredRooms.guestsPlus", { count: searchGuests })}</span>}
                                        <button
                                            type="button"
                                            onClick={clearSearch}
                                            style={{ background: "none", border: "none", color: "#002366", textDecoration: "underline", cursor: "pointer", fontSize: 13, padding: 0 }}
                                        >
                                            {t("booking:featuredRooms.clearFilters")}
                                        </button>
                                    </p>
                                )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                                <p style={{ color: "#6b7280", maxWidth: 380, fontSize: 14, lineHeight: 1.8, margin: 0 }}>
                                    {t("booking:featuredRooms.description")}
                                </p>
                                <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                                    {[-1, 1].map((dir, i) => (
                                        <button key={i} onClick={() => setVnPage(p => {
                                            return dir === -1 ? (p === 0 ? vnTotalPages - 1 : p - 1) : (p === vnTotalPages - 1 ? 0 : p + 1);
                                        })}
                                            style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}
                                            onMouseEnter={e => { e.currentTarget.style.background = "#002366"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "#002366"; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#000"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
                                            {dir === -1 ? "‹" : "›"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {roomsLoading ? (
                            <p style={{ textAlign: "center", color: "#64748b", padding: "40px 0" }}>
                                {t("booking:featuredRooms.loading")}
                            </p>
                        ) : roomsError ? (
                            <p role="alert" style={{ textAlign: "center", color: "#b91c1c", padding: "40px 0" }}>
                                {roomsError}
                            </p>
                        ) : rooms.length === 0 ? (
                            <p style={{ textAlign: "center", color: "#64748b", padding: "40px 0" }}>
                                {activeSearch
                                    ? t("booking:featuredRooms.noRoomsFiltered")
                                    : t("booking:featuredRooms.noRoomsAtAll")}
                            </p>
                        ) : (
                            <>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28 }}>
                                    {vnVisible.map(({ id, name, location, desc, icons, img, price, type, capacity }) => (
                                        <div key={id} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", transition: "transform 0.3s, box-shadow 0.3s" }}
                                            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.14)"; }}
                                            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.08)"; }}>
                                            <div
                                                onClick={() =>
                                                    openBookingModal({
                                                        id,
                                                        name,
                                                        location,
                                                        desc,
                                                        img,
                                                        price,
                                                        capacity,
                                                        type: type || "Luxury Room",
                                                    })
                                                }
                                                style={{
                                                    height: 260,
                                                    overflow: "hidden",
                                                    position: "relative",
                                                    cursor: "pointer",
                                                }}
                                                onMouseEnter={e => e.currentTarget.querySelector("img").style.transform = "scale(1.06)"}
                                                onMouseLeave={e => e.currentTarget.querySelector("img").style.transform = "scale(1)"}
                                            >
                                                <img
                                                    alt={name}
                                                    style={{
                                                        width: "100%",
                                                        height: "100%",
                                                        objectFit: "cover",
                                                        transition: "transform 1s ease"
                                                    }}
                                                    src={normalizeImageUrl(img)}
                                                    onError={useFallbackImage}
                                                />
                                                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.18) 0%, transparent 50%)" }} />
                                                <div style={{ position: "absolute", top: 14, right: 14, background: "#C5A059", color: "#000", padding: "4px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>{Number(price).toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN")} {t("booking:featuredRooms.perNight")}</div>
                                                <div style={{ position: "absolute", bottom: 14, left: 14, background: "rgba(0,35,102,0.82)", color: "#fff", padding: "5px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, borderRadius: 4 }}>{t("booking:featuredRooms.maxGuestsBadge", { count: capacity })}</div>
                                            </div>
                                            <div style={{ padding: 28 }}>
                                                <h3 className="font-headline" style={{ fontSize: 20, color: "#002366", marginBottom: 8, marginTop: 0, lineHeight: 1.3 }}>{name}</h3>
                                                <div style={{ marginBottom: 10 }}>
                                                    <RoomRatingSummary roomId={id} />
                                                </div>
                                                <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>{desc}</p>
                                                <p style={{ color: "#002366", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, margin: "0 0 18px" }}>
                                                    {t("booking:featuredRooms.maxCapacityLabel", { count: capacity })}
                                                </p>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 20 }}>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        {icons.map((icon) => (
                                                            <div key={icon} style={{ width: 40, height: 40, borderRadius: "50%", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.3s" }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = "#C5A059"; e.currentTarget.querySelector("span").style.color = "#fff"; }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.querySelector("span").style.color = "#002366"; }}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#002366" }}>{icon}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            openBookingModal({
                                                                id,
                                                                name,
                                                                location,
                                                                desc,
                                                                img,
                                                                price,
                                                                capacity,
                                                                type: type || "Luxury Room",
                                                            })
                                                        }
                                                        style={{ color: "#002366", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
                                                    >
                                                        {t("booking:featuredRooms.bookNow")}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {vnTotalPages > 1 && (
                                    <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 36 }}>
                                        {Array.from({ length: vnTotalPages }).map((_, i) => (
                                            <button key={i} onClick={() => setVnPage(i)}
                                                style={{ height: 8, width: vnPage === i ? 28 : 8, borderRadius: 4, background: vnPage === i ? "#002366" : "#cbd5e1", border: "none", cursor: "pointer", transition: "all 0.3s", padding: 0 }} />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>

                {/* Why us */}
                <section style={{ padding: "112px 0", background: "#f7f7f7" }}>
                    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px" }}>
                        <div className="why-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 60, textAlign: "center" }}>
                            {[
                                { icon: "verified", title: t("booking:whySection.handpickedTitle"), desc: t("booking:whySection.handpickedDesc") },
                                { icon: "support_agent", title: t("booking:whySection.conciergeTitle"), desc: t("booking:whySection.conciergeDesc") },
                                { icon: "payments", title: t("booking:whySection.priceTitle"), desc: t("booking:whySection.priceDesc") },
                            ].map(({ icon, title, desc }) => (
                                <div key={title} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                    <div style={{ width: 56, height: 56, borderRadius: 12, background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 32 }}>
                                        <span className="material-symbols-outlined" style={{ color: "#C5A059", fontSize: 26 }}>{icon}</span>
                                    </div>
                                    <h4 className="font-headline" style={{ color: "#001B5E", fontSize: 22, marginBottom: 20, marginTop: 0 }}>{title}</h4>
                                    <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.8, maxWidth: 280, margin: 0 }}>{desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Quote */}
                <section style={{ background: "#001B5E", padding: "128px 0", overflow: "hidden" }}>
                    <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 32px", textAlign: "center" }}>
                        <div style={{ color: "#C5A059", fontSize: 72, fontFamily: "var(--font-serif)", marginBottom: 32, lineHeight: 1 }}>"</div>
                        <h2 className="font-headline" style={{ color: "#fff", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", lineHeight: 1.4, fontStyle: "italic", margin: "0 0 56px" }}>
                            "{t("booking:quote.text")}"
                        </h2>
                        <p style={{ color: "#C5A059", textTransform: "uppercase", letterSpacing: "0.3em", fontSize: 12, fontWeight: 700, margin: "0 0 8px" }}>{t("booking:quote.author")}</p>
                        <p style={{ color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.25em", fontSize: 11, margin: 0 }}>{t("booking:quote.location")}</p>
                        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 48 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C5A059" }} />
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section style={{ position: "relative", padding: "128px 0", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                        <img alt="Poolside Luxury" onError={useFallbackImage} style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB5LXgNktzMjgk6YMo0A545hrJ2H-FzYcOmqRul-Gzz_EMbi37IwO8wC0iuAvwI6_bwROKlsZCObpIF5DOK2g9i42TxFmQ1psUpcMFotaUHR6T-V1qaOelvGnl9jdJB7t4QFjHvAed8J_CIwPa82lV_K4sS4f6klKhO290e3JxQDMaXQJP7R_bKLmn1VKs4AfRkj_04QSLFBAAEvow10SJfR7MPCVHMHWKxAGFEXwcDxJTXecwgXL9y-WoHg9rX4GHY-B3ayjTX3K0" />
                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,35,102,0.45)", backdropFilter: "blur(2px)" }} />
                    </div>
                    <div style={{ position: "relative", zIndex: 10, padding: "0 32px", textAlign: "center", maxWidth: 700, margin: "0 auto" }}>
                        <h2 className="font-headline" style={{ color: "#fff", fontSize: "clamp(2rem, 5vw, 3rem)", marginBottom: 32 }}>{t("booking:cta.title")}</h2>
                        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 18, lineHeight: 1.7, marginBottom: 48 }}>
                            {t("booking:cta.description")}
                        </p>
                        <button style={{ padding: "20px 48px", background: "#C5A059", color: "#000", border: "none", fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, cursor: "pointer", transition: "all 0.3s" }}
                            onMouseEnter={e => e.target.style.opacity = "0.85"}
                            onMouseLeave={e => e.target.style.opacity = "1"}>
                            {t("booking:cta.joinButton")}
                        </button>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer style={{ background: "#f8fafc" }}>
                <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "1fr repeat(3, auto)", gap: 32, padding: "64px 48px" }}>
                    <div>
                        <span className="font-headline" style={{ fontSize: 20, color: "#002366", display: "block", marginBottom: 20 }}>{APP_NAME}</span>
                        <p style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", lineHeight: 1.8, maxWidth: 220 }}>{t("booking:footer.tagline")}</p>
                    </div>
                    {[
                        { title: t("booking:footer.discover"), links: [t("booking:footer.destinations"), t("booking:footer.experiences"), t("booking:footer.collections")] },
                        { title: t("booking:footer.about"), links: [t("booking:footer.ourStory"), t("booking:footer.conciergeServices"), t("booking:footer.press")] },
                        { title: t("booking:footer.legal"), links: [t("booking:footer.termsOfService"), t("booking:footer.privacyPolicy")] },
                    ].map(({ title, links }) => (
                        <div key={title}>
                            <h5 style={{ color: "#002366", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 24, marginTop: 0, fontWeight: 700 }}>{title}</h5>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                                {links.map(link => (
                                    <li key={link}>
                                        <a href="#" style={{ color: "#64748b", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.12em", textDecoration: "none" }}
                                            onMouseEnter={e => e.target.style.textDecoration = "underline"}
                                            onMouseLeave={e => e.target.style.textDecoration = "none"}>
                                            {link}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div style={{ padding: "24px 48px", borderTop: "1px solid #e2e8f0", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                    <p style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>{t("booking:footer.copyright")}</p>
                    <div style={{ display: "flex", gap: 20 }}>
                        <span className="material-symbols-outlined" style={{ color: "#94a3b8", fontSize: 22, cursor: "pointer" }}>public</span>
                        <span className="material-symbols-outlined" style={{ color: "#94a3b8", fontSize: 22, cursor: "pointer" }}>share</span>
                    </div>
                </div>
            </footer>
            {/* Booking Room Modal */}
            {selectedRoom && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0, 0, 0, 0.65)",
                        zIndex: 3000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 24,
                    }}
                    onClick={closeBookingModal}
                >
                    <div
                        className="booking-modal-panel"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 920,
                            maxHeight: "90vh",
                            background: "#fff",
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            // A plain "auto" row (the grid default) sizes to
                            // fit its tallest child's natural content height,
                            // ignoring the panel's own maxHeight — that's
                            // what let the form's content quietly overflow
                            // the panel with no scrollbar. minmax(0, 1fr)
                            // instead caps the row at the panel's available
                            // height and lets children shrink into it, so
                            // overflow-y:auto on the form column below can
                            // actually activate.
                            gridTemplateRows: "minmax(0, 1fr)",
                            borderRadius: 18,
                            overflow: "hidden",
                            boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
                        }}
                    >
                        {/* Left image */}
                        <div
                            className="booking-modal-image"
                            style={{
                                minHeight: 520,
                                backgroundImage: `url(${normalizeImageUrl(selectedRoom.img)})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                position: "relative",
                            }}
                        >
                            <div
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    background: "linear-gradient(to top, rgba(0,35,102,0.7), transparent)",
                                }}
                            />

                            <div
                                style={{
                                    position: "absolute",
                                    bottom: 32,
                                    left: 32,
                                    right: 32,
                                    color: "#fff",
                                }}
                            >
                                <p
                                    style={{
                                        color: "#C5A059",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.18em",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        marginBottom: 8,
                                    }}
                                >
                                    {selectedRoom.type}
                                </p>

                                <h2
                                    className="font-headline"
                                    style={{
                                        fontSize: 32,
                                        margin: "0 0 8px",
                                    }}
                                >
                                    {selectedRoom.name}
                                </h2>

                                <p style={{ margin: 0, color: "rgba(255,255,255,0.85)" }}>
                                    {selectedRoom.location}
                                </p>
                            </div>
                        </div>

                        {/* Right form */}
                        {createdBooking ? (
                            <div
                                className="booking-modal-form"
                                style={{
                                    padding: 40,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "center",
                                    overflowY: "auto",
                                    minHeight: 0,
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={closeBookingModal}
                                    style={{
                                        alignSelf: "flex-end",
                                        width: 36,
                                        height: 36,
                                        borderRadius: "50%",
                                        border: "1px solid #e5e7eb",
                                        background: "#fff",
                                        cursor: "pointer",
                                        fontSize: 18,
                                        marginBottom: 12,
                                    }}
                                >
                                    ×
                                </button>

                                <span
                                    style={{
                                        color: "#059669",
                                        fontSize: 12,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.2em",
                                        fontWeight: 700,
                                        marginBottom: 8,
                                    }}
                                >
                                    {t("booking:modal.bookingCreated")}
                                </span>

                                <h2
                                    className="font-headline"
                                    style={{ color: "#002366", fontSize: 30, margin: "0 0 12px" }}
                                >
                                    {t("booking:modal.completePayment")}
                                </h2>

                                <p style={{ color: "#6b7280", lineHeight: 1.7, fontSize: 14, marginBottom: 22 }}>
                                    {t("booking:modal.pendingPaymentNotice", { id: createdBooking.id })}
                                </p>

                                <div
                                    style={{
                                        background: "#f8fafc",
                                        padding: 18,
                                        borderRadius: 12,
                                        marginBottom: 22,
                                        border: "1px solid #e5e7eb",
                                    }}
                                >
                                    <p
                                        style={{
                                            margin: "0 0 6px",
                                            color: "#64748b",
                                            fontSize: 13,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.12em",
                                        }}
                                    >
                                        {t("booking:modal.totalToPay")}
                                    </p>
                                    <h2 style={{ margin: 0, color: "#C5A059", fontSize: 28 }}>
                                        {Number(createdBooking.total_price).toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN")} VNĐ
                                    </h2>
                                </div>

                                {paymentError && (
                                    <div
                                        style={{
                                            background: "#fef2f2",
                                            border: "1px solid #fecaca",
                                            borderRadius: 8,
                                            color: "#b91c1c",
                                            fontSize: 13,
                                            lineHeight: 1.5,
                                            marginBottom: 18,
                                            padding: "10px 12px",
                                        }}
                                    >
                                        {paymentError}
                                    </div>
                                )}

                                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                                    <button
                                        type="button"
                                        onClick={() => handlePayNow("vnpay")}
                                        disabled={payingProvider !== null}
                                        style={{
                                            width: "100%",
                                            padding: "16px",
                                            border: "none",
                                            background: "#002366",
                                            color: "#fff",
                                            fontSize: 13,
                                            fontWeight: 700,
                                            cursor: payingProvider !== null ? "not-allowed" : "pointer",
                                            opacity: payingProvider !== null && payingProvider !== "vnpay" ? 0.5 : 1,
                                            borderRadius: 6,
                                        }}
                                    >
                                        {payingProvider === "vnpay" ? t("booking:modal.redirecting") : t("booking:modal.payVnpay")}
                                    </button>

                                    {paymentProviders.includes("momo") && (
                                        <button
                                            type="button"
                                            onClick={() => handlePayNow("momo")}
                                            disabled={payingProvider !== null}
                                            style={{
                                                width: "100%",
                                                padding: "16px",
                                                border: "none",
                                                background: "#a50064",
                                                color: "#fff",
                                                fontSize: 13,
                                                fontWeight: 700,
                                                cursor: payingProvider !== null ? "not-allowed" : "pointer",
                                                opacity: payingProvider !== null && payingProvider !== "momo" ? 0.5 : 1,
                                                borderRadius: 6,
                                            }}
                                        >
                                            {payingProvider === "momo" ? t("booking:modal.redirecting") : t("booking:modal.payMomo")}
                                        </button>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={handlePayLater}
                                    disabled={payingProvider !== null}
                                    style={{
                                        width: "100%",
                                        padding: "12px",
                                        border: "1px solid #d1d5db",
                                        background: "transparent",
                                        color: "#6b7280",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: payingProvider !== null ? "not-allowed" : "pointer",
                                        borderRadius: 6,
                                    }}
                                >
                                    {t("booking:modal.payLater")}
                                </button>
                            </div>
                        ) : (
                        <form
                            className="booking-modal-form"
                            onSubmit={handleBookRoom}
                            style={{
                                padding: 40,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                overflowY: "auto",
                                minHeight: 0,
                            }}
                        >
                            <button
                                type="button"
                                onClick={closeBookingModal}
                                style={{
                                    alignSelf: "flex-end",
                                    width: 36,
                                    height: 36,
                                    borderRadius: "50%",
                                    border: "1px solid #e5e7eb",
                                    background: "#fff",
                                    cursor: "pointer",
                                    fontSize: 18,
                                    marginBottom: 12,
                                }}
                            >
                                ×
                            </button>

                            <span
                                style={{
                                    color: "#C5A059",
                                    fontSize: 12,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.2em",
                                    fontWeight: 700,
                                    marginBottom: 8,
                                }}
                            >
                                {t("booking:modal.bookYourStay")}
                            </span>

                            <h2
                                className="font-headline"
                                style={{
                                    color: "#002366",
                                    fontSize: 34,
                                    margin: "0 0 12px",
                                }}
                            >
                                {t("booking:modal.reserveRoom")}
                            </h2>

                            <p
                                style={{
                                    color: "#6b7280",
                                    lineHeight: 1.7,
                                    fontSize: 14,
                                    marginBottom: 8,
                                }}
                            >
                                {selectedRoom.desc}
                            </p>

                            <button
                                type="button"
                                onClick={() => setShowReviews((v) => !v)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "#002366",
                                    textDecoration: "underline",
                                    cursor: "pointer",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    padding: 0,
                                    marginBottom: 16,
                                    alignSelf: "flex-start",
                                }}
                            >
                                {showReviews ? t("booking:modal.hideReviews") : t("booking:modal.viewReviews")}
                            </button>

                            {showReviews && (
                                <div
                                    style={{
                                        background: "#f8fafc",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: 12,
                                        padding: 16,
                                        marginBottom: 20,
                                        maxHeight: 260,
                                        overflowY: "auto",
                                    }}
                                >
                                    <RoomReviews roomId={selectedRoom.id} />
                                </div>
                            )}

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: 12,
                                    marginBottom: 24,
                                }}
                            >
                                <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                                    <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                        {t("booking:modal.pricePerNight")}
                                    </p>
                                    <strong style={{ color: "#002366", fontSize: 15 }}>
                                        {Number(selectedRoom.price).toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN")} VNĐ
                                    </strong>
                                </div>
                                <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                                    <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                        {t("booking:modal.maxGuests")}
                                    </p>
                                    <strong style={{ color: "#002366", fontSize: 15 }}>
                                        {selectedRoom.capacity} {t("booking:modal.guestsLabel")}
                                    </strong>
                                </div>
                            </div>

                            <div style={{ marginBottom: 18 }}>
                                <label style={bookingLabelStyle}>{t("booking:modal.checkIn")}</label>
                                <input
                                    type="date"
                                    min={todayStr}
                                    value={bookingForm.checkIn}
                                    onChange={(e) => {
                                        setBookingForm({
                                            ...bookingForm,
                                            checkIn: e.target.value,
                                        });
                                        // The applied discount was validated against the
                                        // old total — changing dates invalidates it.
                                        setCouponApplied(null);
                                        setCouponError("");
                                    }}
                                    style={bookingInputStyle}
                                />
                            </div>

                            <div style={{ marginBottom: 18 }}>
                                <label style={bookingLabelStyle}>{t("booking:modal.checkOut")}</label>
                                <input
                                    type="date"
                                    min={bookingForm.checkIn || todayStr}
                                    value={bookingForm.checkOut}
                                    onChange={(e) => {
                                        setBookingForm({
                                            ...bookingForm,
                                            checkOut: e.target.value,
                                        });
                                        setCouponApplied(null);
                                        setCouponError("");
                                    }}
                                    style={bookingInputStyle}
                                />
                            </div>

                            <div style={{ marginBottom: 18 }}>
                                <label style={bookingLabelStyle}>{t("booking:modal.guestsMax", { count: selectedRoom.capacity })}</label>
                                <input
                                    type="number"
                                    min="1"
                                    max={selectedRoom.capacity}
                                    value={bookingForm.guests}
                                    onChange={(e) =>
                                        setBookingForm({
                                            ...bookingForm,
                                            guests: e.target.value,
                                        })
                                    }
                                    style={bookingInputStyle}
                                />
                            </div>

                            <div style={{ marginBottom: 18 }}>
                                <label style={bookingLabelStyle}>{t("booking:modal.couponLabel")}</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        type="text"
                                        value={couponCode}
                                        onChange={(e) => {
                                            setCouponCode(e.target.value);
                                            setCouponApplied(null);
                                            setCouponError("");
                                        }}
                                        placeholder={t("booking:modal.couponPlaceholder")}
                                        disabled={couponChecking}
                                        style={{ ...bookingInputStyle, flex: 1 }}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleApplyCoupon}
                                        disabled={couponChecking || !couponCode.trim()}
                                        style={{
                                            padding: "0 20px",
                                            border: "1px solid #002366",
                                            borderRadius: 8,
                                            background: couponApplied ? "#002366" : "transparent",
                                            color: couponApplied ? "#fff" : "#002366",
                                            fontWeight: 700,
                                            fontSize: 13,
                                            cursor: couponChecking || !couponCode.trim() ? "not-allowed" : "pointer",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {couponChecking ? t("booking:modal.couponChecking") : couponApplied ? t("booking:modal.couponApplied") : t("booking:modal.couponApply")}
                                    </button>
                                </div>
                                {couponError && (
                                    <p style={{ color: "#dc2626", fontSize: 12, margin: "6px 0 0" }}>{couponError}</p>
                                )}
                            </div>

                            <div
                                style={{
                                    background: "#f8fafc",
                                    padding: 18,
                                    borderRadius: 12,
                                    marginBottom: 22,
                                    border: "1px solid #e5e7eb",
                                }}
                            >
                                <p
                                    style={{
                                        margin: "0 0 6px",
                                        color: "#64748b",
                                        fontSize: 13,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.12em",
                                    }}
                                >
                                    {t("booking:modal.estimatedTotal")}
                                </p>

                                {couponApplied ? (
                                    <>
                                        <p
                                            style={{
                                                margin: "0 0 4px",
                                                color: "#94a3b8",
                                                fontSize: 15,
                                                textDecoration: "line-through",
                                            }}
                                        >
                                            {calculateTotal().toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN")} VNĐ
                                        </p>
                                        <h2 style={{ margin: 0, color: "#C5A059", fontSize: 28 }}>
                                            {couponApplied.finalAmount.toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN")} VNĐ
                                        </h2>
                                        <p style={{ margin: "4px 0 0", color: "#059669", fontSize: 12, fontWeight: 700 }}>
                                            {t("booking:modal.discountAppliedWith", {
                                                amount: couponApplied.discountAmount.toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN"),
                                                code: couponApplied.coupon.code,
                                            })}
                                        </p>
                                    </>
                                ) : (
                                    <h2
                                        style={{
                                            margin: 0,
                                            color: "#C5A059",
                                            fontSize: 28,
                                        }}
                                    >
                                        {calculateTotal().toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN")} VNĐ
                                    </h2>
                                )}
                            </div>

                            {bookingError && (
                                <div
                                    style={{
                                        background: "#fef2f2",
                                        border: "1px solid #fecaca",
                                        borderRadius: 8,
                                        color: "#b91c1c",
                                        fontSize: 13,
                                        lineHeight: 1.5,
                                        marginBottom: 18,
                                        padding: "10px 12px",
                                    }}
                                >
                                    {bookingError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={bookingSubmitting}
                                style={{
                                    width: "100%",
                                    padding: "16px",
                                    border: "none",
                                    background: "#002366",
                                    color: "#fff",
                                    fontSize: 12,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.15em",
                                    fontWeight: 700,
                                    cursor: bookingSubmitting ? "not-allowed" : "pointer",
                                    opacity: bookingSubmitting ? 0.65 : 1,
                                    borderRadius: 6,
                                }}
                            >
                                {bookingSubmitting ? t("booking:modal.bookingInProgress") : t("booking:modal.confirmBooking")}
                            </button>
                        </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
const bookingLabelStyle = {
    display: "block",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    color: "#64748b",
    fontWeight: 700,
    marginBottom: 8,
};

const bookingInputStyle = {
    width: "100%",
    padding: "14px 16px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    outline: "none",
    fontSize: 14,
    boxSizing: "border-box",
};
export default Booking;
