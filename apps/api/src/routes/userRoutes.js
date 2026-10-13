const express = require("express");
const router = express.Router();

const {
  getUsers,
  getUserById,
  getCurrentUser,
  createUser,
  updateUser,
  updateCurrentUser,
  changeCurrentUserPassword,
  deleteUser,
  setUserLock,
} = require("../controller/userController.js");
const { uploadAvatar } = require("../controller/uploadController.js");
const { handleAvatarUpload } = require("../middleware/avatarUpload.js");

const {
  verifyToken,
  checkRole,
} = require("../middleware/authMiddleware");
const { passwordCheckRateLimit, uploadRateLimit } = require("../middleware/rateLimit");

// Chỉ admin mới được xem danh sách user
router.get("/users", verifyToken, checkRole("admin"), getUsers);
router.get("/users/me", verifyToken, getCurrentUser);
router.put("/users/me", verifyToken, passwordCheckRateLimit, updateCurrentUser);
router.put("/users/me/password", verifyToken, passwordCheckRateLimit, changeCurrentUserPassword);
router.post("/users/me/avatar", verifyToken, uploadRateLimit, handleAvatarUpload, uploadAvatar);

// Chỉ admin mới được xem chi tiết user
router.get("/users/:id", verifyToken, checkRole("admin"), getUserById);

// Chỉ admin mới được tạo user
router.post("/users", verifyToken, checkRole("admin"), createUser);

// Chỉ admin mới được sửa user
router.put("/users/:id", verifyToken, checkRole("admin"), updateUser);

// Chỉ admin mới được xóa user
router.delete("/users/:id", verifyToken, checkRole("admin"), deleteUser);

// Chỉ admin mới được khóa/mở khóa user
router.patch("/users/:id/lock", verifyToken, checkRole("admin"), setUserLock);

module.exports = router;
