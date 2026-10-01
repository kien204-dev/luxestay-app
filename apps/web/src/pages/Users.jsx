import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createUser,
  deleteUser,
  getUsers,
  setUserLock,
  updateUser,
} from "../services/userService";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { isStrongPassword } from "../utils/password";
import Icon from "../utils/icon";
import useIsMobile from "../utils/useIsMobile";
import ConfirmModal from "../components/ConfirmModal";

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
  "linear-gradient(135deg, #7dd3fc, #38bdf8)",
  "linear-gradient(135deg, #67e8b4, #22c55e)",
  "linear-gradient(135deg, #c4b5fd, #a78bfa)",
];

const PANEL_STYLE = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
};

const inputStyle = {
  width: "100%",
  marginBottom: 10,
  padding: "10px 12px",
  background: "var(--color-navy-950)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "var(--color-text-primary)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

function buildUserRow(u) {
  return {
    id: u.id,
    name: u.name ?? "Unknown",
    initials: (u.name ?? "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    avatarBg: AVATAR_GRADIENTS[u.id % AVATAR_GRADIENTS.length],
    roleValue: u.role ?? "user",
    role: {
      label: u.role ?? "user",
      bg: u.role === "admin" ? "rgba(248,113,113,0.15)" : "rgba(125,211,252,0.15)",
      color: u.role === "admin" ? "var(--color-danger)" : "var(--color-info)",
      border: u.role === "admin" ? "rgba(248,113,113,0.3)" : "rgba(125,211,252,0.3)",
    },
    contactLines: [u.email ?? "—", "—"],
    isLocked: Boolean(u.is_locked),
    status: u.is_locked
      ? { dot: "var(--color-danger)", label: "Locked", color: "var(--color-danger)" }
      : { dot: "var(--color-success)", label: "Active", color: "var(--color-success)" },
    joined: u.created_at
      ? new Date(u.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "—",
  };
}

export default function Users() {
  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const toast = useToast();
  const isMobile = useIsMobile();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");
  const [modalError, setModalError] = useState("");
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [lockingId, setLockingId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const getPageNumbers = (current, total) => {
    if (total <= 1) return [1];

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages = [1];

    if (current > 3) {
      pages.push("...");
    }

    for (
      let i = Math.max(2, current - 1);
      i <= Math.min(total - 1, current + 1);
      i++
    ) {
      pages.push(i);
    }

    if (current < total - 2) {
      pages.push("...");
    }

    pages.push(total);
    return pages;
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setPageError("");

      const data = await getUsers();
      const rows = data.map((u) => buildUserRow(u));

      setUsers(rows);
    } catch (err) {
      setPageError(err.response?.data?.message || "Không tải được danh sách user");
      if (err.response?.status === 401) {
        toast.error("Bạn chưa đăng nhập hoặc token đã hết hạn");
      } else if (err.response?.status === 403) {
        toast.error("Bạn không có quyền truy cập trang quản lý user");
      } else {
        toast.error(err.response?.data?.message || "Lỗi khi tải danh sách user");
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddUser = async () => {
    setModalError("");

    if (!form.name || !form.email || !isStrongPassword(form.password)) {
      setModalError("Name, email and a temporary password (8+ characters, letters and numbers) are required");
      return;
    }

    try {
      setSubmitting(true);

      const res = await createUser({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role || "user",
      });

      const newUser = buildUserRow(res.user);

      setUsers((prev) => [newUser, ...prev]);
      setShowModal(false);
      setForm({
        name: "",
        email: "",
        password: "",
        role: "user",
      });
      toast.success(`Đã thêm user "${newUser.name}"`);
    } catch (err) {
      const message = err.response?.data?.message || "Lỗi khi thêm user";
      setModalError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = async () => {
    setEditError("");

    if (!editUser?.name || !editUser?.email) {
      setEditError("Vui lòng nhập đầy đủ tên và email");
      return;
    }

    try {
      setSubmitting(true);

      const res = await updateUser(editUser.id, {
        name: editUser.name,
        email: editUser.email,
        role: editUser.roleValue || "user",
      });

      const updatedUser = buildUserRow(res.user);

      setUsers((prev) =>
        prev.map((item) => (item.id === editUser.id ? updatedUser : item))
      );

      setShowEditModal(false);
      setEditUser(null);
      toast.success(`Đã cập nhật user "${updatedUser.name}"`);
    } catch (err) {
      const message = err.response?.data?.message || "Lỗi khi cập nhật user";
      setEditError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const [pendingAction, setPendingAction] = useState(null);

  const requestDeleteUser = (user) => setPendingAction({ type: "delete", user });
  const requestToggleLock = (user) => setPendingAction({ type: "lock", user });

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    const { type, user } = pendingAction;

    if (type === "delete") {
      try {
        setDeletingId(user.id);
        setPageError("");
        await deleteUser(user.id);

        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        toast.success("Đã xóa user");
        setPendingAction(null);
      } catch (err) {
        const message = err.response?.data?.message || "Lỗi khi xóa user";
        setPageError(message);
        toast.error(message);
      } finally {
        setDeletingId(null);
      }
      return;
    }

    await handleToggleLock(user);
  };

  const handleToggleLock = async (user) => {
    const nextLocked = !user.isLocked;

    try {
      setLockingId(user.id);
      setPageError("");
      const res = await setUserLock(user.id, nextLocked);
      const updatedUser = buildUserRow(res.user);
      setUsers((prev) =>
        prev.map((item) => (item.id === user.id ? updatedUser : item))
      );
      toast.success(nextLocked ? `Đã khóa tài khoản "${user.name}"` : `Đã mở khóa tài khoản "${user.name}"`);
      setPendingAction(null);
    } catch (err) {
      const message = err.response?.data?.message || "Lỗi khi khóa/mở khóa user";
      setPageError(message);
      toast.error(message);
    } finally {
      setLockingId(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const keyword = search.toLowerCase();

    return (
      u.name.toLowerCase().includes(keyword) ||
      u.contactLines?.[0]?.toLowerCase().includes(keyword) ||
      u.roleValue?.toLowerCase().includes(keyword)
    );
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)
  );

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const kpiCards = useMemo(
    () => [
      {
        label: "TOTAL MEMBERS",
        value: users.length.toLocaleString(),
        sub: "Tổng số tài khoản",
        SubIcon: Icon.TrendUp,
        subColor: "var(--color-success)",
        MainIcon: Icon.Users,
        iconBg: "var(--color-gold-100)",
        iconColor: "var(--color-gold-400)",
      },
      {
        label: "ADMINS",
        value: users.filter((u) => u.roleValue === "admin").length,
        sub: "System managers",
        SubIcon: Icon.Shield,
        subColor: "var(--color-danger)",
        MainIcon: Icon.Shield,
        iconBg: "rgba(248,113,113,0.15)",
        iconColor: "var(--color-danger)",
      },
      {
        label: "USERS",
        value: users.filter((u) => u.roleValue === "user").length,
        sub: "Normal accounts",
        SubIcon: Icon.User,
        subColor: "var(--color-info)",
        MainIcon: Icon.User,
        iconBg: "rgba(125,211,252,0.15)",
        iconColor: "var(--color-info)",
      },
      {
        label: "LOCKED ACCOUNTS",
        value: users.filter((u) => u.isLocked).length,
        sub: "Sign-in blocked",
        SubIcon: Icon.Lock,
        subColor: "var(--color-danger)",
        MainIcon: Icon.Lock,
        iconBg: "rgba(248,113,113,0.15)",
        iconColor: "var(--color-danger)",
      },
    ],
    [users]
  );

  return (
    <div>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            User Management
          </h1>
          <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
            {formattedDate}
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={fetchUsers}
            disabled={loading}
            title="Làm mới"
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              border: "1px solid var(--color-border-soft)",
              background: "var(--color-navy-700)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: loading ? "not-allowed" : "pointer",
              color: "var(--color-text-secondary)",
            }}
          >
            <Icon.Refresh />
          </button>

          <button
            onClick={() => {
              setForm({
                name: "",
                email: "",
                password: "",
                role: "user",
              });
              setModalError("");
              setShowModal(true);
            }}
            style={{
              background: "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
              color: "var(--color-navy-950)",
              border: "none",
              borderRadius: 10,
              padding: "11px 20px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <Icon.UserPlus />
            Add New User
          </button>
        </div>
      </header>

      {pageError && (
        <div
          style={{
            background: "rgba(248,113,113,0.12)",
            border: "1px solid rgba(248,113,113,0.3)",
            borderRadius: 12,
            color: "var(--color-danger)",
            fontSize: 13,
            marginBottom: 18,
            padding: "12px 16px",
          }}
        >
          {pageError}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {kpiCards.map((card) => (
          <div
            key={card.label}
            style={{
              ...PANEL_STYLE,
              padding: "20px 22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              minWidth: 0,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--color-text-muted)",
                  margin: "0 0 8px",
                  textTransform: "uppercase",
                }}
              >
                {card.label}
              </p>

              {loading ? (
                <div className="luxe-skeleton" style={{ height: 28, width: 50, marginBottom: 10 }} />
              ) : (
                <h3
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    margin: "0 0 10px",
                    lineHeight: 1,
                  }}
                >
                  {card.value}
                </h3>
              )}

              <p
                style={{
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  margin: 0,
                  color: card.subColor,
                }}
              >
                <card.SubIcon />
                {card.sub}
              </p>
            </div>

            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: card.iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: card.iconColor,
              }}
            >
              <card.MainIcon />
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...PANEL_STYLE, overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border-soft)",
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ position: "relative", maxWidth: 420, width: "100%" }}>
            <span
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-text-muted)",
                display: "flex",
              }}
            >
              <Icon.Search />
            </span>

            <input
              style={{
                width: "100%",
                background: "var(--color-navy-700)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 10,
                padding: "10px 14px 10px 44px",
                color: "var(--color-text-primary)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
              placeholder="Search name, email or role..."
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              disabled
              title="Advanced filters are not available yet"
              style={{
                padding: "9px 18px",
                background: "var(--color-navy-700)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                cursor: "not-allowed",
                opacity: 0.55,
              }}
            >
              <Icon.Filter />
              Filter
            </button>

            <button
              type="button"
              disabled
              title="Export is not available yet"
              style={{
                padding: "9px 18px",
                background: "var(--color-navy-700)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                cursor: "not-allowed",
                opacity: 0.55,
              }}
            >
              <Icon.Download />
              Export
            </button>
          </div>
          <p style={{ width: "100%", margin: "2px 0 0", color: "var(--color-text-muted)", fontSize: 12 }}>
            Advanced filter and export are not available yet.
          </p>
        </div>

        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0" }}>
                  <div className="luxe-skeleton" style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0 }} />
                  <div className="luxe-skeleton" style={{ height: 14, width: "60%" }} />
                </div>
              ))
            ) : paginatedUsers.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--color-text-muted)", padding: "20px 0", margin: 0 }}>
                Không tìm thấy user nào.
              </p>
            ) : (
              paginatedUsers.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <div
                    key={user.id}
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
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: "50%",
                          background: user.avatarBg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--color-navy-950)",
                          fontWeight: 700,
                          fontSize: 13,
                          flexShrink: 0,
                        }}
                      >
                        {user.initials}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>
                          {user.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                          {user.contactLines?.[0] ?? "—"}
                        </div>
                      </div>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          background: user.role.bg,
                          color: user.role.color,
                          border: `1px solid ${user.role.border}`,
                          flexShrink: 0,
                        }}
                      >
                        {user.role.label}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-muted)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: user.status.dot, flexShrink: 0 }} />
                        <span style={{ color: user.status.color, fontWeight: 500 }}>{user.status.label}</span>
                      </div>
                      <span>Joined {user.joined}</span>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          setEditError("");
                          setEditUser({
                            id: user.id,
                            name: user.name,
                            email: user.contactLines?.[0] ?? "",
                            roleValue: user.roleValue ?? "user",
                            isSelf,
                          });
                          setShowEditModal(true);
                        }}
                        style={{ ...mobileActionButtonStyle, color: "var(--color-gold-400)" }}
                      >
                        <Icon.Edit /> Sửa
                      </button>

                      <button
                        onClick={() => requestToggleLock(user)}
                        disabled={isSelf || lockingId === user.id}
                        style={{
                          ...mobileActionButtonStyle,
                          color: user.isLocked ? "var(--color-warning)" : "var(--color-text-secondary)",
                          opacity: isSelf || lockingId === user.id ? 0.4 : 1,
                        }}
                      >
                        {user.isLocked ? <Icon.Unlock /> : <Icon.Lock />}
                        {user.isLocked ? "Mở khóa" : "Khóa"}
                      </button>

                      <button
                        onClick={() => requestDeleteUser(user)}
                        disabled={isSelf || deletingId === user.id}
                        style={{
                          ...mobileActionButtonStyle,
                          color: "var(--color-danger)",
                          opacity: isSelf || deletingId === user.id ? 0.4 : 1,
                        }}
                      >
                        <Icon.Trash /> Xóa
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 950, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Resident",
                  "Role",
                  "Contact Info",
                  "Status",
                  "Joined Date",
                  "Actions",
                ].map((col, i) => (
                  <th
                    key={col}
                    style={{
                      padding: "13px 20px",
                      textAlign: i === 5 ? "right" : "left",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--color-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      whiteSpace: "nowrap",
                      borderBottom: "1px solid var(--color-border-soft)",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td style={{ padding: "16px 20px" }} colSpan={6}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div className="luxe-skeleton" style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0 }} />
                        <div className="luxe-skeleton" style={{ height: 14, width: "18%" }} />
                        <div className="luxe-skeleton" style={{ height: 14, width: "10%" }} />
                        <div className="luxe-skeleton" style={{ height: 14, width: "18%" }} />
                        <div className="luxe-skeleton" style={{ height: 14, width: "10%" }} />
                      </div>
                    </td>
                  </tr>
                ))
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 30, textAlign: "center", color: "var(--color-text-muted)" }}>
                    Không tìm thấy user nào.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr key={user.id} style={tdRowStyle}>
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: "50%",
                            background: user.avatarBg,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--color-navy-950)",
                            fontWeight: 700,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {user.initials}
                        </div>

                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>
                            {user.name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                            ID: {user.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "16px 20px" }}>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          background: user.role.bg,
                          color: user.role.color,
                          border: `1px solid ${user.role.border}`,
                        }}
                      >
                        {user.role.label}
                      </span>
                    </td>

                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                        {user.contactLines?.[0] ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                        {user.contactLines?.[1] ?? "—"}
                      </div>
                    </td>

                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: user.status.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: user.status.color }}>
                          {user.status.label}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: "16px 20px", fontSize: 13, color: "var(--color-text-muted)" }}>
                      {user.joined}
                    </td>

                    <td style={{ padding: "16px 20px", textAlign: "right" }}>
                      {(() => {
                        const isSelf = user.id === currentUserId;
                        return (
                          <>
                            <button
                              onClick={() => {
                                setEditError("");
                                setEditUser({
                                  id: user.id,
                                  name: user.name,
                                  email: user.contactLines?.[0] ?? "",
                                  roleValue: user.roleValue ?? "user",
                                  isSelf,
                                });
                                setShowEditModal(true);
                              }}
                              style={{ ...actionButtonStyle, color: "var(--color-gold-400)", marginRight: 4 }}
                            >
                              <Icon.Edit />
                            </button>

                            <button
                              onClick={() => requestToggleLock(user)}
                              disabled={isSelf || lockingId === user.id}
                              title={
                                isSelf
                                  ? "Bạn không thể khóa chính tài khoản đang đăng nhập"
                                  : user.isLocked
                                    ? "Mở khóa tài khoản"
                                    : "Khóa tài khoản"
                              }
                              style={{
                                ...actionButtonStyle,
                                color: user.isLocked ? "var(--color-warning)" : "var(--color-text-secondary)",
                                cursor: isSelf || lockingId === user.id ? "not-allowed" : "pointer",
                                opacity: isSelf || lockingId === user.id ? 0.4 : 1,
                                marginRight: 4,
                              }}
                            >
                              {user.isLocked ? <Icon.Unlock /> : <Icon.Lock />}
                            </button>

                            <button
                              onClick={() => requestDeleteUser(user)}
                              disabled={isSelf || deletingId === user.id}
                              title={isSelf ? "Bạn không thể xóa chính tài khoản đang đăng nhập" : "Xóa user"}
                              style={{
                                ...actionButtonStyle,
                                color: "var(--color-danger)",
                                cursor: isSelf || deletingId === user.id ? "not-allowed" : "pointer",
                                opacity: isSelf || deletingId === user.id ? 0.4 : 1,
                              }}
                            >
                              <Icon.Trash />
                            </button>
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )}

        {!loading && (
          <div
            style={{
              padding: "16px 20px",
              borderTop: "1px solid var(--color-border-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
              Showing{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>
                {filteredUsers.length === 0
                  ? 0
                  : Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredUsers.length)}
              </strong>{" "}
              to{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}
              </strong>{" "}
              of{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>{filteredUsers.length}</strong> users
            </p>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                style={{ ...pageButtonStyle, opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
              >
                <Icon.ChevronLeft />
              </button>

              {getPageNumbers(currentPage, totalPages).map((n, i) =>
                n === "..." ? (
                  <span
                    key={`ellipsis-${i}`}
                    style={{
                      width: 34,
                      height: 34,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      color: "var(--color-text-muted)",
                      userSelect: "none",
                    }}
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setCurrentPage(n)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      border: "none",
                      background: n === currentPage ? "var(--color-gold-500)" : "transparent",
                      color: n === currentPage ? "var(--color-navy-950)" : "var(--color-text-muted)",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {n}
                  </button>
                )
              )}

              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                style={{ ...pageButtonStyle, opacity: currentPage === totalPages ? 0.4 : 1, cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}
              >
                <Icon.ChevronRight />
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div
          onClick={() => !submitting && setShowModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-navy-700)",
              border: "1px solid var(--color-border-soft)",
              padding: 24,
              borderRadius: 16,
              width: 340,
              maxWidth: "100%",
              boxShadow: "var(--shadow-card-hover)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}>
              Add User
            </h3>

            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inputStyle}
            />

            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={inputStyle}
            />

            <input
              type="password"
              autoComplete="new-password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              style={inputStyle}
            />

            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              style={{ ...inputStyle, marginBottom: 16 }}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>

            {modalError && (
              <div style={errorBoxStyle}>{modalError}</div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleAddUser} disabled={submitting} style={primaryButtonStyle}>
                {submitting ? "Saving..." : "Save"}
              </button>

              <button onClick={() => setShowModal(false)} disabled={submitting} style={secondaryButtonStyle}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editUser && (
        <div
          onClick={() => !submitting && setShowEditModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-navy-700)",
              border: "1px solid var(--color-border-soft)",
              padding: 24,
              borderRadius: 16,
              width: 340,
              maxWidth: "100%",
              boxShadow: "var(--shadow-card-hover)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}>
              Edit User
            </h3>

            <input
              placeholder="Name"
              value={editUser.name}
              onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
              style={inputStyle}
            />

            <input
              placeholder="Email"
              value={editUser.email}
              onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
              style={inputStyle}
            />

            <select
              value={editUser.roleValue}
              onChange={(e) => setEditUser({ ...editUser, roleValue: e.target.value })}
              disabled={editUser.isSelf}
              title={editUser.isSelf ? "Bạn không thể tự hạ quyền chính tài khoản đang đăng nhập" : undefined}
              style={{
                ...inputStyle,
                marginBottom: editUser.isSelf ? 6 : 16,
                opacity: editUser.isSelf ? 0.6 : 1,
                cursor: editUser.isSelf ? "not-allowed" : "pointer",
              }}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            {editUser.isSelf && (
              <p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: "0 0 16px" }}>
                Không thể tự đổi vai trò của chính mình.
              </p>
            )}

            {editError && <div style={errorBoxStyle}>{editError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleEditUser} disabled={submitting} style={primaryButtonStyle}>
                {submitting ? "Saving..." : "Save"}
              </button>

              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditUser(null);
                }}
                disabled={submitting}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingAction)}
        title={
          pendingAction?.type === "delete"
            ? "Xóa user"
            : pendingAction?.user?.isLocked
              ? "Mở khóa tài khoản"
              : "Khóa tài khoản"
        }
        message={
          pendingAction?.type === "delete"
            ? `Bạn có chắc muốn xóa user "${pendingAction?.user?.name}"? Hành động này không thể hoàn tác.`
            : pendingAction?.user?.isLocked
              ? `Mở khóa tài khoản "${pendingAction?.user?.name}"?`
              : `Khóa tài khoản "${pendingAction?.user?.name}"? Người dùng sẽ không thể đăng nhập và phiên hiện tại sẽ bị hủy.`
        }
        confirmLabel={
          pendingAction?.type === "delete"
            ? "Xóa user"
            : pendingAction?.user?.isLocked
              ? "Mở khóa"
              : "Khóa tài khoản"
        }
        tone={pendingAction?.type === "delete" ? "danger" : "warning"}
        loading={
          pendingAction?.type === "delete"
            ? deletingId === pendingAction?.user?.id
            : lockingId === pendingAction?.user?.id
        }
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

const tdRowStyle = {
  borderTop: "1px solid var(--color-border-soft)",
};

const actionButtonStyle = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 4,
  borderRadius: 6,
  display: "inline-flex",
};

const mobileActionButtonStyle = {
  flex: 1,
  background: "var(--color-navy-700)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

const pageButtonStyle = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid var(--color-border-soft)",
  background: "transparent",
  color: "var(--color-text-muted)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const errorBoxStyle = {
  background: "rgba(248,113,113,0.12)",
  border: "1px solid rgba(248,113,113,0.3)",
  borderRadius: 8,
  color: "var(--color-danger)",
  fontSize: 12,
  marginBottom: 12,
  padding: "8px 10px",
};

const primaryButtonStyle = {
  flex: 1,
  padding: 10,
  background: "var(--color-gold-500)",
  color: "var(--color-navy-950)",
  border: "none",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  flex: 1,
  padding: 10,
  background: "transparent",
  color: "var(--color-text-secondary)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: 8,
  cursor: "pointer",
};
