const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { io: ioClient } = require("socket.io-client");

process.env.JWT_SECRET = "test-secret";
process.env.NODE_ENV = "test";
process.env.AUTH_COOKIE_SECURE = "false";
process.env.AUTH_COOKIE_SAME_SITE = "lax";
process.env.VNPAY_TMN_CODE = "TESTTMN01";
process.env.VNPAY_HASH_SECRET = "test-vnpay-hash-secret";
process.env.VNPAY_RETURN_URL = "http://localhost:5173/payment/result";
process.env.MOMO_ENABLED = "true";
process.env.MOMO_PARTNER_CODE = "TESTMOMO01";
process.env.MOMO_ACCESS_KEY = "test-momo-access-key";
process.env.MOMO_SECRET_KEY = "test-momo-secret-key";
process.env.MOMO_RETURN_URL = "http://localhost:5173/payment/result";
process.env.MOMO_IPN_URL = "http://localhost:3001/api/payments/momo/ipn";
process.env.MOMO_API_URL = "http://fake-momo-api.test/v2/gateway/api/create";

function makeState() {
  return {
    nextUserId: 3,
    nextRoomId: 3,
    nextBookingId: 3,
    nextResetTokenId: 1,
    nextRoomImageId: 1,
    nextPaymentId: 1,
    nextReviewId: 1,
    nextCouponId: 1,
    passwordResetTokens: [],
    sentPasswordResetEmails: [],
    roomImages: [],
    payments: [],
    reviews: [],
    coupons: [],
    users: [
      {
        id: 1,
        name: "Admin User",
        email: "admin@example.com",
        password: bcrypt.hashSync("admin123", 10),
        role: "admin",
        token_version: 0,
        must_change_password: false,
        deleted_at: null,
        is_locked: false,
        phone: "0900000001",
        bio: "System administrator",
        avatar_url: "https://example.com/admin.png",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        name: "Normal User",
        email: "user@example.com",
        password: bcrypt.hashSync("user123", 10),
        role: "user",
        token_version: 0,
        must_change_password: false,
        deleted_at: null,
        is_locked: false,
        phone: null,
        bio: null,
        avatar_url: null,
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ],
    rooms: [
      {
        id: 1,
        room_name: "Deluxe Room",
        room_type: "Deluxe",
        price: 100,
        description: "City view",
        capacity: 2,
        image: "room.jpg",
        status: "available",
        location: "Hoàn Kiếm, Hà Nội",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        room_name: "Suite Room",
        room_type: "Suite",
        price: 200,
        description: "Ocean view",
        capacity: 4,
        image: "suite.jpg",
        status: "booked",
        location: "Mỹ Khê, Đà Nẵng",
        created_at: "2026-01-02T00:00:00.000Z",
      },
    ],
    bookings: [
      {
        id: 1,
        user_id: 2,
        room_id: 2,
        check_in: "2099-01-10",
        check_out: "2099-01-12",
        total_price: 400,
        guests: 2,
        status: "confirmed",
        payment_status: "unpaid",
        created_at: "2026-01-05T00:00:00.000Z",
      },
      {
        id: 2,
        user_id: 1,
        room_id: 1,
        check_in: "2099-02-10",
        check_out: "2099-02-11",
        total_price: 100,
        guests: 1,
        status: "pending",
        payment_status: "unpaid",
        created_at: "2026-01-06T00:00:00.000Z",
      },
    ],
  };
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function publicUser(user) {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

function joinBooking(state, booking) {
  const user = state.users.find((item) => item.id === booking.user_id);
  const room = state.rooms.find((item) => item.id === booking.room_id);
  const coupon = state.coupons.find((item) => item.id === booking.coupon_id);

  return {
    ...booking,
    user_name: user?.name,
    user_email: user?.email,
    room_name: room?.room_name,
    room_type: room?.room_type,
    room_capacity: room?.capacity,
    room_price: room?.price,
    room_image: room?.image,
    coupon_code: coupon?.code ?? null,
    has_review: state.reviews.some((r) => r.booking_id === booking.id),
  };
}

function filterBookings(state, text, params) {
  let idx = 0;
  let rows = state.bookings.map((item) => joinBooking(state, item));

  if (text.includes("b.user_id = $")) {
    const userId = Number(params[idx++]);
    rows = rows.filter((item) => item.user_id === userId);
  }

  if (text.includes("b.status = $")) {
    const status = params[idx++];
    rows = rows.filter((item) => item.status === status);
  }

  if (text.includes("b.check_in >= $")) {
    const from = params[idx++];
    rows = rows.filter((item) => item.check_in >= from);
  }

  if (text.includes("b.check_out <= $")) {
    const to = params[idx++];
    rows = rows.filter((item) => item.check_out <= to);
  }

  return { rows: rows.sort((a, b) => b.id - a.id), consumed: idx };
}

function filterRoomsForQuery(state, text, params) {
  let idx = 0;
  let rows = state.rooms.slice();

  if (text.includes("room_name ilike") || text.includes("room_type ilike")) {
    const needle = String(params[idx++]).replace(/%/g, "").toLowerCase();
    rows = rows.filter(
      (r) =>
        r.room_name.toLowerCase().includes(needle) ||
        r.room_type.toLowerCase().includes(needle)
    );
  }

  if (text.includes("status = $")) {
    const status = params[idx++];
    rows = rows.filter((r) => r.status === status);
  }

  if (text.includes("location ilike")) {
    const needle = String(params[idx++]).replace(/%/g, "").toLowerCase();
    rows = rows.filter((r) => (r.location || "").toLowerCase().includes(needle));
  }

  if (text.includes("price >= $")) {
    const min = Number(params[idx++]);
    rows = rows.filter((r) => Number(r.price) >= min);
  }

  if (text.includes("price <= $")) {
    const max = Number(params[idx++]);
    rows = rows.filter((r) => Number(r.price) <= max);
  }

  if (text.includes("capacity >= $")) {
    const min = Number(params[idx++]);
    rows = rows.filter((r) => Number(r.capacity) >= min);
  }

  if (text.includes("capacity <= $")) {
    const max = Number(params[idx++]);
    rows = rows.filter((r) => Number(r.capacity) <= max);
  }

  if (text.includes("id not in")) {
    const activeStatuses = params[idx++];
    const checkOut = params[idx++];
    const checkIn = params[idx++];
    const bookedRoomIds = new Set(
      state.bookings
        .filter(
          (b) =>
            activeStatuses.includes(b.status) &&
            b.check_in < checkOut &&
            b.check_out > checkIn
        )
        .map((b) => b.room_id)
    );
    rows = rows.filter((r) => !bookedRoomIds.has(r.id));
  }

  return { rows, consumed: idx };
}

function hasOverlap(booking, roomId, checkIn, checkOut, activeStatuses) {
  return (
    booking.room_id === roomId &&
    activeStatuses.includes(booking.status) &&
    booking.check_in < checkOut &&
    booking.check_out > checkIn
  );
}

function makeFakePool(state) {
  async function query(sql, params = []) {
    const text = normalizeSql(sql);

    if (text === "begin" || text === "commit" || text === "rollback") {
      return { rows: [] };
    }

    if (text.startsWith("select 1 from users where avatar_url = $1 and id != $2")) {
      const inUse = state.users.some(
        (user) => user.avatar_url === params[0] && user.id !== params[1]
      );
      return { rows: inUse ? [{}] : [] };
    }

    if (
      text.includes("from users") &&
      (text.includes("where email=$1") || text.includes("where lower(email)=lower($1)"))
    ) {
      const user = state.users.find(
        (item) => item.email.toLowerCase() === String(params[0]).toLowerCase() &&
          (!text.includes("deleted_at is null") || !item.deleted_at)
      );
      return { rows: user ? [text.includes("password") ? user : publicUser(user)] : [] };
    }

    if (text.includes("select id from users where lower(email)=lower($1)")) {
      const user = state.users.find(
        (item) => item.email.toLowerCase() === String(params[0]).toLowerCase()
      );
      return { rows: user ? [{ id: user.id }] : [] };
    }

    if (text.includes("select id from users where email = $1 and id != $2")) {
      const user = state.users.find(
        (item) => item.email === params[0] && item.id !== Number(params[1])
      );
      return { rows: user ? [{ id: user.id }] : [] };
    }

    if (text.includes("select id from users where email = $1")) {
      const user = state.users.find((item) => item.email === params[0]);
      return { rows: user ? [{ id: user.id }] : [] };
    }

    if (text.includes("from users") && text.includes("order by id asc")) {
      return {
        rows: state.users
          .filter((item) => !item.deleted_at)
          .slice()
          .sort((a, b) => a.id - b.id)
          .map(publicUser),
      };
    }

    if (text.includes("select id, password from users where id = $1")) {
      const user = state.users.find((item) => item.id === Number(params[0]));
      return { rows: user && !user.deleted_at ? [{ id: user.id, password: user.password }] : [] };
    }

    if (text.includes("from users") && text.includes("where id = $1")) {
      const user = state.users.find((item) => item.id === Number(params[0]));
      return { rows: user ? [publicUser(user)] : [] };
    }

    if (text.includes("update users") && text.includes("set password=$1")) {
      const user = state.users.find((item) => item.id === Number(params[1]));
      if (!user) return { rows: [] };
      user.password = params[0];
      if (text.includes("token_version=token_version + 1")) user.token_version += 1;
      if (text.includes("must_change_password=false")) user.must_change_password = false;
      user.updated_at = new Date().toISOString();
      return { rows: [publicUser(user)] };
    }

    if (text.includes("insert into users")) {
      const role = text.includes("'user'") ? "user" : params[3];
      const hasGoogleUidColumn = text.includes("google_uid");
      const user = {
        id: state.nextUserId++,
        name: params[0],
        email: params[1],
        password: params[2],
        role,
        token_version: 0,
        must_change_password: text.includes("must_change_password") && text.includes("true"),
        deleted_at: null,
        is_locked: false,
        phone: hasGoogleUidColumn ? null : params[4] || null,
        bio: null,
        avatar_url: null,
        google_uid: hasGoogleUidColumn ? params[3] : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.users.push(user);
      return { rows: [publicUser(user)] };
    }

    if (text.includes("update users") && text.includes("set google_uid = $1")) {
      const user = state.users.find((item) => item.id === Number(params[1]));
      if (!user) return { rows: [] };
      user.google_uid = params[0];
      return { rows: [publicUser(user)] };
    }

    if (text.includes("update users") && text.includes("set is_locked=$1")) {
      const user = state.users.find(
        (item) => item.id === Number(params[1]) && !item.deleted_at
      );
      if (!user) return { rows: [] };
      user.is_locked = Boolean(params[0]);
      if (user.is_locked) user.token_version += 1;
      return { rows: [publicUser(user)] };
    }

    if (text.includes("update users") && !text.includes("set deleted_at=current_timestamp")) {
      const hasPassword = text.includes("password=$4");
      const isSelfProfileUpdate = text.includes("avatar_url=$5");
      const id = Number(
        isSelfProfileUpdate ? params[5] : hasPassword ? params[5] : params[4]
      );
      const user = state.users.find((item) => item.id === id);
      if (!user) return { rows: [] };

      user.name = params[0];
      user.email = params[1];
      if (isSelfProfileUpdate) {
        user.phone = params[2] || null;
        user.bio = params[3] || null;
        user.avatar_url = params[4] || null;
      } else {
        const previousRole = user.role;
        user.role = params[2];
        if (hasPassword) {
          user.password = params[3];
          user.phone = params[4] || null;
        } else {
          user.phone = params[3] || null;
        }
        if (text.includes("token_version=token_version + 1")) {
          user.token_version += 1;
        } else if (
          text.includes("case when role is distinct from $3") &&
          previousRole !== user.role
        ) {
          user.token_version += 1;
        }
        if (text.includes("must_change_password=true")) user.must_change_password = true;
      }
      user.updated_at = new Date().toISOString();
      return { rows: [publicUser(user)] };
    }

    if (text.includes("update users") && text.includes("set deleted_at=current_timestamp")) {
      const user = state.users.find((item) => item.id === Number(params[0]) && !item.deleted_at);
      if (!user) return { rows: [] };
      user.deleted_at = new Date().toISOString();
      user.token_version += 1;
      return { rows: [{ id: user.id }] };
    }

    if (text.includes("insert into password_reset_tokens")) {
      const token = {
        id: state.nextResetTokenId++,
        user_id: Number(params[0]),
        token_hash: params[1],
        expires_at: params[2],
        used_at: null,
        created_at: new Date().toISOString(),
      };
      state.passwordResetTokens.push(token);
      return { rows: [{ id: token.id }] };
    }

    if (text.includes("from password_reset_tokens")) {
      const token = state.passwordResetTokens
        .slice()
        .reverse()
        .find((item) => {
          const expiresAt = new Date(item.expires_at);
          return (
            item.token_hash === params[0] &&
            !item.used_at &&
            expiresAt.getTime() > Date.now()
          );
        });

      return {
        rows: token ? [{ id: token.id, user_id: token.user_id }] : [],
      };
    }

    if (text.includes("update password_reset_tokens set used_at")) {
      const token = state.passwordResetTokens.find((item) => item.id === Number(params[0]));
      if (token) token.used_at = new Date().toISOString();
      return { rows: [] };
    }

    if (text.includes('as "totalrooms"') && text.includes('as "totalusers"')) {
      const hasRange = params.length >= 2;
      const start = hasRange ? new Date(params[0]) : null;
      const end = hasRange ? new Date(params[1]) : null;
      const inRange = (booking) => {
        if (!hasRange) return true;
        const ts = new Date(booking.created_at || booking.check_in);
        return ts >= start && ts < end;
      };
      const bookingsInRange = state.bookings.filter(inRange);
      const revenueEligible = bookingsInRange.filter((item) =>
        ["confirmed", "completed"].includes(item.status)
      );
      const revenue = revenueEligible.reduce((sum, item) => sum + Number(item.total_price), 0);
      const totalDiscount = revenueEligible.reduce(
        (sum, item) => sum + Number(item.discount_amount || 0),
        0
      );
      return {
        rows: [
          {
            totalRooms: state.rooms.length,
            availableRooms: state.rooms.filter((item) => item.status === "available").length,
            bookedRooms: state.rooms.filter((item) => item.status === "booked").length,
            totalUsers: state.users.length,
            totalBookings: bookingsInRange.length,
            revenue,
            totalDiscount,
          },
        ],
      };
    }

    if (
      text.includes("select coalesce(created_at, check_in::timestamp) as ts") &&
      text.includes("from bookings")
    ) {
      const start = new Date(params[0]);
      const end = new Date(params[1]);
      const rows = state.bookings
        .filter((b) => {
          const ts = new Date(b.created_at || b.check_in);
          return ts >= start && ts < end;
        })
        .map((b) => ({
          ts: b.created_at || b.check_in,
          total_price: b.total_price,
          status: b.status,
        }));
      return { rows };
    }

    if (text.includes("from bookings") && text.includes("group by status")) {
      const start = new Date(params[0]);
      const end = new Date(params[1]);
      const counts = state.bookings
        .filter((b) => {
          const ts = new Date(b.created_at || b.check_in);
          return ts >= start && ts < end;
        })
        .reduce((acc, booking) => {
          acc[booking.status] = (acc[booking.status] || 0) + 1;
          return acc;
        }, {});

      return {
        rows: Object.entries(counts).map(([status, count]) => ({
          status,
          count,
        })),
      };
    }

    if (text.includes("from rooms r") && text.includes("join bookings b")) {
      const start = new Date(params[0]);
      const end = new Date(params[1]);
      const rows = state.rooms
        .map((room) => {
          const bookings = state.bookings.filter((booking) => {
            if (booking.room_id !== room.id) return false;
            const ts = new Date(booking.created_at || booking.check_in);
            return ts >= start && ts < end;
          });
          const revenue = bookings
            .filter((booking) => ["confirmed", "completed"].includes(booking.status))
            .reduce((sum, booking) => sum + Number(booking.total_price), 0);

          return {
            room_id: room.id,
            room_name: room.room_name,
            room_type: room.room_type,
            booking_count: bookings.length,
            revenue,
          };
        })
        .filter((room) => room.booking_count > 0)
        .sort((a, b) => b.booking_count - a.booking_count || b.revenue - a.revenue)
        .slice(0, 5);

      return { rows };
    }

    if (text.includes("from rooms") && text.includes("filter (where status = 'booked')")) {
      return {
        rows: [
          {
            totalRooms: state.rooms.length,
            bookedRooms: state.rooms.filter((item) => item.status === "booked").length,
            availableRooms: state.rooms.filter((item) => item.status === "available").length,
            maintenanceRooms: state.rooms.filter((item) => item.status === "maintenance").length,
          },
        ],
      };
    }

    if (text.includes("count(*)::int as total from rooms")) {
      const { rows } = filterRoomsForQuery(state, text, params);
      return { rows: [{ total: rows.length }] };
    }

    if (
      text.includes("from rooms") &&
      (text.includes("order by room_name") ||
        text.includes("order by price") ||
        text.includes("order by created_at"))
    ) {
      const { rows: filtered, consumed } = filterRoomsForQuery(state, text, params);
      let sortKey = "created_at";
      if (text.includes("order by room_name")) sortKey = "room_name";
      else if (text.includes("order by price")) sortKey = "price";
      const desc = text.includes(`order by ${sortKey} desc`);

      const sorted = filtered.slice().sort((a, b) => {
        if (a[sortKey] < b[sortKey]) return desc ? 1 : -1;
        if (a[sortKey] > b[sortKey]) return desc ? -1 : 1;
        return a.id - b.id;
      });

      const limitNum = Number(params[consumed]);
      const offset = Number(params[consumed + 1]);
      return { rows: sorted.slice(offset, offset + limitNum) };
    }

    if (text.includes("from room_images") && text.includes("where room_id = $1")) {
      return {
        rows: state.roomImages.filter((item) => item.room_id === Number(params[0])),
      };
    }

    if (text.includes("insert into room_images")) {
      const roomImage = {
        id: state.nextRoomImageId++,
        room_id: Number(params[0]),
        image_path: params[1],
      };
      state.roomImages.push(roomImage);
      return { rows: [roomImage] };
    }

    if (text.includes("delete from room_images")) {
      const index = state.roomImages.findIndex(
        (item) => item.id === Number(params[0]) && item.room_id === Number(params[1])
      );
      if (index === -1) return { rows: [] };
      const [deleted] = state.roomImages.splice(index, 1);
      return { rows: [deleted] };
    }

    if (text.includes("from rooms") && text.includes("order by id asc")) {
      return {
        rows: state.rooms.slice().sort((a, b) => a.id - b.id),
      };
    }

    if (text.includes("select distinct location from rooms")) {
      const distinct = [...new Set(state.rooms.map((r) => r.location).filter(Boolean))].sort();
      return { rows: distinct.map((location) => ({ location })) };
    }

    if (text.includes("select status from rooms where id = $1")) {
      const room = state.rooms.find((item) => item.id === Number(params[0]));
      return { rows: room ? [{ status: room.status }] : [] };
    }

    if (
      text.startsWith("select") &&
      text.includes("from rooms") &&
      text.includes("where id = $1")
    ) {
      const room = state.rooms.find((item) => item.id === Number(params[0]));
      return { rows: room ? [room] : [] };
    }

    if (text.includes("insert into rooms")) {
      const room = {
        id: state.nextRoomId++,
        room_name: params[0],
        room_type: params[1],
        price: params[2],
        description: params[3],
        capacity: params[4],
        image: params[5],
        status: params[6],
        location: params[7] ?? null,
        created_at: new Date().toISOString(),
      };
      state.rooms.push(room);
      return { rows: [room] };
    }

    if (text.includes("update rooms set status = $1 where id = $2")) {
      const room = state.rooms.find((item) => item.id === Number(params[1]));
      if (room) room.status = params[0];
      return { rows: [] };
    }

    if (text.includes("update rooms")) {
      const room = state.rooms.find((item) => item.id === Number(params[8]));
      if (!room) return { rows: [] };
      Object.assign(room, {
        room_name: params[0],
        room_type: params[1],
        price: params[2],
        description: params[3],
        capacity: params[4],
        image: params[5],
        status: params[6],
        location: params[7] ?? null,
      });
      return { rows: [room] };
    }

    if (text.includes("select id from bookings where room_id = $1 limit 1")) {
      const booking = state.bookings.find((item) => item.room_id === Number(params[0]));
      return { rows: booking ? [{ id: booking.id }] : [] };
    }

    if (text.includes("delete from rooms")) {
      const index = state.rooms.findIndex((item) => item.id === Number(params[0]));
      if (index === -1) return { rows: [] };
      const [deleted] = state.rooms.splice(index, 1);
      // Mirrors the real "room_images.room_id REFERENCES rooms(id) ON DELETE
      // CASCADE" constraint from migration 005.
      state.roomImages = state.roomImages.filter((img) => img.room_id !== deleted.id);
      return { rows: [{ id: deleted.id }] };
    }

    if (text.includes("set status = 'completed' where status = 'confirmed'")) {
      const todayIso = new Date().toISOString().slice(0, 10);
      state.bookings.forEach((booking) => {
        if (booking.status === "confirmed" && booking.check_out < todayIso) {
          booking.status = "completed";
        }
      });
      return { rows: [] };
    }

    if (text.includes("count(*)::int as total from bookings b")) {
      const { rows } = filterBookings(state, text, params);
      return { rows: [{ total: rows.length }] };
    }

    if (
      text.includes("from bookings b") &&
      text.includes("b.room_id = $1") &&
      text.includes("b.check_in < $3::date")
    ) {
      const roomId = Number(params[0]);
      const monthStart = params[1];
      const monthEndExclusive = params[2];
      const rows = state.bookings
        .filter(
          (b) =>
            b.room_id === roomId &&
            b.check_in < monthEndExclusive &&
            b.check_out > monthStart
        )
        .sort((a, b) => a.id - b.id)
        .map((b) => {
          const user = state.users.find((u) => u.id === b.user_id);
          return {
            id: b.id,
            check_in: b.check_in,
            check_out: b.check_out,
            status: b.status,
            guests: b.guests,
            total_price: b.total_price,
            user_name: user?.name,
            user_email: user?.email,
          };
        });
      return { rows };
    }

    if (text.includes("from bookings b")) {
      if (text.includes("where b.id = $1")) {
        const rows = state.bookings
          .map((item) => joinBooking(state, item))
          .filter((item) => item.id === Number(params[0]));
        return { rows };
      }

      const { rows: filtered, consumed } = filterBookings(state, text, params);
      let rows = filtered;

      if (text.includes("limit $") && text.includes("offset $")) {
        const limitNum = Number(params[consumed]);
        const offset = Number(params[consumed + 1]);
        rows = rows.slice(offset, offset + limitNum);
      }

      return { rows };
    }

    if (text.includes("select id from bookings") && text.includes("status = any")) {
      const roomId = Number(params[0]);
      const activeStatuses = params[3] || params[1] || [];
      const rows = state.bookings
        .filter((item) => {
          if (params.length >= 4) {
            return hasOverlap(item, roomId, params[1], params[2], activeStatuses);
          }

          return item.room_id === roomId && activeStatuses.includes(item.status);
        })
        .map((item) => ({ id: item.id }));
      return { rows };
    }

    if (text.includes("insert into bookings")) {
      const expiresAtParam = params[6];
      const booking = {
        id: state.nextBookingId++,
        user_id: Number(params[0]),
        room_id: Number(params[1]),
        check_in: params[2],
        check_out: params[3],
        total_price: Number(params[4]),
        guests: Number(params[5]),
        status: "pending",
        payment_status: "unpaid",
        expires_at:
          expiresAtParam instanceof Date
            ? expiresAtParam.toISOString()
            : expiresAtParam || null,
        coupon_id: params[7] != null ? Number(params[7]) : null,
        discount_amount: Number(params[8]) || 0,
        created_at: new Date().toISOString(),
      };
      state.bookings.push(booking);
      return { rows: [booking] };
    }

    if (
      text.includes("set status = 'cancelled'") &&
      text.includes("where status = 'pending'") &&
      text.includes("expires_at")
    ) {
      const nowIso = new Date().toISOString();
      const expiredRoomIds = [];
      state.bookings.forEach((booking) => {
        if (
          booking.status === "pending" &&
          booking.expires_at &&
          booking.expires_at < nowIso
        ) {
          booking.status = "cancelled";
          expiredRoomIds.push(booking.room_id);
        }
      });
      return { rows: expiredRoomIds.map((room_id) => ({ room_id })) };
    }

    if (text.includes("update bookings") && text.includes("set status = $1")) {
      const booking = state.bookings.find((item) => item.id === Number(params[1]));
      if (!booking) return { rows: [] };
      booking.status = params[0];
      if (params[0] !== "pending") booking.expires_at = null;
      return { rows: [booking] };
    }

    if (text.includes("select * from bookings where id = $1")) {
      const booking = state.bookings.find((item) => item.id === Number(params[0]));
      return { rows: booking ? [booking] : [] };
    }

    if (text.includes("update bookings set status = 'cancelled'")) {
      const booking = state.bookings.find((item) => item.id === Number(params[0]));
      if (!booking) return { rows: [] };
      booking.status = "cancelled";
      return { rows: [booking] };
    }

    if (text.includes("delete from bookings")) {
      const index = state.bookings.findIndex((item) => item.id === Number(params[0]));
      if (index === -1) return { rows: [] };
      const [deleted] = state.bookings.splice(index, 1);
      return { rows: [deleted] };
    }

    if (text.includes("update payments") && text.includes("set status = 'cancelled'")) {
      state.payments
        .filter((item) => item.booking_id === Number(params[0]) && item.status === "pending")
        .forEach((item) => {
          item.status = "cancelled";
        });
      return { rows: [] };
    }

    if (text.includes("insert into payments")) {
      const payment = {
        id: state.nextPaymentId++,
        booking_id: Number(params[0]),
        provider: params[1],
        transaction_ref: params[2],
        provider_transaction_id: null,
        amount: Number(params[3]),
        currency: "VND",
        status: "pending",
        raw_callback: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.payments.push(payment);
      return { rows: [payment] };
    }

    if (text.includes("update bookings") && text.includes("set payment_status = 'pending'")) {
      const booking = state.bookings.find((item) => item.id === Number(params[0]));
      if (!booking) return { rows: [] };
      booking.payment_status = "pending";
      return { rows: [booking] };
    }

    if (text.includes("update bookings") && text.includes("set payment_status = $1")) {
      const booking = state.bookings.find((item) => item.id === Number(params[1]));
      if (!booking) return { rows: [] };
      booking.payment_status = params[0];
      return { rows: [booking] };
    }

    if (text.includes("update bookings") && text.includes("set status = 'confirmed'")) {
      const booking = state.bookings.find(
        (item) => item.id === Number(params[0]) && item.status === "pending"
      );
      if (!booking) return { rows: [] };
      booking.status = "confirmed";
      booking.expires_at = null;
      return { rows: [{ room_id: booking.room_id }] };
    }

    if (text.includes("from payments") && text.includes("where booking_id = $1") && text.includes("order by id desc")) {
      const rows = state.payments
        .filter((item) => item.booking_id === Number(params[0]))
        .sort((a, b) => b.id - a.id)
        .slice(0, 1);
      return { rows };
    }

    if (text.includes("select * from payments where transaction_ref = $1")) {
      const payment = state.payments.find((item) => item.transaction_ref === params[0]);
      return { rows: payment ? [payment] : [] };
    }

    if (text.includes("from payments p") && text.includes("join bookings b")) {
      const payment = state.payments.find((item) => item.transaction_ref === params[0]);
      if (!payment) return { rows: [] };
      const booking = state.bookings.find((item) => item.id === payment.booking_id);
      return {
        rows: [
          {
            ...payment,
            booking_user_id: booking?.user_id,
            booking_status: booking?.status,
          },
        ],
      };
    }

    if (text.includes("update payments") && text.includes("set status = $1")) {
      const payment = state.payments.find((item) => item.id === Number(params[3]));
      if (!payment) return { rows: [] };
      payment.status = params[0];
      payment.provider_transaction_id = params[1];
      payment.raw_callback = params[2];
      payment.updated_at = new Date().toISOString();
      return { rows: [payment] };
    }

    if (text.includes("select id, user_id, room_id, status from bookings where id = $1")) {
      const booking = state.bookings.find((item) => item.id === Number(params[0]));
      return {
        rows: booking
          ? [{ id: booking.id, user_id: booking.user_id, room_id: booking.room_id, status: booking.status }]
          : [],
      };
    }

    if (text.includes("select id from room_reviews where booking_id = $1")) {
      const review = state.reviews.find((item) => item.booking_id === Number(params[0]));
      return { rows: review ? [{ id: review.id }] : [] };
    }

    if (text.includes("insert into room_reviews")) {
      const duplicate = state.reviews.some((item) => item.booking_id === Number(params[2]));
      if (duplicate) {
        const err = new Error("duplicate key value violates unique constraint");
        err.code = "23505";
        throw err;
      }
      const review = {
        id: state.nextReviewId++,
        room_id: Number(params[0]),
        user_id: Number(params[1]),
        booking_id: Number(params[2]),
        rating: Number(params[3]),
        comment: params[4] ?? null,
        is_hidden: false,
        created_at: new Date().toISOString(),
      };
      state.reviews.push(review);
      return { rows: [review] };
    }

    if (text.includes("coalesce(avg(rating)")) {
      const roomReviews = state.reviews.filter(
        (item) => item.room_id === Number(params[0]) && !item.is_hidden
      );
      const total = roomReviews.length;
      const average = total
        ? roomReviews.reduce((sum, item) => sum + item.rating, 0) / total
        : 0;
      return { rows: [{ total, average }] };
    }

    if (
      text.includes("from room_reviews rv") &&
      text.includes("join users u") &&
      !text.includes("join rooms r")
    ) {
      const roomReviews = state.reviews
        .filter((item) => item.room_id === Number(params[0]) && !item.is_hidden)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const limitNum = Number(params[1]);
      const offset = Number(params[2]);
      const page = roomReviews.slice(offset, offset + limitNum);
      return {
        rows: page.map((item) => ({
          id: item.id,
          rating: item.rating,
          comment: item.comment,
          created_at: item.created_at,
          user_name: state.users.find((u) => u.id === item.user_id)?.name,
        })),
      };
    }

    if (text.includes("count(*)::int as total from room_reviews rv")) {
      const roomId = text.includes("rv.room_id = $1") ? Number(params[0]) : null;
      const filtered = roomId
        ? state.reviews.filter((item) => item.room_id === roomId)
        : state.reviews;
      return { rows: [{ total: filtered.length }] };
    }

    if (
      text.includes("from room_reviews rv") &&
      text.includes("join rooms r") &&
      text.includes("join users u")
    ) {
      let idx = 0;
      let filtered = state.reviews.slice();
      if (text.includes("rv.room_id = $")) {
        const roomId = Number(params[idx++]);
        filtered = filtered.filter((item) => item.room_id === roomId);
      }
      const limitNum = Number(params[idx++]);
      const offset = Number(params[idx++]);
      const sorted = filtered
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const page = sorted.slice(offset, offset + limitNum);
      return {
        rows: page.map((item) => ({
          id: item.id,
          room_id: item.room_id,
          rating: item.rating,
          comment: item.comment,
          is_hidden: item.is_hidden,
          created_at: item.created_at,
          room_name: state.rooms.find((r) => r.id === item.room_id)?.room_name,
          user_name: state.users.find((u) => u.id === item.user_id)?.name,
          user_email: state.users.find((u) => u.id === item.user_id)?.email,
        })),
      };
    }

    if (text.includes("update room_reviews set is_hidden = $1 where id = $2")) {
      const review = state.reviews.find((item) => item.id === Number(params[1]));
      if (!review) return { rows: [] };
      review.is_hidden = Boolean(params[0]);
      return { rows: [review] };
    }

    if (text.includes("update coupons set used_count = used_count + 1")) {
      const coupon = state.coupons.find((item) => item.id === Number(params[0]));
      if (!coupon) return { rows: [] };
      coupon.used_count += 1;
      return { rows: [coupon] };
    }

    if (text.includes("update coupons set is_active = $1")) {
      const coupon = state.coupons.find((item) => item.id === Number(params[1]));
      if (!coupon) return { rows: [] };
      coupon.is_active = Boolean(params[0]);
      return { rows: [coupon] };
    }

    if (text.includes("update coupons set code = $1")) {
      const coupon = state.coupons.find((item) => item.id === Number(params[7]));
      if (!coupon) return { rows: [] };
      const duplicate = state.coupons.some(
        (item) => item.id !== coupon.id && item.code === params[0]
      );
      if (duplicate) {
        const err = new Error("duplicate key value violates unique constraint");
        err.code = "23505";
        throw err;
      }
      Object.assign(coupon, {
        code: params[0],
        discount_type: params[1],
        discount_value: Number(params[2]),
        max_discount_amount: params[3] != null ? Number(params[3]) : null,
        min_booking_amount: params[4] != null ? Number(params[4]) : null,
        expires_at: params[5],
        usage_limit: params[6] != null ? Number(params[6]) : null,
      });
      return { rows: [coupon] };
    }

    if (text.includes("insert into coupons")) {
      const duplicate = state.coupons.some((item) => item.code === params[0]);
      if (duplicate) {
        const err = new Error("duplicate key value violates unique constraint");
        err.code = "23505";
        throw err;
      }
      const coupon = {
        id: state.nextCouponId++,
        code: params[0],
        discount_type: params[1],
        discount_value: Number(params[2]),
        max_discount_amount: params[3] != null ? Number(params[3]) : null,
        min_booking_amount: params[4] != null ? Number(params[4]) : null,
        expires_at: params[5],
        usage_limit: params[6] != null ? Number(params[6]) : null,
        used_count: 0,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      state.coupons.push(coupon);
      return { rows: [coupon] };
    }

    if (text.includes("select * from coupons where code = $1")) {
      const coupon = state.coupons.find((item) => item.code === params[0]);
      return { rows: coupon ? [coupon] : [] };
    }

    if (text.includes("select * from coupons order by created_at desc")) {
      return {
        rows: state.coupons.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      };
    }

    throw new Error(`Unhandled SQL in test fake pool: ${sql}`);
  }

  return {
    query,
    async connect() {
      return {
        query,
        release() {},
      };
    },
  };
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

function authHeader(token) {
  return { Cookie: token };
}

function authCookie(result) {
  const setCookie = result.response.headers.get("set-cookie");
  assert.ok(setCookie, "authentication response must set an HttpOnly cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  return setCookie.split(";", 1)[0];
}

describe("hotel booking API", () => {
  let server;
  let baseUrl;
  let adminToken;
  let userToken;
  let state;
  let originalFetch;
  let initSocket;
  let getIO;

  before(async () => {
    state = makeState();

    // momoService.createMomoPayUrl calls the real MoMo "create payment" API
    // over HTTP — intercept just that one URL so the rest of the module's
    // real signing/verification logic still runs, without hitting the network.
    originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (url === process.env.MOMO_API_URL) {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            resultCode: 0,
            payUrl: `https://fake-momo-pay.test/pay?orderId=${body.orderId}`,
          }),
        };
      }
      return originalFetch(url, options);
    };

    const dbPath = require.resolve("../src/db/db.js");
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: makeFakePool(state),
    };

    const emailPath = require.resolve("../src/services/emailService.js");
    require.cache[emailPath] = {
      id: emailPath,
      filename: emailPath,
      loaded: true,
      exports: {
        assertEmailConfigured() {},
        async sendPasswordResetEmail(payload) {
          state.sentPasswordResetEmails.push(payload);
        },
      },
    };

    const firebasePath = require.resolve("../src/services/firebaseAdmin.js");
    require.cache[firebasePath] = {
      id: firebasePath,
      filename: firebasePath,
      loaded: true,
      exports: {
        isGoogleLoginConfigured: () => true,
        async verifyFirebaseIdToken(token) {
          if (token === "valid-google-token-existing-admin") {
            return {
              uid: "google-user-admin-1",
              email: "admin@example.com",
              email_verified: true,
              name: "Admin Via Google",
              firebase: { sign_in_provider: "google.com" },
            };
          }
          if (token !== "valid-google-token") throw new Error("invalid Firebase token");
          return {
            uid: "google-user-1",
            email: "google@example.com",
            email_verified: true,
            name: "Google User",
            firebase: { sign_in_provider: "google.com" },
          };
        },
      },
    };

    const serverPath = require.resolve("../server.js");
    delete require.cache[serverPath];
    const app = require("../server.js");

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    // server.js only calls initSocket() itself under require.main === module
    // (the real `node server.js` startup path) — the test harness creates
    // its own listening server above, so it wires sockets onto that one
    // the same way.
    ({ initSocket, getIO } = require("../src/services/socket.js"));
    initSocket(server);

    const adminLogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "admin123",
      }),
    });
    adminToken = authCookie(adminLogin);

    const userLogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.com",
        password: "user123",
      }),
    });
    userToken = authCookie(userLogin);
  });

  after(async () => {
    global.fetch = originalFetch;
    // Socket.io's close() also closes the underlying HTTP server it's
    // attached to (and disconnects any still-open socket clients first,
    // which a bare server.close() would otherwise hang waiting on) — so
    // this replaces the plain server.close() call, not just precede it.
    const io = getIO();
    if (io) {
      await new Promise((resolve) => io.close(() => resolve()));
    } else {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("authenticates valid users and rejects invalid login", async () => {
    const ok = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "admin123",
      }),
    });

    assert.equal(ok.response.status, 200);
    assert.equal(ok.body.user.role, "admin");
    assert.equal(ok.body.user.password, undefined);
    assert.equal(ok.body.token, undefined);
    authCookie(ok);

    const bad = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "wrong-password",
      }),
    });

    assert.equal(bad.response.status, 401);
  });

  it("accepts only verified, unexpired Google ID tokens", async () => {
    for (const idToken of ["fake-token", "expired-token", "wrong-signature-token"]) {
      const rejected = await request(baseUrl, "/api/google-login", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });
      assert.equal(rejected.response.status, 401);
      assert.equal(rejected.response.headers.get("set-cookie"), null);
    }

    const accepted = await request(baseUrl, "/api/google-login", {
      method: "POST",
      body: JSON.stringify({
        idToken: "valid-google-token",
        email: "admin@example.com",
        name: "Forged Admin",
      }),
    });
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.body.user.email, "google@example.com");
    assert.equal(accepted.body.user.role, "user");
    assert.equal(accepted.body.linked, false);
    authCookie(accepted);
  });

  it("links Google sign-in to an existing password account instead of merging silently", async () => {
    const firstGoogleLogin = await request(baseUrl, "/api/google-login", {
      method: "POST",
      body: JSON.stringify({ idToken: "valid-google-token-existing-admin" }),
    });
    assert.equal(firstGoogleLogin.response.status, 200);
    assert.equal(firstGoogleLogin.body.linked, true);
    assert.equal(firstGoogleLogin.body.user.email, "admin@example.com");
    assert.equal(firstGoogleLogin.body.user.role, "admin");
    assert.equal(firstGoogleLogin.body.user.google_uid, undefined);
    authCookie(firstGoogleLogin);

    const secondGoogleLogin = await request(baseUrl, "/api/google-login", {
      method: "POST",
      body: JSON.stringify({ idToken: "valid-google-token-existing-admin" }),
    });
    assert.equal(secondGoogleLogin.response.status, 200);
    assert.equal(secondGoogleLogin.body.linked, false);
    assert.equal(secondGoogleLogin.body.user.email, "admin@example.com");
  });

  it("rate limits login, forgot-password and reset-password endpoints", async () => {
    process.env.NODE_ENV = "production";
    try {
      let response;
      for (let index = 0; index < 11; index += 1) {
        response = await request(baseUrl, "/api/login", {
          method: "POST",
          body: JSON.stringify({ email: "missing@example.com", password: "wrongpass" }),
        });
      }
      assert.equal(response.response.status, 429);

      for (let index = 0; index < 6; index += 1) {
        response = await request(baseUrl, "/api/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: `missing-${index}@example.com` }),
        });
      }
      assert.equal(response.response.status, 429);

      for (let index = 0; index < 11; index += 1) {
        response = await request(baseUrl, "/api/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: `invalid-${index}`, password: "newpass123" }),
        });
      }
      assert.equal(response.response.status, 429);
    } finally {
      process.env.NODE_ENV = "test";
    }
  });

  it("rejects sign-up passwords that do not meet the shared password rule", async () => {
    for (const password of ["123456", "alllowercase", "12345678"]) {
      const result = await request(baseUrl, "/api/register", {
        method: "POST",
        body: JSON.stringify({ name: "Weak", email: "weak@example.com", password }),
      });

      assert.equal(result.response.status, 400);
      assert.match(result.body.message, /letters and numbers/);
    }
  });

  it("rejects over-long text with a 400 instead of failing in the database", async () => {
    const longName = await request(baseUrl, "/api/register", {
      method: "POST",
      body: JSON.stringify({ name: "n".repeat(101), email: "long@example.com", password: "guest123" }),
    });
    assert.equal(longName.response.status, 400);
    assert.match(longName.body.message, /Name must be at most 100 characters/);

    const longEmail = await request(baseUrl, "/api/register", {
      method: "POST",
      body: JSON.stringify({ name: "Ok", email: `${"e".repeat(250)}@example.com`, password: "guest123" }),
    });
    assert.equal(longEmail.response.status, 400);
    assert.match(longEmail.body.message, /Email must be at most 255 characters/);

    const profile = await request(baseUrl, "/api/users/me", {
      method: "PUT",
      headers: authHeader(userToken),
      body: JSON.stringify({ name: "n".repeat(101), email: "user@example.com" }),
    });
    assert.equal(profile.response.status, 400);

    const adminCreate = await request(baseUrl, "/api/users", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({ name: "n".repeat(101), email: "x@example.com", password: "Temp-Pass-42" }),
    });
    assert.equal(adminCreate.response.status, 400);

    const room = { room_name: "Room", room_type: "Deluxe", price: 100, capacity: 2 };
    for (const [field, max] of [["room_name", 150], ["room_type", 100], ["location", 255]]) {
      const created = await request(baseUrl, "/api/rooms", {
        method: "POST",
        headers: authHeader(adminToken),
        body: JSON.stringify({ ...room, [field]: "x".repeat(max + 1) }),
      });
      assert.equal(created.response.status, 400, field);
      assert.match(created.body.message, new RegExp(`at most ${max} characters`));

      const updated = await request(baseUrl, "/api/rooms/1", {
        method: "PUT",
        headers: authHeader(adminToken),
        body: JSON.stringify({ ...room, [field]: "x".repeat(max + 1) }),
      });
      assert.equal(updated.response.status, 400, field);
    }

    const notText = await request(baseUrl, "/api/rooms", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({ ...room, room_name: { nested: true } }),
    });
    assert.equal(notText.response.status, 400);
  });

  it("registers a new user without exposing password", async () => {
    const result = await request(baseUrl, "/api/register", {
      method: "POST",
      body: JSON.stringify({
        name: "New Guest",
        email: "guest@example.com",
        password: "guest123",
      }),
    });

    assert.equal(result.response.status, 201);
    assert.equal(result.body.user.email, "guest@example.com");
    assert.equal(result.body.user.role, "user");
    assert.equal(result.body.user.password, undefined);
  });

  it("sends password reset email and resets password with a hashed token", async () => {
    const forgot = await request(baseUrl, "/api/forgot-password", {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.com",
      }),
    });

    assert.equal(forgot.response.status, 200);
    assert.equal(state.sentPasswordResetEmails.length, 1);
    assert.equal(state.passwordResetTokens.length, 1);

    const email = state.sentPasswordResetEmails[0];
    const resetUrl = new URL(email.resetUrl);
    const rawToken = resetUrl.searchParams.get("token");

    assert.ok(rawToken);
    assert.notEqual(state.passwordResetTokens[0].token_hash, rawToken);

    const reset = await request(baseUrl, "/api/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: rawToken,
        password: "newpass123",
      }),
    });

    assert.equal(reset.response.status, 200);
    assert.ok(state.passwordResetTokens[0].used_at);

    const revokedSession = await request(baseUrl, "/api/bookings", {
      headers: authHeader(userToken),
    });
    assert.equal(revokedSession.response.status, 401);

    const oldLogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.com",
        password: "user123",
      }),
    });
    assert.equal(oldLogin.response.status, 401);

    const newLogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.com",
        password: "newpass123",
      }),
    });
    assert.equal(newLogin.response.status, 200);
    userToken = authCookie(newLogin);
  });

  it("returns rooms publicly and protects room writes", async () => {
    const list = await request(baseUrl, "/api/rooms");
    assert.equal(list.response.status, 200);
    assert.equal(list.body.length, 2);

    const unauthorized = await request(baseUrl, "/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        room_name: "Garden Room",
        room_type: "Standard",
        price: 80,
      }),
    });
    assert.equal(unauthorized.response.status, 401);

    const created = await request(baseUrl, "/api/rooms", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        room_name: "Garden Room",
        room_type: "Standard",
        price: 80,
        capacity: 2,
        status: "available",
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.room.room_name, "Garden Room");

    const invalidPrice = await request(baseUrl, "/api/rooms", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        room_name: "Bad Price Room",
        room_type: "Standard",
        price: -1,
        capacity: 2,
      }),
    });
    assert.equal(invalidPrice.response.status, 400);

    const invalidCapacity = await request(baseUrl, "/api/rooms", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        room_name: "Bad Capacity Room",
        room_type: "Standard",
        price: 80,
        capacity: 0,
      }),
    });
    assert.equal(invalidCapacity.response.status, 400);

    const zeroPrice = await request(baseUrl, "/api/rooms", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        room_name: "Free Room",
        room_type: "Standard",
        price: 0,
        capacity: 2,
      }),
    });
    assert.equal(zeroPrice.response.status, 400);
  });

  it("returns distinct room locations for the search autocomplete", async () => {
    const res = await request(baseUrl, "/api/rooms/locations");
    assert.equal(res.response.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.deepEqual(res.body, ["Hoàn Kiếm, Hà Nội", "Mỹ Khê, Đà Nẵng"]);
  });

  it("filters rooms by location with a case-insensitive partial match", async () => {
    const exact = await request(baseUrl, `/api/rooms?location=${encodeURIComponent("Đà Nẵng")}`);
    assert.equal(exact.response.status, 200);
    assert.equal(exact.body.data.length, 1);
    assert.equal(exact.body.data[0].room_name, "Suite Room");

    const caseInsensitive = await request(baseUrl, `/api/rooms?location=${encodeURIComponent("đà nẵng")}`);
    assert.equal(caseInsensitive.body.data.length, 1);

    const noMatch = await request(baseUrl, `/api/rooms?location=${encodeURIComponent("Cần Thơ")}`);
    assert.equal(noMatch.body.data.length, 0);
  });

  it("excludes rooms with overlapping active bookings from availability search", async () => {
    const overlapping = await request(
      baseUrl,
      "/api/rooms?checkIn=2099-01-10&checkOut=2099-01-11"
    );
    assert.equal(overlapping.response.status, 200);
    const overlappingIds = overlapping.body.data.map((room) => room.id);
    assert.ok(!overlappingIds.includes(2), "room 2 is booked for this range");
    assert.ok(overlappingIds.includes(1), "room 1 is free for this range");

    const clear = await request(
      baseUrl,
      "/api/rooms?checkIn=2099-05-01&checkOut=2099-05-02"
    );
    assert.equal(clear.response.status, 200);
    assert.equal(clear.body.data.length, clear.body.pagination.total);
    assert.ok(clear.body.data.map((room) => room.id).includes(2));
  });

  it("frees a room in availability search once its pending booking expires", async () => {
    // A fixed id below the auto-increment range so this manual insert
    // doesn't collide with ids later tests hardcode (e.g. booking #3), and
    // sorts last in the ORDER BY id DESC booking lists other tests assert on.
    const staleBookingId = -1;
    state.bookings.push({
      id: staleBookingId,
      // Owned by the admin seed user, not the "normal user" account other
      // tests assert an exact booking list/count for.
      user_id: 1,
      room_id: 1,
      check_in: "2099-04-01",
      check_out: "2099-04-03",
      total_price: 200,
      guests: 1,
      status: "pending",
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const search = await request(
      baseUrl,
      "/api/rooms?checkIn=2099-04-01&checkOut=2099-04-02"
    );
    assert.equal(search.response.status, 200);
    assert.ok(
      search.body.data.map((room) => room.id).includes(1),
      "room 1 should be free again once the stale pending booking expires"
    );

    const staleBooking = state.bookings.find((item) => item.id === staleBookingId);
    assert.equal(staleBooking.status, "cancelled");
  });

  it("manages a room's extra gallery images", async () => {
    const roomId = state.rooms.find((room) => room.room_name === "Garden Room").id;

    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5uEAAAAASUVORK5CYII=",
      "base64"
    );
    const form = new FormData();
    form.append("image", new Blob([pngBytes], { type: "image/png" }), "gallery.png");

    const uploaded = await fetch(`${baseUrl}/api/rooms/${roomId}/images`, {
      method: "POST",
      headers: authHeader(adminToken),
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();
    assert.match(uploadedBody.image.image_path, /\/uploads\/rooms\/[0-9a-f-]+\.png$/i);

    const afterUpload = await request(baseUrl, `/api/rooms/${roomId}`);
    assert.equal(afterUpload.body.images.length, 1);

    const imageId = uploadedBody.image.id;
    const deleted = await request(baseUrl, `/api/rooms/${roomId}/images/${imageId}`, {
      method: "DELETE",
      headers: authHeader(adminToken),
    });
    assert.equal(deleted.response.status, 200);

    const afterDelete = await request(baseUrl, `/api/rooms/${roomId}`);
    assert.equal(afterDelete.body.images.length, 0);

    const filename = uploadedBody.image.image_path.split("/").pop();
    await fs.unlink(path.join(__dirname, "../uploads/rooms", filename)).catch(() => {});
  });

  it("cascades room deletion to its gallery images", async () => {
    const created = await request(baseUrl, "/api/rooms", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        room_name: "Cascade Room",
        room_type: "Standard",
        price: 90,
        capacity: 2,
        status: "available",
      }),
    });
    assert.equal(created.response.status, 201);
    const roomId = created.body.room.id;

    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5uEAAAAASUVORK5CYII=",
      "base64"
    );
    const form = new FormData();
    form.append("image", new Blob([pngBytes], { type: "image/png" }), "gallery.png");
    const uploaded = await fetch(`${baseUrl}/api/rooms/${roomId}/images`, {
      method: "POST",
      headers: authHeader(adminToken),
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    assert.equal(
      state.roomImages.filter((img) => img.room_id === roomId).length,
      1
    );

    const deleted = await request(baseUrl, `/api/rooms/${roomId}`, {
      method: "DELETE",
      headers: authHeader(adminToken),
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(
      state.roomImages.filter((img) => img.room_id === roomId).length,
      0,
      "room_images rows must cascade-delete with the room, no orphans left"
    );

    const filename = uploadedBody.image.image_path.split("/").pop();
    await fs.unlink(path.join(__dirname, "../uploads/rooms", filename)).catch(() => {});
  });

  it("validates room upload content by magic bytes and chooses the extension", async () => {
    const fakeForm = new FormData();
    fakeForm.append(
      "image",
      new Blob([Buffer.from("<html>not an image</html>")], { type: "image/png" }),
      "forged.html"
    );
    const fakeResponse = await fetch(`${baseUrl}/api/rooms/upload-image`, {
      method: "POST",
      headers: authHeader(adminToken),
      body: fakeForm,
    });
    assert.equal(fakeResponse.status, 400);

    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5uEAAAAASUVORK5CYII=",
      "base64"
    );
    const validForm = new FormData();
    validForm.append("image", new Blob([pngBytes], { type: "text/html" }), "forged.html");
    const validResponse = await fetch(`${baseUrl}/api/rooms/upload-image`, {
      method: "POST",
      headers: authHeader(adminToken),
      body: validForm,
    });
    const validBody = await validResponse.json();
    assert.equal(validResponse.status, 201);
    assert.match(validBody.image, /\/uploads\/rooms\/[0-9a-f-]+\.png$/i);

    const filename = new URL(validBody.image).pathname.split("/").pop();
    await fs.unlink(path.join(__dirname, "../uploads/rooms", filename));
  });

  it("allows admin user management and rejects normal users", async () => {
    const forbidden = await request(baseUrl, "/api/users", {
      headers: authHeader(userToken),
    });
    assert.equal(forbidden.response.status, 403);

    const users = await request(baseUrl, "/api/users", {
      headers: authHeader(adminToken),
    });
    assert.equal(users.response.status, 200);
    assert.ok(users.body.length >= 3);

    const invalid = await request(baseUrl, "/api/users", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        name: "Bad Email",
        email: "bad-email",
        password: "123456",
        role: "user",
      }),
    });
    assert.equal(invalid.response.status, 400);
  });

  it("prevents an admin from deleting or demoting their own account", async () => {
    const selfDelete = await request(baseUrl, "/api/users/1", {
      method: "DELETE",
      headers: authHeader(adminToken),
    });
    assert.equal(selfDelete.response.status, 400);
    assert.equal(state.users.find((u) => u.id === 1).deleted_at, null);

    const admin = state.users.find((u) => u.id === 1);
    const selfDemote = await request(baseUrl, "/api/users/1", {
      method: "PUT",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        name: admin.name,
        email: admin.email,
        role: "user",
      }),
    });
    assert.equal(selfDemote.response.status, 400);
    assert.equal(state.users.find((u) => u.id === 1).role, "admin");
  });

  it("locks and unlocks a user account, blocking sign-in and active sessions while locked", async () => {
    const selfLock = await request(baseUrl, "/api/users/1/lock", {
      method: "PATCH",
      headers: authHeader(adminToken),
      body: JSON.stringify({ locked: true }),
    });
    assert.equal(selfLock.response.status, 400);

    const locked = await request(baseUrl, "/api/users/2/lock", {
      method: "PATCH",
      headers: authHeader(adminToken),
      body: JSON.stringify({ locked: true }),
    });
    assert.equal(locked.response.status, 200);
    assert.equal(locked.body.user.is_locked, true);

    const blockedSession = await request(baseUrl, "/api/bookings", {
      headers: authHeader(userToken),
    });
    assert.equal(blockedSession.response.status, 401);

    // The earlier password-reset test already changed this account's
    // password to "newpass123", so re-authenticate with that, not the seed.
    const blockedLogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "newpass123" }),
    });
    assert.equal(blockedLogin.response.status, 403);

    const unlocked = await request(baseUrl, "/api/users/2/lock", {
      method: "PATCH",
      headers: authHeader(adminToken),
      body: JSON.stringify({ locked: false }),
    });
    assert.equal(unlocked.response.status, 200);
    assert.equal(unlocked.body.user.is_locked, false);

    const relogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "newpass123" }),
    });
    assert.equal(relogin.response.status, 200);
    userToken = authCookie(relogin);
  });

  it("forces admin-created users to replace their temporary password", async () => {
    const created = await request(baseUrl, "/api/users", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        name: "Invited User",
        email: "invited@example.com",
        password: "Temporary-Password-42",
        role: "user",
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.user.must_change_password, true);

    const login = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "invited@example.com",
        password: "Temporary-Password-42",
      }),
    });
    const invitedCookie = authCookie(login);

    const blocked = await request(baseUrl, "/api/bookings", {
      headers: authHeader(invitedCookie),
    });
    assert.equal(blocked.response.status, 403);
    assert.equal(blocked.body.code, "PASSWORD_CHANGE_REQUIRED");

    const changed = await request(baseUrl, "/api/users/me/password", {
      method: "PUT",
      headers: authHeader(invitedCookie),
      body: JSON.stringify({
        currentPassword: "Temporary-Password-42",
        newPassword: "Personal-Password-84",
      }),
    });
    assert.equal(changed.response.status, 200);
    const refreshedCookie = authCookie(changed);

    const allowed = await request(baseUrl, "/api/bookings", {
      headers: authHeader(refreshedCookie),
    });
    assert.equal(allowed.response.status, 200);
  });

  it("re-reads current roles and rejects revoked token versions", async () => {
    const admin = state.users.find((item) => item.id === 1);
    admin.role = "user";

    const roleRevoked = await request(baseUrl, "/api/dashboard/stats", {
      headers: authHeader(adminToken),
    });
    assert.equal(roleRevoked.response.status, 403);

    admin.role = "admin";
    admin.token_version += 1;
    const versionRevoked = await request(baseUrl, "/api/dashboard/stats", {
      headers: authHeader(adminToken),
    });
    assert.equal(versionRevoked.response.status, 401);

    admin.token_version -= 1;
  });

  it("rejects expired and incorrectly signed application JWTs", async () => {
    const expired = jwt.sign(
      { id: 1, role: "admin", tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: -1 }
    );
    const forged = jwt.sign(
      { id: 1, role: "admin", tokenVersion: 0 },
      "incorrect-secret",
      { expiresIn: "1h" }
    );

    for (const token of [expired, forged]) {
      const result = await request(baseUrl, "/api/dashboard/stats", {
        headers: { Cookie: `luxestay_session=${token}` },
      });
      assert.equal(result.response.status, 401);
    }
  });

  it("global error responses never expose stack traces", () => {
    const { globalErrorHandler } = require("../src/middleware/errorHandler");
    const sensitiveError = new Error("database password appeared here");
    let status;
    let body;
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      globalErrorHandler(
        sensitiveError,
        { method: "GET", originalUrl: "/api/failure" },
        {
          headersSent: false,
          status(code) { status = code; return this; },
          json(value) { body = value; return this; },
        },
        () => {}
      );
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(status, 500);
    assert.deepEqual(body, { message: "Internal server error" });
    assert.equal(JSON.stringify(body).includes("database password"), false);
    assert.equal(JSON.stringify(body).includes("stack"), false);
  });

  it("uses Secure SameSite=None auth cookies by default in production", () => {
    const { getAuthCookieOptions } = require("../src/services/authSession");
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecure = process.env.AUTH_COOKIE_SECURE;
    const previousSameSite = process.env.AUTH_COOKIE_SAME_SITE;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.AUTH_COOKIE_SECURE;
      delete process.env.AUTH_COOKIE_SAME_SITE;
      const options = getAuthCookieOptions();
      assert.equal(options.httpOnly, true);
      assert.equal(options.secure, true);
      assert.equal(options.sameSite, "none");
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.AUTH_COOKIE_SECURE = previousSecure;
      process.env.AUTH_COOKIE_SAME_SITE = previousSameSite;
    }
  });

  it("lets authenticated users manage their own profile and password", async () => {
    const profile = await request(baseUrl, "/api/users/me", {
      headers: authHeader(userToken),
    });

    assert.equal(profile.response.status, 200);
    assert.equal(profile.body.email, "user@example.com");
    assert.equal(profile.body.password, undefined);

    const duplicateEmail = await request(baseUrl, "/api/users/me", {
      method: "PUT",
      headers: authHeader(userToken),
      body: JSON.stringify({
        name: "Normal User",
        email: "admin@example.com",
      }),
    });

    assert.equal(duplicateEmail.response.status, 400);

    const updated = await request(baseUrl, "/api/users/me", {
      method: "PUT",
      headers: authHeader(userToken),
      body: JSON.stringify({
        name: "Profile User",
        email: "profile@example.com",
        role: "admin",
        phone: "0912345678",
        bio: "Booking guest",
        avatar_url: "https://example.com/avatar.png",
      }),
    });

    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.user.name, "Profile User");
    assert.equal(updated.body.user.email, "profile@example.com");
    assert.equal(updated.body.user.role, "user");
    assert.equal(updated.body.user.phone, "0912345678");
    assert.equal(updated.body.user.password, undefined);

    const weakPassword = await request(baseUrl, "/api/users/me/password", {
      method: "PUT",
      headers: authHeader(userToken),
      body: JSON.stringify({
        currentPassword: "newpass123",
        newPassword: "alllowercase",
      }),
    });
    assert.equal(weakPassword.response.status, 400);
    assert.match(weakPassword.body.message, /letters and numbers/);

    const wrongPassword = await request(baseUrl, "/api/users/me/password", {
      method: "PUT",
      headers: authHeader(userToken),
      body: JSON.stringify({
        currentPassword: "wrong-password",
        newPassword: "profilepass123",
      }),
    });

    assert.equal(wrongPassword.response.status, 400);

    const previousSession = userToken;
    const changedPassword = await request(baseUrl, "/api/users/me/password", {
      method: "PUT",
      headers: authHeader(userToken),
      body: JSON.stringify({
        currentPassword: "newpass123",
        newPassword: "profilepass123",
      }),
    });

    assert.equal(changedPassword.response.status, 200);
    authCookie(changedPassword);

    const revokedSession = await request(baseUrl, "/api/bookings", {
      headers: authHeader(previousSession),
    });
    assert.equal(revokedSession.response.status, 401);

    const oldLogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "profile@example.com",
        password: "newpass123",
      }),
    });
    assert.equal(oldLogin.response.status, 401);

    const newLogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: "profile@example.com",
        password: "profilepass123",
      }),
    });
    assert.equal(newLogin.response.status, 200);
    assert.equal(newLogin.body.user.password, undefined);
    userToken = authCookie(newLogin);
  });

  it("lets any authenticated user upload and replace their own avatar", async () => {
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5uEAAAAASUVORK5CYII=",
      "base64"
    );

    const forgedForm = new FormData();
    forgedForm.append(
      "image",
      new Blob([Buffer.from("<html>not an image</html>")], { type: "image/png" }),
      "forged.html"
    );
    const forgedResponse = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: "POST",
      headers: authHeader(userToken),
      body: forgedForm,
    });
    assert.equal(forgedResponse.status, 400);

    const form = new FormData();
    form.append("image", new Blob([pngBytes], { type: "image/png" }), "avatar.png");
    const uploaded = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: "POST",
      headers: authHeader(userToken),
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();
    assert.match(uploadedBody.avatarUrl, /\/uploads\/avatars\/[0-9a-f-]+\.png$/i);

    const firstFilename = new URL(uploadedBody.avatarUrl).pathname.split("/").pop();

    const saveProfile = await request(baseUrl, "/api/users/me", {
      method: "PUT",
      headers: authHeader(userToken),
      body: JSON.stringify({
        name: "Profile User",
        email: "profile@example.com",
        avatar_url: uploadedBody.avatarUrl,
      }),
    });
    assert.equal(saveProfile.response.status, 200);
    assert.equal(saveProfile.body.user.avatar_url, uploadedBody.avatarUrl);

    // Replacing the avatar again must clean up the previous local file
    // instead of leaving it orphaned in uploads/avatars.
    const secondForm = new FormData();
    secondForm.append("image", new Blob([pngBytes], { type: "image/png" }), "avatar2.png");
    const secondUpload = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: "POST",
      headers: authHeader(userToken),
      body: secondForm,
    });
    const secondBody = await secondUpload.json();

    await request(baseUrl, "/api/users/me", {
      method: "PUT",
      headers: authHeader(userToken),
      body: JSON.stringify({
        name: "Profile User",
        email: "profile@example.com",
        avatar_url: secondBody.avatarUrl,
      }),
    });

    await assert.rejects(() =>
      fs.access(path.join(__dirname, "../uploads/avatars", firstFilename))
    );

    const secondFilename = new URL(secondBody.avatarUrl).pathname.split("/").pop();
    await fs.unlink(path.join(__dirname, "../uploads/avatars", secondFilename)).catch(() => {});
  });

  it("returns dashboard stats for admin only", async () => {
    const forbidden = await request(baseUrl, "/api/dashboard/stats", {
      headers: authHeader(userToken),
    });
    assert.equal(forbidden.response.status, 403);

    const stats = await request(baseUrl, "/api/dashboard/stats", {
      headers: authHeader(adminToken),
    });
    assert.equal(stats.response.status, 200);
    assert.equal(stats.body.totalRooms, 3);
    assert.ok(stats.body.totalUsers >= 3);
    assert.ok(stats.body.totalBookings >= 2);
  });

  it("returns dashboard analytics for admin only", async () => {
    const forbidden = await request(baseUrl, "/api/dashboard/analytics", {
      headers: authHeader(userToken),
    });
    assert.equal(forbidden.response.status, 403);

    const analytics = await request(baseUrl, "/api/dashboard/analytics", {
      headers: authHeader(adminToken),
    });

    assert.equal(analytics.response.status, 200);
    assert.equal(analytics.body.revenueByMonth.length, 12);
    assert.equal(analytics.body.bookingsByMonth.length, 12);
    assert.ok(
      analytics.body.bookingsByStatus.some((item) => item.status === "confirmed")
    );
    assert.ok(analytics.body.topRooms.length > 0);
    assert.equal(analytics.body.occupancy.totalRooms, state.rooms.length);
    assert.equal(typeof analytics.body.occupancy.occupancyRate, "number");
    assert.ok(Array.isArray(analytics.body.recentBookings));
  });

  it("buckets dashboard analytics by the requested time range instead of a hardcoded year", async () => {
    const today = await request(baseUrl, "/api/dashboard/analytics?range=today", {
      headers: authHeader(adminToken),
    });
    assert.equal(today.response.status, 200);
    assert.equal(today.body.range, "today");
    assert.equal(today.body.revenueByMonth.length, 24);
    assert.equal(today.body.bookingsByMonth.length, 24);
    assert.match(today.body.revenueByMonth[0].month, /^\d{2}:00$/);

    const week = await request(baseUrl, "/api/dashboard/analytics?range=week", {
      headers: authHeader(adminToken),
    });
    assert.equal(week.response.status, 200);
    assert.equal(week.body.range, "week");
    assert.equal(week.body.revenueByMonth.length, 7);

    const month = await request(baseUrl, "/api/dashboard/analytics?range=month", {
      headers: authHeader(adminToken),
    });
    assert.equal(month.response.status, 200);
    assert.equal(month.body.range, "month");
    assert.ok(month.body.revenueByMonth.length >= 28);

    const invalidRange = await request(
      baseUrl,
      "/api/dashboard/analytics?range=decade",
      { headers: authHeader(adminToken) }
    );
    assert.equal(invalidRange.response.status, 200);
    assert.equal(invalidRange.body.range, "year");
  });

  it("scopes dashboard stats totals to the requested range", async () => {
    const allTime = await request(baseUrl, "/api/dashboard/stats", {
      headers: authHeader(adminToken),
    });
    assert.equal(allTime.body.range, "all");
    assert.equal(allTime.body.totalBookings, state.bookings.length);

    const todayOnly = await request(
      baseUrl,
      "/api/dashboard/stats?range=today",
      { headers: authHeader(adminToken) }
    );
    assert.equal(todayOnly.response.status, 200);
    assert.equal(todayOnly.body.range, "today");
    assert.ok(todayOnly.body.totalBookings <= allTime.body.totalBookings);
    assert.equal(todayOnly.body.totalRooms, state.rooms.length);
  });

  it("allows only the exact configured CORS origin for cookie mutations", async () => {
    const allowed = await fetch(`${baseUrl}/api/rooms`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(
      allowed.headers.get("access-control-allow-origin"),
      "http://localhost:5173"
    );

    const blocked = await request(baseUrl, "/api/rooms", {
      method: "POST",
      headers: {
        ...authHeader(adminToken),
        Origin: "https://attacker.vercel.app",
      },
      body: JSON.stringify({
        room_name: "CSRF Room",
        room_type: "Invalid",
        price: 1,
        capacity: 1,
      }),
    });
    assert.equal(blocked.response.status, 403);
  });

  it("scopes bookings by role and validates booking payloads", async () => {
    const noToken = await request(baseUrl, "/api/bookings");
    assert.equal(noToken.response.status, 401);

    const userBookings = await request(baseUrl, "/api/bookings", {
      headers: authHeader(userToken),
    });
    assert.equal(userBookings.response.status, 200);
    assert.equal(userBookings.body[0].room_capacity, 4);
    assert.equal(userBookings.body[0].room_price, 200);
    assert.deepEqual(
      userBookings.body.map((item) => item.user_id),
      [2]
    );

    const invalid = await request(baseUrl, "/api/bookings", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({
        room_id: 1,
      }),
    });
    assert.equal(invalid.response.status, 400);

    const created = await request(baseUrl, "/api/bookings", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({
        room_id: 1,
        check_in: "2099-03-01",
        check_out: "2099-03-03",
        guests: 2,
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.nights, 2);
    assert.equal(created.body.total_price, 200);
    assert.equal(created.body.booking.guests, 2);

    const overlapping = await request(baseUrl, "/api/bookings", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({
        room_id: 1,
        check_in: "2099-03-02",
        check_out: "2099-03-04",
        guests: 1,
      }),
    });
    assert.equal(overlapping.response.status, 400);
    assert.match(overlapping.body.message, /trùng/);
  });

  it("returns 400 for invalid room and booking ids", async () => {
    const room = await request(baseUrl, "/api/rooms/not-a-number");
    assert.equal(room.response.status, 400);

    const booking = await request(baseUrl, "/api/bookings/not-a-number", {
      headers: authHeader(userToken),
    });
    assert.equal(booking.response.status, 400);
  });

  it("lets admins update booking status and users cancel own bookings", async () => {
    const updated = await request(baseUrl, "/api/bookings/1", {
      method: "PUT",
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: "completed" }),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.booking.status, "completed");

    const cancelled = await request(baseUrl, "/api/bookings/3/cancel", {
      method: "PATCH",
      headers: authHeader(userToken),
    });
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.body.booking.status, "cancelled");
  });

  it("rejects invalid booking status transitions", async () => {
    const invalidTransition = await request(baseUrl, "/api/bookings/1", {
      method: "PUT",
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: "pending" }),
    });
    assert.equal(invalidTransition.response.status, 400);
    assert.match(invalidTransition.body.message, /completed/);

    const stillCompleted = await request(baseUrl, "/api/bookings/1", {
      headers: authHeader(adminToken),
    });
    assert.equal(stillCompleted.body.status, "completed");
  });

  it("filters and paginates booking history", async () => {
    const pendingOnly = await request(
      baseUrl,
      "/api/bookings?status=pending&page=1&limit=10",
      { headers: authHeader(adminToken) }
    );
    assert.equal(pendingOnly.response.status, 200);
    assert.ok(Array.isArray(pendingOnly.body.data));
    assert.ok(pendingOnly.body.data.every((item) => item.status === "pending"));
    assert.equal(pendingOnly.body.page, 1);

    const firstPage = await request(baseUrl, "/api/bookings?page=1&limit=1", {
      headers: authHeader(adminToken),
    });
    assert.equal(firstPage.response.status, 200);
    assert.equal(firstPage.body.data.length, 1);
    assert.equal(firstPage.body.total, state.bookings.length);
    assert.equal(
      firstPage.body.totalPages,
      Math.ceil(state.bookings.length / 1)
    );
  });

  function signVnpayTestParams(params, secret) {
    const sorted = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
      .sort()
      .reduce((acc, k) => {
        acc[k] = params[k];
        return acc;
      }, {});
    const signData = new URLSearchParams(sorted).toString();
    return crypto.createHmac("sha512", secret).update(signData, "utf-8").digest("hex");
  }

  function buildVnpayIpnQuery(overrides, { forceHash } = {}) {
    const base = {
      vnp_Amount: "20000",
      vnp_BankCode: "NCB",
      vnp_OrderInfo: "Thanh toan booking",
      vnp_TmnCode: process.env.VNPAY_TMN_CODE,
      vnp_TransactionNo: "14123456",
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "00",
      vnp_TxnRef: "REF",
      vnp_PayDate: "20990101101010",
      ...overrides,
    };
    const hash = forceHash !== undefined
      ? forceHash
      : signVnpayTestParams(base, process.env.VNPAY_HASH_SECRET);
    return new URLSearchParams({ ...base, vnp_SecureHash: hash }).toString();
  }

  function signMomoTestBody(fields, secret) {
    const raw =
      `accessKey=${process.env.MOMO_ACCESS_KEY}&amount=${fields.amount}&extraData=${fields.extraData}` +
      `&message=${fields.message}&orderId=${fields.orderId}&orderInfo=${fields.orderInfo}` +
      `&orderType=${fields.orderType}&partnerCode=${fields.partnerCode}&payType=${fields.payType}` +
      `&requestId=${fields.requestId}&responseTime=${fields.responseTime}&resultCode=${fields.resultCode}` +
      `&transId=${fields.transId}`;
    return crypto.createHmac("sha256", secret).update(raw, "utf-8").digest("hex");
  }

  function buildMomoIpnBody(overrides) {
    const base = {
      partnerCode: process.env.MOMO_PARTNER_CODE,
      orderId: "REF",
      requestId: "REF",
      amount: "300",
      orderInfo: "Thanh toan booking",
      orderType: "momo_wallet",
      transId: 987654321,
      resultCode: 0,
      message: "Successful.",
      payType: "qr",
      responseTime: Date.now(),
      extraData: "",
      ...overrides,
    };
    const signature = signMomoTestBody(base, process.env.MOMO_SECRET_KEY);
    return { ...base, signature };
  }

  function pushPendingBooking(id, overrides = {}) {
    const booking = {
      id,
      user_id: 2,
      room_id: 1,
      check_in: "2099-06-01",
      check_out: "2099-06-03",
      total_price: 200,
      guests: 1,
      status: "pending",
      payment_status: "unpaid",
      expires_at: null,
      created_at: new Date().toISOString(),
      ...overrides,
    };
    state.bookings.push(booking);
    return booking;
  }

  it("creates a VNPay payment request for the booking owner", async () => {
    pushPendingBooking(1002, { total_price: 200 });

    const res = await request(baseUrl, "/api/payments/bookings/1002", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ provider: "vnpay" }),
    });

    assert.equal(res.response.status, 201);
    assert.ok(res.body.payUrl.includes("vnp_TxnRef="));
    assert.ok(res.body.transactionRef);

    const payment = state.payments.find((p) => p.booking_id === 1002);
    assert.ok(payment);
    assert.equal(payment.provider, "vnpay");
    assert.equal(payment.status, "pending");
    assert.equal(state.bookings.find((b) => b.id === 1002).payment_status, "pending");
  });

  it("only offers and accepts MoMo when MOMO_ENABLED is true", async () => {
    pushPendingBooking(1987, { total_price: 300 });

    const enabled = await request(baseUrl, "/api/payments/providers");
    assert.deepEqual(enabled.body.providers, ["vnpay", "momo"]);

    process.env.MOMO_ENABLED = "false";
    try {
      const disabled = await request(baseUrl, "/api/payments/providers");
      assert.deepEqual(disabled.body.providers, ["vnpay"]);

      const res = await request(baseUrl, "/api/payments/bookings/1987", {
        method: "POST",
        headers: authHeader(userToken),
        body: JSON.stringify({ provider: "momo" }),
      });
      assert.equal(res.response.status, 400);
      assert.equal(state.payments.some((p) => p.booking_id === 1987), false);
    } finally {
      process.env.MOMO_ENABLED = "true";
    }
  });

  it("creates a MoMo payment request using the (mocked) create-payment API", async () => {
    pushPendingBooking(1003, { total_price: 300 });

    const res = await request(baseUrl, "/api/payments/bookings/1003", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ provider: "momo" }),
    });

    assert.equal(res.response.status, 201);
    assert.equal(res.body.payUrl, `https://fake-momo-pay.test/pay?orderId=${res.body.transactionRef}`);

    const payment = state.payments.find((p) => p.booking_id === 1003);
    assert.equal(payment.provider, "momo");
    assert.equal(payment.status, "pending");
  });

  it("rejects payment creation for a booking that is not yours (and not admin)", async () => {
    pushPendingBooking(1004, { user_id: 1 });

    const res = await request(baseUrl, "/api/payments/bookings/1004", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ provider: "vnpay" }),
    });

    assert.equal(res.response.status, 403);
  });

  it("rejects payment creation for a booking that is not pending", async () => {
    pushPendingBooking(1005, { status: "confirmed" });

    const res = await request(baseUrl, "/api/payments/bookings/1005", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ provider: "vnpay" }),
    });

    assert.equal(res.response.status, 400);
  });

  it("rejects an unknown payment provider", async () => {
    pushPendingBooking(1006);

    const res = await request(baseUrl, "/api/payments/bookings/1006", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ provider: "paypal" }),
    });

    assert.equal(res.response.status, 400);
  });

  it("confirms a booking via a validly-signed VNPay IPN and rejects a tampered one", async () => {
    pushPendingBooking(1007, { total_price: 500 });

    const created = await request(baseUrl, "/api/payments/bookings/1007", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ provider: "vnpay" }),
    });
    const transactionRef = created.body.transactionRef;

    const tampered = await request(
      baseUrl,
      `/api/payments/vnpay/ipn?${buildVnpayIpnQuery(
        { vnp_TxnRef: transactionRef, vnp_Amount: "50000" },
        { forceHash: "0".repeat(128) }
      )}`
    );
    assert.equal(tampered.body.RspCode, "97");
    assert.equal(state.bookings.find((b) => b.id === 1007).status, "pending");

    const valid = await request(
      baseUrl,
      `/api/payments/vnpay/ipn?${buildVnpayIpnQuery({ vnp_TxnRef: transactionRef, vnp_Amount: "50000" })}`
    );
    assert.equal(valid.body.RspCode, "00");

    const booking = state.bookings.find((b) => b.id === 1007);
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.payment_status, "paid");
    assert.equal(booking.expires_at, null);

    const payment = state.payments.find((p) => p.transaction_ref === transactionRef);
    assert.equal(payment.status, "success");
    assert.equal(payment.provider_transaction_id, "14123456");

    // Replaying the same IPN (VNPay retries until it gets an ack) must not
    // reprocess an already-confirmed order.
    const replay = await request(
      baseUrl,
      `/api/payments/vnpay/ipn?${buildVnpayIpnQuery({ vnp_TxnRef: transactionRef, vnp_Amount: "50000" })}`
    );
    assert.equal(replay.body.RspCode, "02");
  });

  it("marks a VNPay payment failed when the gateway reports a non-success response code", async () => {
    pushPendingBooking(1008, { total_price: 150 });

    const created = await request(baseUrl, "/api/payments/bookings/1008", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ provider: "vnpay" }),
    });
    const transactionRef = created.body.transactionRef;

    const failed = await request(
      baseUrl,
      `/api/payments/vnpay/ipn?${buildVnpayIpnQuery({
        vnp_TxnRef: transactionRef,
        vnp_Amount: "15000",
        vnp_ResponseCode: "24",
        vnp_TransactionStatus: "02",
      })}`
    );
    assert.equal(failed.body.RspCode, "00");

    const booking = state.bookings.find((b) => b.id === 1008);
    assert.equal(booking.status, "pending");
    assert.equal(booking.payment_status, "failed");
  });

  it("confirms a booking via a validly-signed MoMo IPN and rejects a tampered one", async () => {
    pushPendingBooking(1009, { total_price: 300 });

    const created = await request(baseUrl, "/api/payments/bookings/1009", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ provider: "momo" }),
    });
    const transactionRef = created.body.transactionRef;

    const tampered = await request(baseUrl, "/api/payments/momo/ipn", {
      method: "POST",
      body: JSON.stringify({
        ...buildMomoIpnBody({ orderId: transactionRef, requestId: transactionRef, amount: "300" }),
        signature: "invalid-signature",
      }),
    });
    assert.equal(tampered.response.status, 400);
    assert.equal(state.bookings.find((b) => b.id === 1009).status, "pending");

    const valid = await request(baseUrl, "/api/payments/momo/ipn", {
      method: "POST",
      body: JSON.stringify(
        buildMomoIpnBody({ orderId: transactionRef, requestId: transactionRef, amount: "300" })
      ),
    });
    assert.equal(valid.response.status, 204);

    const booking = state.bookings.find((b) => b.id === 1009);
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.payment_status, "paid");

    const payment = state.payments.find((p) => p.transaction_ref === transactionRef);
    assert.equal(payment.status, "success");
  });

  it("returns the latest payment for a booking, scoped to owner or admin", async () => {
    pushPendingBooking(1010, { total_price: 250 });

    await request(baseUrl, "/api/payments/bookings/1010", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ provider: "vnpay" }),
    });

    const asOwner = await request(baseUrl, "/api/payments/bookings/1010", {
      headers: authHeader(userToken),
    });
    assert.equal(asOwner.response.status, 200);
    assert.equal(asOwner.body.payment.status, "pending");

    const asAdmin = await request(baseUrl, "/api/payments/bookings/1010", {
      headers: authHeader(adminToken),
    });
    assert.equal(asAdmin.response.status, 200);
    assert.equal(asAdmin.body.payment.provider, "vnpay");
  });

  it("looks up a payment by transaction ref for the payment-result page, scoped to owner or admin", async () => {
    pushPendingBooking(1011, { total_price: 175, user_id: 1 });

    const created = await request(baseUrl, "/api/payments/bookings/1011", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({ provider: "momo" }),
    });
    const ref = created.body.transactionRef;

    const forbidden = await request(baseUrl, `/api/payments/transactions/${ref}`, {
      headers: authHeader(userToken),
    });
    assert.equal(forbidden.response.status, 403);

    const asAdmin = await request(baseUrl, `/api/payments/transactions/${ref}`, {
      headers: authHeader(adminToken),
    });
    assert.equal(asAdmin.response.status, 200);
    assert.equal(asAdmin.body.payment.transaction_ref, ref);
    assert.equal(asAdmin.body.bookingStatus, "pending");

    const notFound = await request(baseUrl, "/api/payments/transactions/does-not-exist", {
      headers: authHeader(adminToken),
    });
    assert.equal(notFound.response.status, 404);
  });

  it("lets a user review a completed booking, enforcing ownership, room match, completed status, and no duplicates", async () => {
    const created = await request(baseUrl, "/api/bookings", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({
        room_id: 1,
        check_in: "2099-07-01",
        check_out: "2099-07-03",
        guests: 1,
      }),
    });
    assert.equal(created.response.status, 201);
    const bookingId = created.body.booking.id;

    const tooEarly = await request(baseUrl, "/api/rooms/1/reviews", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ booking_id: bookingId, rating: 5 }),
    });
    assert.equal(tooEarly.response.status, 400);
    assert.match(tooEarly.body.message, /hoàn tất/);

    await request(baseUrl, `/api/bookings/${bookingId}`, {
      method: "PUT",
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: "confirmed" }),
    });
    const completed = await request(baseUrl, `/api/bookings/${bookingId}`, {
      method: "PUT",
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: "completed" }),
    });
    assert.equal(completed.response.status, 200);

    const notOwner = await request(baseUrl, "/api/rooms/1/reviews", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({ booking_id: bookingId, rating: 4 }),
    });
    assert.equal(notOwner.response.status, 403);

    const wrongRoom = await request(baseUrl, "/api/rooms/2/reviews", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ booking_id: bookingId, rating: 4 }),
    });
    assert.equal(wrongRoom.response.status, 400);

    const badRating = await request(baseUrl, "/api/rooms/1/reviews", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ booking_id: bookingId, rating: 6 }),
    });
    assert.equal(badRating.response.status, 400);

    const success = await request(baseUrl, "/api/rooms/1/reviews", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ booking_id: bookingId, rating: 5, comment: "Tuyệt vời!" }),
    });
    assert.equal(success.response.status, 201);
    assert.equal(success.body.review.rating, 5);

    const duplicate = await request(baseUrl, "/api/rooms/1/reviews", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ booking_id: bookingId, rating: 3 }),
    });
    assert.equal(duplicate.response.status, 409);

    const bookingDetail = await request(baseUrl, `/api/bookings/${bookingId}`, {
      headers: authHeader(userToken),
    });
    assert.equal(bookingDetail.body.has_review, true);
  });

  it("lists public room reviews with an average rating and hides moderated ones from the public endpoint", async () => {
    const list = await request(baseUrl, "/api/rooms/1/reviews");
    assert.equal(list.response.status, 200);
    assert.equal(list.body.totalReviews, 1);
    assert.equal(list.body.averageRating, 5);
    assert.equal(list.body.data[0].comment, "Tuyệt vời!");
    // Reviewer's full name is masked to first name + last-name initials (e.g.
    // "Profile Update" -> "Profile U."), not published in full.
    assert.match(list.body.data[0].reviewer_name, /^\S+( \S\.)+$/);

    const reviewId = list.body.data[0].id;

    const forbiddenHide = await request(baseUrl, `/api/reviews/${reviewId}/hide`, {
      method: "PATCH",
      headers: authHeader(userToken),
      body: JSON.stringify({ hidden: true }),
    });
    assert.equal(forbiddenHide.response.status, 403);

    const hidden = await request(baseUrl, `/api/reviews/${reviewId}/hide`, {
      method: "PATCH",
      headers: authHeader(adminToken),
      body: JSON.stringify({ hidden: true }),
    });
    assert.equal(hidden.response.status, 200);
    assert.equal(hidden.body.review.is_hidden, true);

    const afterHide = await request(baseUrl, "/api/rooms/1/reviews");
    assert.equal(afterHide.body.totalReviews, 0);
    assert.equal(afterHide.body.data.length, 0);

    const forbiddenList = await request(baseUrl, "/api/reviews", {
      headers: authHeader(userToken),
    });
    assert.equal(forbiddenList.response.status, 403);

    const adminList = await request(baseUrl, "/api/reviews?roomId=1", {
      headers: authHeader(adminToken),
    });
    assert.equal(adminList.response.status, 200);
    assert.equal(adminList.body.data.length, 1);
    assert.equal(adminList.body.data[0].is_hidden, true);

    const unhidden = await request(baseUrl, `/api/reviews/${reviewId}/hide`, {
      method: "PATCH",
      headers: authHeader(adminToken),
      body: JSON.stringify({ hidden: false }),
    });
    assert.equal(unhidden.response.status, 200);
    assert.equal(unhidden.body.review.is_hidden, false);
  });

  it("returns a per-day booking calendar for one room, admin only", async () => {
    const noToken = await request(baseUrl, "/api/bookings/calendar?roomId=2&year=2099&month=1");
    assert.equal(noToken.response.status, 401);

    const forbidden = await request(baseUrl, "/api/bookings/calendar?roomId=2&year=2099&month=1", {
      headers: authHeader(userToken),
    });
    assert.equal(forbidden.response.status, 403);

    const badRoom = await request(baseUrl, "/api/bookings/calendar?roomId=abc&year=2099&month=1", {
      headers: authHeader(adminToken),
    });
    assert.equal(badRoom.response.status, 400);

    const badMonth = await request(baseUrl, "/api/bookings/calendar?roomId=2&year=2099&month=13", {
      headers: authHeader(adminToken),
    });
    assert.equal(badMonth.response.status, 400);

    const missingRoom = await request(baseUrl, "/api/bookings/calendar?roomId=99999&year=2099&month=1", {
      headers: authHeader(adminToken),
    });
    assert.equal(missingRoom.response.status, 404);

    const ok = await request(baseUrl, "/api/bookings/calendar?roomId=2&year=2099&month=1", {
      headers: authHeader(adminToken),
    });
    assert.equal(ok.response.status, 200);
    assert.equal(ok.body.room.id, 2);
    assert.equal(ok.body.daysInMonth, 31);

    // Fixture booking #1 on room 2: check_in 2099-01-10, check_out
    // 2099-01-12 (checkout day itself is free, not occupied).
    assert.equal(ok.body.days["2099-01-10"].status, "completed");
    assert.equal(ok.body.days["2099-01-10"].bookingId, 1);
    assert.equal(ok.body.days["2099-01-11"].status, "completed");
    assert.equal(ok.body.days["2099-01-12"], undefined);
    assert.equal(ok.body.days["2099-01-09"], undefined);

    const booking1 = ok.body.bookings.find((b) => b.id === 1);
    assert.ok(booking1);
    assert.equal(booking1.status, "completed");
    assert.ok(booking1.user_name);
    assert.ok(booking1.user_email);
  });

  it("creates, lists, and edits coupons with admin-only access and input validation", async () => {
    const forbiddenCreate = await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({
        code: "TEST10",
        discount_type: "percent",
        discount_value: 10,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    assert.equal(forbiddenCreate.response.status, 403);

    const badPercent = await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "BADPCT",
        discount_type: "percent",
        discount_value: 150,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    assert.equal(badPercent.response.status, 400);

    const missingExpiry = await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({ code: "NOEXPIRY", discount_type: "fixed", discount_value: 50000 }),
    });
    assert.equal(missingExpiry.response.status, 400);

    const created = await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "summer10",
        discount_type: "percent",
        discount_value: 10,
        max_discount_amount: 15,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.coupon.code, "SUMMER10");
    const couponId = created.body.coupon.id;

    const duplicate = await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "SUMMER10",
        discount_type: "fixed",
        discount_value: 10000,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    assert.equal(duplicate.response.status, 409);

    const forbiddenList = await request(baseUrl, "/api/coupons", { headers: authHeader(userToken) });
    assert.equal(forbiddenList.response.status, 403);

    const list = await request(baseUrl, "/api/coupons", { headers: authHeader(adminToken) });
    assert.equal(list.response.status, 200);
    assert.ok(list.body.some((c) => c.id === couponId));

    const updated = await request(baseUrl, `/api/coupons/${couponId}`, {
      method: "PUT",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "SUMMER10",
        discount_type: "percent",
        discount_value: 20,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(Number(updated.body.coupon.discount_value), 20);
  });

  it("validates coupons and rejects expired/inactive/exhausted/unmet-minimum ones", async () => {
    const percentCoupon = await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "PCTCAP",
        discount_type: "percent",
        discount_value: 10,
        max_discount_amount: 15,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    assert.equal(percentCoupon.response.status, 201);

    // 10% of 500 = 50, but max_discount_amount caps it at 15.
    const valid = await request(baseUrl, "/api/coupons/validate", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ code: "pctcap", amount: 500 }),
    });
    assert.equal(valid.response.status, 200);
    assert.equal(valid.body.valid, true);
    assert.equal(valid.body.discountAmount, 15);
    assert.equal(valid.body.finalAmount, 485);

    const unknown = await request(baseUrl, "/api/coupons/validate", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ code: "DOESNOTEXIST", amount: 500 }),
    });
    assert.equal(unknown.response.status, 404);
    assert.equal(unknown.body.valid, false);

    await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "MINAMT",
        discount_type: "fixed",
        discount_value: 20,
        min_booking_amount: 1000,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    const belowMin = await request(baseUrl, "/api/coupons/validate", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ code: "MINAMT", amount: 500 }),
    });
    assert.equal(belowMin.response.status, 400);
    assert.equal(belowMin.body.valid, false);

    await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "EXPIRED1",
        discount_type: "fixed",
        discount_value: 10,
        expires_at: "2020-01-01T00:00:00Z",
      }),
    });
    const expiredCheck = await request(baseUrl, "/api/coupons/validate", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ code: "EXPIRED1", amount: 500 }),
    });
    assert.equal(expiredCheck.response.status, 400);
    assert.match(expiredCheck.body.message, /hết hạn/);

    const deactivateCoupon = await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "OFFSWITCH",
        discount_type: "fixed",
        discount_value: 10,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    const offId = deactivateCoupon.body.coupon.id;

    const forbiddenToggle = await request(baseUrl, `/api/coupons/${offId}/active`, {
      method: "PATCH",
      headers: authHeader(userToken),
      body: JSON.stringify({ active: false }),
    });
    assert.equal(forbiddenToggle.response.status, 403);

    const toggled = await request(baseUrl, `/api/coupons/${offId}/active`, {
      method: "PATCH",
      headers: authHeader(adminToken),
      body: JSON.stringify({ active: false }),
    });
    assert.equal(toggled.response.status, 200);
    assert.equal(toggled.body.coupon.is_active, false);

    const inactiveCheck = await request(baseUrl, "/api/coupons/validate", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({ code: "OFFSWITCH", amount: 500 }),
    });
    assert.equal(inactiveCheck.response.status, 400);
    assert.match(inactiveCheck.body.message, /vô hiệu hóa/);
  });

  it("applies a coupon when creating a booking, recalculating the discount server-side (never trusting the client)", async () => {
    const coupon = await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "BOOK5K",
        discount_type: "fixed",
        discount_value: 50,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    assert.equal(coupon.response.status, 201);

    // Room 1 costs 100/night in the fixture -> 2 nights = 200 subtotal.
    const booked = await request(baseUrl, "/api/bookings", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({
        room_id: 1,
        check_in: "2099-10-01",
        check_out: "2099-10-03",
        guests: 1,
        coupon_code: "book5k",
      }),
    });
    assert.equal(booked.response.status, 201);
    assert.equal(booked.body.subtotal, 200);
    assert.equal(booked.body.discount_amount, 50);
    assert.equal(booked.body.total_price, 150);
    assert.equal(Number(booked.body.booking.discount_amount), 50);

    // A fabricated/unknown coupon code must be rejected outright, not
    // silently ignored or trusted for a discount.
    const forged = await request(baseUrl, "/api/bookings", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({
        room_id: 1,
        check_in: "2099-10-05",
        check_out: "2099-10-07",
        guests: 1,
        coupon_code: "NOT-A-REAL-CODE",
      }),
    });
    assert.equal(forged.response.status, 404);
  });

  it("never lets a coupon's used_count exceed its usage_limit across repeated bookings", async () => {
    const coupon = await request(baseUrl, "/api/coupons", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        code: "LASTUSE",
        discount_type: "fixed",
        discount_value: 10,
        usage_limit: 1,
        expires_at: "2099-12-31T00:00:00Z",
      }),
    });
    assert.equal(coupon.response.status, 201);

    const first = await request(baseUrl, "/api/bookings", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({
        room_id: 1,
        check_in: "2099-11-01",
        check_out: "2099-11-02",
        guests: 1,
        coupon_code: "lastuse",
      }),
    });
    assert.equal(first.response.status, 201);

    const second = await request(baseUrl, "/api/bookings", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        room_id: 1,
        check_in: "2099-11-05",
        check_out: "2099-11-06",
        guests: 1,
        coupon_code: "lastuse",
      }),
    });
    assert.equal(second.response.status, 400);
    assert.match(second.body.message, /hết lượt/);

    const list = await request(baseUrl, "/api/coupons", { headers: authHeader(adminToken) });
    const found = list.body.find((c) => c.code === "LASTUSE");
    assert.equal(found.used_count, 1);
  });

  it("exports the dashboard report as a downloadable xlsx or pdf file, admin only", async () => {
    const forbidden = await request(baseUrl, "/api/dashboard/export?range=month&format=xlsx", {
      headers: authHeader(userToken),
    });
    assert.equal(forbidden.response.status, 403);

    const badFormat = await request(baseUrl, "/api/dashboard/export?range=month&format=doc", {
      headers: authHeader(adminToken),
    });
    assert.equal(badFormat.response.status, 400);

    // The export endpoint streams a real binary file, not JSON, so this
    // uses fetch directly instead of the request() helper (which always
    // tries to JSON.parse the body).
    const xlsxRes = await fetch(`${baseUrl}/api/dashboard/export?range=month&format=xlsx`, {
      headers: authHeader(adminToken),
    });
    assert.equal(xlsxRes.status, 200);
    assert.match(xlsxRes.headers.get("content-type"), /spreadsheetml/);
    assert.match(
      xlsxRes.headers.get("content-disposition"),
      /attachment; filename="luxestay-dashboard-month-.*\.xlsx"/
    );
    const xlsxBuffer = Buffer.from(await xlsxRes.arrayBuffer());
    assert.ok(xlsxBuffer.length > 0);
    assert.equal(xlsxBuffer.subarray(0, 2).toString("hex"), "504b", "xlsx is a ZIP file (magic bytes PK)");

    const pdfRes = await fetch(`${baseUrl}/api/dashboard/export?range=all&format=pdf`, {
      headers: authHeader(adminToken),
    });
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers.get("content-type"), "application/pdf");
    assert.match(
      pdfRes.headers.get("content-disposition"),
      /attachment; filename="luxestay-dashboard-all-.*\.pdf"/
    );
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    assert.equal(pdfBuffer.subarray(0, 4).toString("ascii"), "%PDF");
  });

  it("authenticates socket.io connections via the session cookie, and only broadcasts booking:created to admins", async () => {
    const connect = (token) =>
      ioClient(baseUrl, {
        extraHeaders: token ? { Cookie: token } : undefined,
        reconnection: false,
        forceNew: true,
      });

    // No session cookie at all -> rejected by the io.use() auth middleware.
    const anon = connect(null);
    const anonOutcome = await new Promise((resolve) => {
      anon.on("connect_error", (err) => resolve({ ok: false, message: err.message }));
      anon.on("connect", () => resolve({ ok: true }));
    });
    anon.close();
    assert.equal(anonOutcome.ok, false);
    assert.equal(anonOutcome.message, "unauthorized");

    // A logged-in non-admin connects fine (valid session) but must not be
    // in the "admins" room, so it should never receive booking:created.
    const userSocket = connect(userToken);
    await new Promise((resolve, reject) => {
      userSocket.once("connect", resolve);
      userSocket.once("connect_error", reject);
    });
    const userReceivedEvent = new Promise((resolve) => {
      userSocket.once("booking:created", () => resolve(true));
    });

    const adminSocket = connect(adminToken);
    await new Promise((resolve, reject) => {
      adminSocket.once("connect", resolve);
      adminSocket.once("connect_error", reject);
    });
    const adminReceivedEvent = new Promise((resolve) => {
      adminSocket.once("booking:created", resolve);
    });

    const created = await request(baseUrl, "/api/bookings", {
      method: "POST",
      headers: authHeader(userToken),
      body: JSON.stringify({
        room_id: 1,
        check_in: "2099-12-20",
        check_out: "2099-12-22",
        guests: 1,
      }),
    });
    assert.equal(created.response.status, 201);

    const emittedBooking = await Promise.race([
      adminReceivedEvent,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("timed out waiting for booking:created")), 3000)
      ),
    ]);
    assert.equal(emittedBooking.id, created.body.booking.id);
    assert.equal(emittedBooking.room_name, "Deluxe Room");
    assert.equal(emittedBooking.status, "pending");

    const userGotEvent = await Promise.race([
      userReceivedEvent,
      new Promise((resolve) => setTimeout(() => resolve(false), 300)),
    ]);
    assert.equal(userGotEvent, false, "non-admin sockets must not receive admin booking events");

    userSocket.close();
    adminSocket.close();
  });

  it("soft deletes users without deleting booking history", async () => {
    const bookingsBefore = state.bookings.filter((item) => item.user_id === 2).length;
    const deleted = await request(baseUrl, "/api/users/2", {
      method: "DELETE",
      headers: authHeader(adminToken),
    });
    assert.equal(deleted.response.status, 200);
    assert.ok(state.users.find((item) => item.id === 2).deleted_at);
    assert.equal(
      state.bookings.filter((item) => item.user_id === 2).length,
      bookingsBefore
    );
  });
});
