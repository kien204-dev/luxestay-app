
import { useMemo, useState } from "react";
import { useAsyncData } from "../utils/useAsyncData";
import { useSearchParams } from "react-router-dom";
import {
  getRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  uploadRoomImage,
  addRoomImage,
  deleteRoomImage,
} from "../services/roomService";
import { normalizeImageUrl, useFallbackImage } from "../utils/imageUrl";
import { useToast } from "../context/ToastContext";
import Icon from "../utils/icon";
import useIsMobile from "../utils/useIsMobile";
import ConfirmModal from "../components/ConfirmModal";

const STATUS_OPTIONS = ["available", "booked", "maintenance"];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const statusStyle = {
  available: { color: "#67e8b4", bg: "rgba(103,232,180,0.12)" },
  booked: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  maintenance: { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

const PANEL_STYLE = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
};

const emptyForm = {
  room_name: "",
  room_type: "",
  price: "",
  capacity: 2,
  description: "",
  image: "",
  status: "available",
};

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("vi-VN") + " đ";
}

export default function Rooms() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  // Error from an action on the page (deleting a room), shown in the same
  // place as a failed load.
  const [actionError, setActionError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [roomToDelete, setRoomToDelete] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [uploadingGalleryImage, setUploadingGalleryImage] = useState(false);
  const [galleryError, setGalleryError] = useState("");

  const queryParams = useMemo(() => {
    const params = {};

    [
      "q",
      "status",
      "minPrice",
      "maxPrice",
      "minCapacity",
      "maxCapacity",
      "sortBy",
      "sortOrder",
      "page",
      "limit",
    ].forEach((key) => {
      const value = searchParams.get(key);
      if (value) params[key] = value;
    });

    params.page = params.page || "1";
    params.limit = params.limit || "10";
    params.sortBy = params.sortBy || "created_at";
    params.sortOrder = params.sortOrder || "desc";

    return params;
  }, [searchParams]);

  const updateQuery = (updates, resetPage = true) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    if (resetPage) next.set("page", "1");

    setSearchParams(next);
  };

  const roomsQuery = useAsyncData(`rooms:${JSON.stringify(queryParams)}`, () => getRooms(queryParams));
  const result = roomsQuery.data;
  const rooms = Array.isArray(result) ? result : result?.data || [];
  const pagination = (!Array.isArray(result) && result?.pagination) || {
    page: 1,
    limit: rooms.length || 10,
    total: rooms.length,
    totalPages: 1,
  };
  const loading = roomsQuery.loading;
  const error =
    actionError ||
    (roomsQuery.error ? roomsQuery.error.response?.data?.message || "Không tải được danh sách phòng" : "");
  const loadRooms = roomsQuery.reload;

  const openCreateModal = () => {
    setEditingRoom(null);
    setForm(emptyForm);
    setFormError("");
    setGalleryImages([]);
    setGalleryError("");
    setShowModal(true);
  };

  const openEditModal = async (room) => {
    setEditingRoom(room);
    setForm({
      room_name: room.room_name || "",
      room_type: room.room_type || "",
      price: room.price ?? "",
      capacity: room.capacity ?? 2,
      description: room.description || "",
      image: room.image || "",
      status: room.status || "available",
    });
    setFormError("");
    setGalleryError("");
    setGalleryImages([]);
    setShowModal(true);

    try {
      const fullRoom = await getRoomById(room.id);
      setGalleryImages(fullRoom.images || []);
    } catch {
      setGalleryError("Không tải được ảnh phụ của phòng");
    }
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setFormError("");

    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFormError("Only jpg, png, and webp images are allowed");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setFormError("Image size must be 2MB or smaller");
      return;
    }

    try {
      setUploadingImage(true);
      const result = await uploadRoomImage(file);
      setForm((prev) => ({ ...prev, image: result.image || "" }));
    } catch (err) {
      setFormError(err.response?.data?.message || "Image upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGalleryFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setGalleryError("");

    if (!file || !editingRoom) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setGalleryError("Only jpg, png, and webp images are allowed");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setGalleryError("Image size must be 2MB or smaller");
      return;
    }

    try {
      setUploadingGalleryImage(true);
      const result = await addRoomImage(editingRoom.id, file);
      setGalleryImages((prev) => [...prev, result.image]);
    } catch (err) {
      setGalleryError(err.response?.data?.message || "Image upload failed");
    } finally {
      setUploadingGalleryImage(false);
    }
  };

  const handleDeleteGalleryImage = async (imageId) => {
    if (!editingRoom) return;
    setGalleryError("");

    try {
      await deleteRoomImage(editingRoom.id, imageId);
      setGalleryImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (err) {
      setGalleryError(err.response?.data?.message || "Xóa ảnh thất bại");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!form.room_name.trim() || !form.room_type.trim()) {
      setFormError("Vui lòng nhập tên phòng và loại phòng");
      return;
    }

    const parsedPrice = Number(form.price);
    const parsedCapacity = Number(form.capacity);

    if (form.price === "" || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setFormError("Giá phòng phải lớn hơn 0");
      return;
    }

    if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
      setFormError("Sức chứa phải là số nguyên lớn hơn 0");
      return;
    }

    const payload = {
      ...form,
      price: parsedPrice,
      capacity: parsedCapacity,
    };

    try {
      setSaving(true);

      if (editingRoom) {
        await updateRoom(editingRoom.id, payload);
        toast.success(`Đã cập nhật phòng "${form.room_name}"`);
      } else {
        await createRoom(payload);
        toast.success(`Đã thêm phòng "${form.room_name}"`);
      }

      setShowModal(false);
      await loadRooms();
    } catch (err) {
      const message =
        err.response?.data?.message || "Lưu phòng thất bại, vui lòng thử lại";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (room) => setRoomToDelete(room);

  const confirmDelete = async () => {
    const room = roomToDelete;
    if (!room) return;

    setDeletingId(room.id);
    setActionError("");
    try {
      await deleteRoom(room.id);
      toast.success(`Đã xóa phòng "${room.room_name}"`);
      setRoomToDelete(null);
      await loadRooms();
    } catch (err) {
      const message = err.response?.data?.message || "Xóa phòng thất bại";
      setActionError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <header
        style={{
          marginBottom: 28,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--color-text-primary)" }}>
            Rooms
          </h1>
          <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
            Quản lý danh sách phòng, giá và trạng thái.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", width: "min(100%, 900px)" }}>
          <input
            type="text"
            placeholder="Tìm theo tên hoặc loại phòng..."
            value={queryParams.q || ""}
            onChange={(e) => updateQuery({ q: e.target.value })}
            style={{
              background: "var(--color-navy-700)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              padding: "10px 14px",
              color: "var(--color-text-primary)",
              fontSize: 14,
              minWidth: 0,
              flex: "1 1 220px",
            }}
          />

          <select
            value={queryParams.status || ""}
            onChange={(e) => updateQuery({ status: e.target.value })}
            style={{ ...filterInputStyle, flex: "1 1 150px" }}
          >
            <option value="">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="0"
            placeholder="Giá từ"
            value={queryParams.minPrice || ""}
            onChange={(e) => updateQuery({ minPrice: e.target.value })}
            style={{ ...filterInputStyle, flex: "1 1 110px" }}
          />

          <input
            type="number"
            min="0"
            placeholder="Giá đến"
            value={queryParams.maxPrice || ""}
            onChange={(e) => updateQuery({ maxPrice: e.target.value })}
            style={{ ...filterInputStyle, flex: "1 1 110px" }}
          />

          <input
            type="number"
            min="1"
            placeholder="Khách từ"
            value={queryParams.minCapacity || ""}
            onChange={(e) => updateQuery({ minCapacity: e.target.value })}
            style={{ ...filterInputStyle, flex: "1 1 110px" }}
          />

          <input
            type="number"
            min="1"
            placeholder="Khách đến"
            value={queryParams.maxCapacity || ""}
            onChange={(e) => updateQuery({ maxCapacity: e.target.value })}
            style={{ ...filterInputStyle, flex: "1 1 110px" }}
          />

          <select
            value={queryParams.sortBy || "created_at"}
            onChange={(e) => updateQuery({ sortBy: e.target.value })}
            style={{ ...filterInputStyle, flex: "1 1 130px" }}
          >
            <option value="created_at">Mới nhất</option>
            <option value="name">Tên phòng</option>
            <option value="price">Giá</option>
          </select>

          <select
            value={queryParams.sortOrder || "desc"}
            onChange={(e) => updateQuery({ sortOrder: e.target.value })}
            style={{ ...filterInputStyle, flex: "1 1 120px" }}
          >
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </select>

          <select
            value={queryParams.limit || "10"}
            onChange={(e) => updateQuery({ limit: e.target.value })}
            style={{ ...filterInputStyle, flex: "1 1 90px" }}
          >
            <option value="5">5 / trang</option>
            <option value="10">10 / trang</option>
            <option value="20">20 / trang</option>
            <option value="50">50 / trang</option>
          </select>

          <button
            onClick={openCreateModal}
            style={{
              background: "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
              color: "var(--color-navy-950)",
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            + Thêm phòng
          </button>
        </div>
      </header>

      <div
        style={{
          ...PANEL_STYLE,
          overflow: "hidden",
        }}
      >
        {error && (
          <div style={{ padding: "16px 22px", color: "#f87171", fontSize: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 22 }} aria-busy="true" aria-label="Loading rooms">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0" }}>
                <div className="luxe-skeleton" style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0 }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "20%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "12%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "12%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "10%" }} />
              </div>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div style={{ padding: "56px 22px", textAlign: "center" }}>
            <span style={{ color: "var(--color-border)", display: "flex", justifyContent: "center" }}>
              <Icon.Hotel />
            </span>
            <p style={{ color: "var(--color-text-secondary)", margin: "12px 0 20px" }}>
              Chưa có phòng nào phù hợp với bộ lọc hiện tại.
            </p>
            <button
              onClick={openCreateModal}
              style={{
                background: "var(--color-gold-100)",
                color: "var(--color-gold-400)",
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                padding: "10px 18px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + Thêm phòng đầu tiên
            </button>
          </div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
            {rooms.map((room) => {
              const style = statusStyle[room.status] || statusStyle.available;
              return (
                <div
                  key={room.id}
                  style={{
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: "var(--radius-md)",
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <img
                      src={normalizeImageUrl(room.image)}
                      alt={room.room_name}
                      onError={useFallbackImage}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 10,
                        objectFit: "cover",
                        background: "var(--color-gold-100)",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{room.room_name}</div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                        #{room.id} · {room.room_type}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "5px 10px",
                        borderRadius: 20,
                        color: style.color,
                        background: style.bg,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "capitalize",
                        flexShrink: 0,
                      }}
                    >
                      {room.status}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-secondary)" }}>
                    <span>{formatMoney(room.price)} / đêm</span>
                    <span>{room.capacity} khách</span>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => openEditModal(room)}
                      style={{
                        flex: 1,
                        background: "var(--color-gold-100)",
                        color: "var(--color-gold-500)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => requestDelete(room)}
                      disabled={deletingId === room.id}
                      style={{
                        flex: 1,
                        background: "rgba(248,113,113,0.12)",
                        color: "var(--color-danger)",
                        border: "1px solid rgba(248,113,113,0.3)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: deletingId === room.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {deletingId === room.id ? "..." : "Xóa"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "Phòng",
                    "Loại",
                    "Giá / đêm",
                    "Sức chứa",
                    "Trạng thái",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "14px 18px",
                        textAlign: "left",
                        color: "var(--color-text-muted)",
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid var(--color-border-soft)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rooms.map((room) => {
                  const style = statusStyle[room.status] || statusStyle.available;
                  return (
                    <tr key={room.id}>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <img
                            src={normalizeImageUrl(room.image)}
                            alt={room.room_name}
                            onError={useFallbackImage}
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: 10,
                              objectFit: "cover",
                              background: "var(--color-gold-100)",
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 600 }}>{room.room_name}</div>
                            <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                              #{room.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}>{room.room_type}</td>
                      <td style={tdStyle}>{formatMoney(room.price)}</td>
                      <td style={tdStyle}>{room.capacity} khách</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: "5px 12px",
                            borderRadius: 20,
                            color: style.color,
                            background: style.bg,
                            fontSize: 12,
                            fontWeight: 700,
                            textTransform: "capitalize",
                          }}
                        >
                          {room.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => openEditModal(room)}
                            style={{
                              background: "var(--color-gold-100)",
                              color: "var(--color-gold-500)",
                              border: "1px solid var(--color-border)",
                              borderRadius: 8,
                              padding: "6px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => requestDelete(room)}
                            disabled={deletingId === room.id}
                            style={{
                              background: "rgba(248,113,113,0.12)",
                              color: "#f87171",
                              border: "1px solid rgba(248,113,113,0.3)",
                              borderRadius: 8,
                              padding: "6px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor:
                                deletingId === room.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {deletingId === room.id ? "..." : "Xóa"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pagination.total > 0 && (
          <div
            style={{
              padding: "14px 18px",
              borderTop: "1px solid var(--color-border-soft)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              color: "var(--color-text-secondary)",
              fontSize: 13,
            }}
          >
            <span>
              Trang {pagination.page} / {pagination.totalPages} - {pagination.total} phòng
            </span>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                disabled={pagination.page <= 1}
                onClick={() => updateQuery({ page: String(pagination.page - 1) }, false)}
                style={paginationButtonStyle}
              >
                Trước
              </button>

              {Array.from({ length: pagination.totalPages }, (_, index) => index + 1)
                .filter(
                  (pageNumber) =>
                    pageNumber === 1 ||
                    pageNumber === pagination.totalPages ||
                    Math.abs(pageNumber - pagination.page) <= 1
                )
                .map((pageNumber, index, pages) => {
                  const previous = pages[index - 1];
                  const showGap = previous && pageNumber - previous > 1;

                  return (
                    <span key={pageNumber} style={{ display: "inline-flex", gap: 8 }}>
                      {showGap && <span style={{ padding: "7px 2px" }}>...</span>}
                      <button
                        onClick={() => updateQuery({ page: String(pageNumber) }, false)}
                        style={{
                          ...paginationButtonStyle,
                          background:
                            pageNumber === pagination.page
                              ? "var(--color-gold-500)"
                              : "var(--color-gold-100)",
                          color: pageNumber === pagination.page ? "var(--color-navy-950)" : "var(--color-gold-500)",
                        }}
                      >
                        {pageNumber}
                      </button>
                    </span>
                  );
                })}

              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => updateQuery({ page: String(pagination.page + 1) }, false)}
                style={paginationButtonStyle}
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-navy-700)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h2 style={{ margin: "0 0 20px", fontFamily: "var(--font-serif)", color: "var(--color-text-primary)", fontSize: 20, fontWeight: 700 }}>
              {editingRoom ? "Sửa phòng" : "Thêm phòng mới"}
            </h2>

            <form onSubmit={handleSubmit}>
              <Field label="Tên phòng">
                <input
                  name="room_name"
                  value={form.room_name}
                  onChange={handleChange}
                  style={inputStyle}
                  placeholder="Deluxe Suite 401"
                />
              </Field>

              <Field label="Loại phòng">
                <input
                  name="room_type"
                  value={form.room_type}
                  onChange={handleChange}
                  style={inputStyle}
                  placeholder="Deluxe / Standard / Suite..."
                />
              </Field>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Giá / đêm (VNĐ)">
                    <input
                      type="number"
                      min="1"
                      name="price"
                      value={form.price}
                      onChange={handleChange}
                      style={inputStyle}
                      placeholder="1500000"
                    />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Sức chứa (khách)">
                    <input
                      type="number"
                      min="1"
                      name="capacity"
                      value={form.capacity}
                      onChange={handleChange}
                      style={inputStyle}
                    />
                  </Field>
                </div>
              </div>

              <Field label="Ảnh (URL)">
                <input
                  name="image"
                  value={form.image}
                  onChange={handleChange}
                  style={inputStyle}
                  placeholder="https://..."
                />
              </Field>

              <Field label="Upload ảnh phòng">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageFileChange}
                  disabled={uploadingImage || saving}
                  style={inputStyle}
                />
                {uploadingImage && (
                  <p style={{ color: "var(--color-text-secondary)", fontSize: 12, margin: "6px 0 0" }}>
                    Đang upload ảnh...
                  </p>
                )}
                {form.image && (
                  <img
                    src={normalizeImageUrl(form.image)}
                    alt="Room preview"
                    onError={useFallbackImage}
                    style={{
                      width: "100%",
                      height: 160,
                      marginTop: 10,
                      borderRadius: 10,
                      objectFit: "cover",
                      background: "var(--color-gold-100)",
                    }}
                  />
                )}
              </Field>

              <Field label="Ảnh phụ (gallery)">
                {editingRoom ? (
                  <>
                    {galleryImages.length > 0 && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: 8,
                          marginBottom: 10,
                        }}
                      >
                        {galleryImages.map((img) => (
                          <div key={img.id} style={{ position: "relative" }}>
                            <img
                              src={normalizeImageUrl(img.image_path)}
                              alt="Gallery"
                              onError={useFallbackImage}
                              style={{
                                width: "100%",
                                height: 70,
                                borderRadius: 8,
                                objectFit: "cover",
                                background: "var(--color-gold-100)",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteGalleryImage(img.id)}
                              title="Xóa ảnh này"
                              style={{
                                position: "absolute",
                                top: 4,
                                right: 4,
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                border: "none",
                                background: "rgba(15,17,23,0.75)",
                                color: "#f87171",
                                cursor: "pointer",
                                fontSize: 13,
                                lineHeight: 1,
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleGalleryFileChange}
                      disabled={uploadingGalleryImage || saving}
                      style={inputStyle}
                    />
                    {uploadingGalleryImage && (
                      <p style={{ color: "var(--color-text-secondary)", fontSize: 12, margin: "6px 0 0" }}>
                        Đang upload ảnh...
                      </p>
                    )}
                    {galleryError && (
                      <p style={{ color: "#f87171", fontSize: 12, margin: "6px 0 0" }}>
                        {galleryError}
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ color: "var(--color-text-muted)", fontSize: 12, margin: 0 }}>
                    Lưu phòng trước, sau đó mở lại để thêm ảnh phụ.
                  </p>
                )}
              </Field>

              <Field label="Mô tả">
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </Field>

              <Field label="Trạng thái">
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              {formError && (
                <p style={{ color: "#f87171", fontSize: 13, marginTop: 4 }}>
                  {formError}
                </p>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving || uploadingImage}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    border: "1px solid var(--color-border-soft)",
                    background: "transparent",
                    color: "var(--color-text-secondary)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--color-gold-500)",
                    color: "var(--color-navy-950)",
                    fontWeight: 700,
                    cursor: saving || uploadingImage ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "Đang lưu..." : "Lưu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(roomToDelete)}
        title="Xóa phòng"
        message={`Bạn có chắc muốn xóa phòng "${roomToDelete?.room_name}"? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa phòng"
        tone="danger"
        loading={deletingId === roomToDelete?.id}
        onConfirm={confirmDelete}
        onCancel={() => setRoomToDelete(null)}
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "var(--color-text-secondary)", fontSize: 13, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const tdStyle = {
  padding: "16px 18px",
  borderBottom: "1px solid var(--color-border-soft)",
  color: "var(--color-text-primary)",
  fontSize: 14,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--color-navy-950)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "var(--color-text-primary)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const filterInputStyle = {
  background: "var(--color-navy-700)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: 10,
  padding: "10px 12px",
  color: "var(--color-text-primary)",
  fontSize: 14,
  minWidth: 0,
  boxSizing: "border-box",
};

const paginationButtonStyle = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-gold-100)",
  color: "var(--color-gold-500)",
  cursor: "pointer",
  fontWeight: 700,
};
