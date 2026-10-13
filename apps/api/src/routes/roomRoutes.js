const express = require("express");
const router = express.Router();

const {
  getRooms,
  getRoomLocations,
  getRoomFilters,
  getRoomTypes,
  getRoomDestinations,
  getRoomAvailability,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  addRoomImage,
  deleteRoomImage,
  getRoomStatusCounts,
  reorderRoomImages,
  setRoomCover,
} = require("../controller/roomController.js");
const { createReview, getRoomReviews } = require("../controller/reviewController.js");
const { uploadRoomImage: uploadRoomImageController } = require("../controller/uploadController.js");
const { handleRoomImageUpload } = require("../middleware/roomImageUpload.js");

const { verifyToken, checkRole } = require("../middleware/authMiddleware");

// Ai cũng xem được danh sách phòng (khách chưa đăng nhập vẫn cần duyệt phòng)
router.get("/", getRooms);
router.get("/locations", getRoomLocations);
router.get("/filters", getRoomFilters);
router.get("/types", verifyToken, checkRole("admin"), getRoomTypes);
router.get("/status-counts", verifyToken, checkRole("admin"), getRoomStatusCounts);
router.get("/destinations", getRoomDestinations);
router.get("/:id/availability", getRoomAvailability);
router.get("/:id", getRoomById);

// Chỉ admin mới được thêm/sửa/xóa phòng
router.post(
  "/upload-image",
  verifyToken,
  checkRole("admin"),
  handleRoomImageUpload,
  uploadRoomImageController
);
router.post("/", verifyToken, checkRole("admin"), createRoom);
router.put("/:id", verifyToken, checkRole("admin"), updateRoom);
router.delete("/:id", verifyToken, checkRole("admin"), deleteRoom);

router.post(
  "/:id/images",
  verifyToken,
  checkRole("admin"),
  handleRoomImageUpload,
  addRoomImage
);
router.put("/:id/images/order", verifyToken, checkRole("admin"), reorderRoomImages);
router.post("/:id/images/:imageId/cover", verifyToken, checkRole("admin"), setRoomCover);
router.delete("/:id/images/:imageId", verifyToken, checkRole("admin"), deleteRoomImage);

// Ai cũng xem được review (public); phải đăng nhập mới được viết review
router.get("/:id/reviews", getRoomReviews);
router.post("/:id/reviews", verifyToken, createReview);

module.exports = router;
