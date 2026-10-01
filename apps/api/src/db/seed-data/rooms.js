// Sample room data for `npm run db:seed`: 50 hand-written rooms across real
// Vietnam destinations (FEATURED_ROOMS), plus a generator that covers every
// province (buildGeneratedRooms) for a larger demo catalogue.
//
// Pure data: no database or network access happens in this file.

function pick(pool_, index) {
  return pool_[index % pool_.length];
}

// ---------------------------------------------------------------------------
// Room data — 50 rooms across 14 real Vietnam destinations, varied types and
// market-realistic pricing (VND/night).
// ---------------------------------------------------------------------------
const FEATURED_ROOMS = [
  // Hà Nội
  { name: "Deluxe Phố Cổ Hà Nội", type: "Deluxe", location: "Hoàn Kiếm, Hà Nội", price: 1350000, capacity: 2,
    desc: "Phòng Deluxe ấm cúng ngay trong lòng Phố Cổ, đi bộ vài phút tới Hồ Gươm, ban công nhìn xuống mái ngói cổ kính." },
  { name: "Superior Hồ Gươm", type: "Superior", location: "Hoàn Kiếm, Hà Nội", price: 950000, capacity: 2,
    desc: "Phòng Superior view hồ, nội thất gỗ ấm áp, phù hợp cho khách công tác và những chuyến đi ngắn ngày." },
  { name: "Suite Hoàng Thành Thăng Long", type: "Suite", location: "Ba Đình, Hà Nội", price: 2600000, capacity: 3,
    desc: "Suite rộng rãi gần khu di tích Hoàng Thành, phòng khách riêng biệt, phong cách tân cổ điển sang trọng." },
  { name: "Family Room Tây Hồ", type: "Family Room", location: "Tây Hồ, Hà Nội", price: 2100000, capacity: 4,
    desc: "Phòng gia đình view Hồ Tây, hai giường lớn, không gian thoáng đãng phù hợp cho 4 người." },

  // Hạ Long
  { name: "Villa View Vịnh Hạ Long", type: "Villa", location: "Bãi Cháy, Quảng Ninh", price: 5200000, capacity: 4,
    desc: "Villa riêng biệt hướng thẳng ra Vịnh Hạ Long, hồ bơi riêng, ban công ngắm hoàng hôn trên những đảo đá vôi." },
  { name: "Deluxe Vịnh Bái Tử Long", type: "Deluxe", location: "Hạ Long, Quảng Ninh", price: 1800000, capacity: 2,
    desc: "Phòng Deluxe hướng biển, cửa kính lớn đón ánh sáng tự nhiên, gần bến tàu du lịch vịnh." },
  { name: "Suite Ban Công Biển Hạ Long", type: "Suite", location: "Hạ Long, Quảng Ninh", price: 3100000, capacity: 3,
    desc: "Suite có ban công riêng nhìn ra vịnh, không gian sang trọng phù hợp cặp đôi hoặc gia đình nhỏ." },

  // Sa Pa
  { name: "Bungalow Ruộng Bậc Thang Sa Pa", type: "Bungalow", location: "Sa Pa, Lào Cai", price: 1600000, capacity: 2,
    desc: "Bungalow gỗ nằm giữa ruộng bậc thang, không gian yên tĩnh, sương sớm bao phủ quanh năm." },
  { name: "Deluxe View Núi Fansipan", type: "Deluxe", location: "Sa Pa, Lào Cai", price: 1250000, capacity: 2,
    desc: "Phòng Deluxe hướng núi Fansipan, có lò sưởi ấm áp cho những ngày se lạnh vùng cao." },
  { name: "Superior Sa Pa Sương Mù", type: "Superior", location: "Sa Pa, Lào Cai", price: 850000, capacity: 2,
    desc: "Phòng Superior ấm cúng, gần chợ đêm Sa Pa và nhà thờ đá cổ, thuận tiện di chuyển." },
  { name: "Family Room Bản Cát Cát", type: "Family Room", location: "Sa Pa, Lào Cai", price: 1900000, capacity: 4,
    desc: "Phòng gia đình gần bản Cát Cát, thiết kế mang đậm nét văn hóa Tây Bắc." },

  // Ninh Bình
  { name: "Villa Tam Cốc", type: "Villa", location: "Tam Cốc, Ninh Bình", price: 3800000, capacity: 4,
    desc: "Villa giữa cánh đồng lúa Tam Cốc, gần bến thuyền, không gian đồng quê thanh bình." },
  { name: "Deluxe Tràng An", type: "Deluxe", location: "Tràng An, Ninh Bình", price: 1100000, capacity: 2,
    desc: "Phòng Deluxe gần khu du lịch sinh thái Tràng An, nội thất mộc mạc gần gũi thiên nhiên." },
  { name: "Superior Bích Động", type: "Superior", location: "Bích Động, Ninh Bình", price: 750000, capacity: 2,
    desc: "Phòng Superior tiết kiệm, gần chùa Bích Động, phù hợp khách du lịch bụi." },

  // Đà Nẵng
  { name: "Suite Hướng Biển Mỹ Khê", type: "Suite", location: "Mỹ Khê, Đà Nẵng", price: 2900000, capacity: 3,
    desc: "Suite nhìn thẳng ra bãi biển Mỹ Khê, một trong những bãi biển được bình chọn đẹp nhất hành tinh." },
  { name: "Deluxe Cầu Rồng", type: "Deluxe", location: "Hải Châu, Đà Nẵng", price: 1450000, capacity: 2,
    desc: "Phòng Deluxe trung tâm thành phố, tầm nhìn ra Cầu Rồng lung linh về đêm." },
  { name: "Villa Ngũ Hành Sơn", type: "Villa", location: "Ngũ Hành Sơn, Đà Nẵng", price: 4600000, capacity: 4,
    desc: "Villa yên tĩnh dưới chân Ngũ Hành Sơn, hồ bơi riêng, sân vườn rộng rãi." },
  { name: "Family Room Bãi Biển Non Nước", type: "Family Room", location: "Non Nước, Đà Nẵng", price: 2300000, capacity: 4,
    desc: "Phòng gia đình sát biển Non Nước, phù hợp cho những kỳ nghỉ dưỡng dài ngày." },

  // Hội An
  { name: "Deluxe Phố Cổ Hội An", type: "Deluxe", location: "Phố cổ Hội An, Đà Nẵng", price: 1500000, capacity: 2,
    desc: "Phòng Deluxe trong lòng phố cổ, đèn lồng rực rỡ mỗi tối, đi bộ khắp phố cổ dễ dàng." },
  { name: "Bungalow Vườn Hội An", type: "Bungalow", location: "Cẩm Thanh, Đà Nẵng", price: 1700000, capacity: 2,
    desc: "Bungalow giữa vườn dừa ven sông Thu Bồn, không gian xanh mát yên bình." },
  { name: "Suite Sông Thu Bồn", type: "Suite", location: "Sông Thu Bồn, Đà Nẵng", price: 2750000, capacity: 3,
    desc: "Suite có ban công hướng sông, gần bến đèn hoa đăng nổi tiếng." },
  { name: "Villa An Bàng Beach", type: "Villa", location: "An Bàng, Đà Nẵng", price: 4300000, capacity: 4,
    desc: "Villa sát biển An Bàng, hồ bơi riêng, khoảng sân đón trọn gió biển." },

  // Huế
  { name: "Deluxe Hoàng Cung Huế", type: "Deluxe", location: "Đại Nội Huế, Huế", price: 1300000, capacity: 2,
    desc: "Phòng Deluxe phong cách hoàng cung, gần Đại Nội Huế và các di tích triều Nguyễn." },
  { name: "Superior Sông Hương", type: "Superior", location: "Sông Hương, Huế", price: 900000, capacity: 2,
    desc: "Phòng Superior view sông Hương thơ mộng, gần cầu Trường Tiền." },
  { name: "Suite Lăng Tẩm Huế", type: "Suite", location: "Lăng Tẩm Hoàng Gia, Huế", price: 2400000, capacity: 3,
    desc: "Suite rộng rãi, thuận tiện tham quan hệ thống lăng tẩm triều Nguyễn." },

  // Đà Lạt
  { name: "Villa Đồi Thông Đà Lạt", type: "Villa", location: "Đà Lạt, Lâm Đồng", price: 3600000, capacity: 4,
    desc: "Villa giữa đồi thông, khí hậu se lạnh quanh năm, lò sưởi và sân vườn riêng." },
  { name: "Deluxe Hồ Xuân Hương", type: "Deluxe", location: "Đà Lạt, Lâm Đồng", price: 1400000, capacity: 2,
    desc: "Phòng Deluxe gần Hồ Xuân Hương, ban công ngắm sương sớm phủ mặt hồ." },
  { name: "Bungalow Vườn Hoa Đà Lạt", type: "Bungalow", location: "Đà Lạt, Lâm Đồng", price: 1650000, capacity: 2,
    desc: "Bungalow giữa vườn hoa, không gian lãng mạn phù hợp cặp đôi." },
  { name: "Suite Sương Sớm Đà Lạt", type: "Suite", location: "Đà Lạt, Lâm Đồng", price: 2500000, capacity: 3,
    desc: "Suite có lò sưởi, cửa sổ lớn đón nắng sớm và không khí trong lành cao nguyên." },

  // Nha Trang
  { name: "Suite Hướng Biển Nha Trang", type: "Suite", location: "Trần Phú, Khánh Hòa", price: 2950000, capacity: 3,
    desc: "Suite hướng biển trọn vẹn, gần công viên Yến Sào và bãi biển Nha Trang." },
  { name: "Deluxe Vinpearl View", type: "Deluxe", location: "Nha Trang, Khánh Hòa", price: 1600000, capacity: 2,
    desc: "Phòng Deluxe nhìn ra vịnh Nha Trang và đảo Vinpearl, thuận tiện di chuyển cáp treo." },
  { name: "Villa Bãi Dài Nha Trang", type: "Villa", location: "Bãi Dài, Khánh Hòa", price: 5500000, capacity: 4,
    desc: "Villa nghỉ dưỡng tại Bãi Dài, bờ cát trắng dài và làn nước trong xanh." },
  { name: "Superior Trần Phú", type: "Superior", location: "Trần Phú, Khánh Hòa", price: 1050000, capacity: 2,
    desc: "Phòng Superior ngay trục đường biển Trần Phú, gần chợ đêm và khu ẩm thực." },

  // Quy Nhơn
  { name: "Deluxe Eo Gió Quy Nhơn", type: "Deluxe", location: "Eo Gió, Gia Lai", price: 1200000, capacity: 2,
    desc: "Phòng Deluxe gần thắng cảnh Eo Gió, view biển hoang sơ đặc trưng Bình Định." },
  { name: "Bungalow Kỳ Co", type: "Bungalow", location: "Kỳ Co, Gia Lai", price: 1900000, capacity: 2,
    desc: "Bungalow sát bãi biển Kỳ Co, nước biển trong xanh như ngọc." },
  { name: "Superior Ghềnh Ráng", type: "Superior", location: "Ghềnh Ráng, Gia Lai", price: 800000, capacity: 2,
    desc: "Phòng Superior gần khu du lịch Ghềnh Ráng Tiên Sa, yên tĩnh và trong lành." },

  // Mũi Né
  { name: "Villa Đồi Cát Mũi Né", type: "Villa", location: "Mũi Né, Lâm Đồng", price: 3900000, capacity: 4,
    desc: "Villa gần đồi cát bay, hồ bơi riêng, không gian nghỉ dưỡng biệt lập." },
  { name: "Deluxe Hướng Biển Mũi Né", type: "Deluxe", location: "Mũi Né, Lâm Đồng", price: 1550000, capacity: 2,
    desc: "Phòng Deluxe hướng biển, gần các điểm lướt ván diều nổi tiếng." },
  { name: "Bungalow Làng Chài Mũi Né", type: "Bungalow", location: "Mũi Né, Lâm Đồng", price: 1750000, capacity: 2,
    desc: "Bungalow phong cách làng chài, gần chợ hải sản và bãi biển Mũi Né." },

  // TP. Hồ Chí Minh
  { name: "Suite Trung Tâm Quận 1", type: "Suite", location: "Quận 1, TP. Hồ Chí Minh", price: 3200000, capacity: 3,
    desc: "Suite ngay trung tâm Quận 1, thuận tiện tham quan Nhà thờ Đức Bà và Phố đi bộ Nguyễn Huệ." },
  { name: "Deluxe Bến Thành", type: "Deluxe", location: "Bến Thành, TP. Hồ Chí Minh", price: 1650000, capacity: 2,
    desc: "Phòng Deluxe gần chợ Bến Thành, sầm uất và tiện di chuyển khắp thành phố." },
  { name: "Penthouse Landmark 81 View", type: "Penthouse", location: "Bình Thạnh, TP. Hồ Chí Minh", price: 7800000, capacity: 4,
    desc: "Penthouse tầm nhìn toàn cảnh thành phố và tòa Landmark 81, không gian sống đẳng cấp." },
  { name: "Superior Phú Mỹ Hưng", type: "Superior", location: "Phú Mỹ Hưng, TP. Hồ Chí Minh", price: 1100000, capacity: 2,
    desc: "Phòng Superior khu đô thị Phú Mỹ Hưng, yên tĩnh và hiện đại." },

  // Phú Quốc
  { name: "Villa Bãi Sao Phú Quốc", type: "Villa", location: "Bãi Sao, An Giang", price: 6200000, capacity: 4,
    desc: "Villa cao cấp gần Bãi Sao, một trong những bãi biển đẹp nhất Phú Quốc." },
  { name: "Bungalow Overwater Phú Quốc", type: "Bungalow", location: "Phú Quốc, An Giang", price: 5800000, capacity: 2,
    desc: "Bungalow trên mặt nước, sàn kính nhìn xuống rạn san hô, trải nghiệm nghỉ dưỡng độc đáo." },
  { name: "Suite Hướng Biển Grand World", type: "Suite", location: "Grand World, An Giang", price: 3400000, capacity: 3,
    desc: "Suite gần Grand World, thuận tiện vui chơi giải trí về đêm." },
  { name: "Deluxe Dinh Cậu", type: "Deluxe", location: "Dinh Cậu, An Giang", price: 1700000, capacity: 2,
    desc: "Phòng Deluxe gần Dinh Cậu và chợ đêm Phú Quốc, tiện ăn uống khám phá." },

  // Cần Thơ
  { name: "Deluxe Bến Ninh Kiều", type: "Deluxe", location: "Ninh Kiều, Cần Thơ", price: 1050000, capacity: 2,
    desc: "Phòng Deluxe ngay Bến Ninh Kiều, ngắm sông Hậu về đêm." },
  { name: "Superior Chợ Nổi Cái Răng", type: "Superior", location: "Cái Răng, Cần Thơ", price: 700000, capacity: 2,
    desc: "Phòng Superior gần chợ nổi Cái Răng, thuận tiện tham quan sớm bằng thuyền." },
  { name: "Family Room Sông Hậu", type: "Family Room", location: "Sông Hậu, Cần Thơ", price: 1800000, capacity: 4,
    desc: "Phòng gia đình view sông Hậu, không gian miền Tây sông nước đặc trưng." },
];

// ---------------------------------------------------------------------------
// 170 real, specific destinations — 5 per each of Vietnam's 34 current
// provincial-level units (post-01/07/2025 merger, Nghị quyết 202/2025/QH15;
// verified against an official legal-database source, not the pre-2025 list
// of 63). Provinces formed by merging former ones are noted in comments.
// `vibe` drives room-type mix, price tier and which image sub-pool a room
// pulls its cover from — see VIBE_CONFIG below.
// ---------------------------------------------------------------------------
const PROVINCES = [
  { name: "Tuyên Quang", tier: 1, spots: [ // + Hà Giang
    { name: "Cao nguyên đá Đồng Văn", vibe: "mountain" },
    { name: "Đèo Mã Pí Lèng", vibe: "mountain" },
    { name: "Phố cổ Đồng Văn", vibe: "heritage" },
    { name: "Hồ Na Hang", vibe: "lake" },
    { name: "Suối khoáng Mỹ Lâm", vibe: "nature" },
  ]},
  { name: "Cao Bằng", tier: 1, spots: [
    { name: "Thác Bản Giốc", vibe: "nature" },
    { name: "Động Ngườm Ngao", vibe: "nature" },
    { name: "Hồ Thang Hen", vibe: "lake" },
    { name: "Khu di tích Pác Bó", vibe: "heritage" },
    { name: "Núi Mắt Thần", vibe: "mountain" },
  ]},
  { name: "Lai Châu", tier: 1, spots: [
    { name: "Đèo Ô Quy Hồ", vibe: "mountain" },
    { name: "Cao nguyên Sìn Hồ", vibe: "mountain" },
    { name: "Bản Sin Suối Hồ", vibe: "heritage" },
    { name: "Động Pu Sam Cáp", vibe: "nature" },
    { name: "Cầu kính Rồng Mây", vibe: "mountain" },
  ]},
  { name: "Lào Cai", tier: 4, spots: [ // + Yên Bái
    { name: "Thị trấn Sa Pa", vibe: "mountain" },
    { name: "Đỉnh Fansipan", vibe: "mountain" },
    { name: "Ruộng bậc thang Mù Cang Chải", vibe: "nature" },
    { name: "Hồ Thác Bà", vibe: "lake" },
    { name: "Thung lũng Mường Hoa", vibe: "nature" },
  ]},
  { name: "Thái Nguyên", tier: 2, spots: [ // + Bắc Kạn
    { name: "Hồ Ba Bể", vibe: "lake" },
    { name: "Hồ Núi Cốc", vibe: "lake" },
    { name: "Đồi chè Tân Cương", vibe: "nature" },
    { name: "Động Puông", vibe: "nature" },
    { name: "ATK Định Hóa", vibe: "heritage" },
  ]},
  { name: "Điện Biên", tier: 1, spots: [
    { name: "Đồi A1", vibe: "heritage" },
    { name: "Đèo Pha Đin", vibe: "mountain" },
    { name: "Cánh đồng Mường Thanh", vibe: "nature" },
    { name: "Suối khoáng nóng U Va", vibe: "nature" },
    { name: "Bản Mển", vibe: "heritage" },
  ]},
  { name: "Lạng Sơn", tier: 1, spots: [
    { name: "Động Tam Thanh", vibe: "nature" },
    { name: "Núi Mẫu Sơn", vibe: "mountain" },
    { name: "Ải Chi Lăng", vibe: "heritage" },
    { name: "Chợ Đông Kinh", vibe: "city" },
    { name: "Thác Đăng Mò", vibe: "nature" },
  ]},
  { name: "Sơn La", tier: 1, spots: [
    { name: "Cao nguyên Mộc Châu", vibe: "mountain" },
    { name: "Rừng thông Bản Áng", vibe: "nature" },
    { name: "Nhà tù Sơn La", vibe: "heritage" },
    { name: "Lòng hồ Thủy điện Sơn La", vibe: "lake" },
    { name: "Đỉnh Pha Luông", vibe: "mountain" },
  ]},
  { name: "Phú Thọ", tier: 2, spots: [ // + Vĩnh Phúc + Hòa Bình
    { name: "Đền Hùng", vibe: "heritage" },
    { name: "Vườn quốc gia Xuân Sơn", vibe: "nature" },
    { name: "Thung lũng Mai Châu", vibe: "mountain" },
    { name: "Tam Đảo", vibe: "mountain" },
    { name: "Đầm Vạc", vibe: "lake" },
  ]},
  { name: "Bắc Ninh", tier: 2, spots: [ // + Bắc Giang
    { name: "Chùa Dâu", vibe: "heritage" },
    { name: "Đền Đô", vibe: "heritage" },
    { name: "Tây Yên Tử", vibe: "mountain" },
    { name: "Rừng nguyên sinh Khe Rỗ", vibe: "nature" },
    { name: "Làng gốm Phù Lãng", vibe: "heritage" },
  ]},
  { name: "Quảng Ninh", tier: 4, spots: [
    { name: "Vịnh Hạ Long", vibe: "island" },
    { name: "Đảo Cô Tô", vibe: "island" },
    { name: "Yên Tử", vibe: "mountain" },
    { name: "Đảo Quan Lạn", vibe: "island" },
    { name: "Vân Đồn", vibe: "beach" },
  ]},
  { name: "Hà Nội", tier: 4, spots: [
    { name: "Làng cổ Đường Lâm", vibe: "heritage" },
    { name: "Chùa Hương", vibe: "heritage" },
    { name: "Ba Vì", vibe: "mountain" },
    { name: "Hồ Đồng Mô", vibe: "lake" },
    { name: "Thành cổ Sơn Tây", vibe: "heritage" },
  ]},
  { name: "Hải Phòng", tier: 3, spots: [ // + Hải Dương
    { name: "Đảo Cát Bà", vibe: "island" },
    { name: "Bãi biển Đồ Sơn", vibe: "beach" },
    { name: "Vịnh Lan Hạ", vibe: "island" },
    { name: "Côn Sơn - Kiếp Bạc", vibe: "heritage" },
    { name: "Văn miếu Mao Điền", vibe: "heritage" },
  ]},
  { name: "Hưng Yên", tier: 2, spots: [ // + Thái Bình
    { name: "Phố Hiến", vibe: "heritage" },
    { name: "Đền Chử Đồng Tử", vibe: "heritage" },
    { name: "Biển Đồng Châu", vibe: "beach" },
    { name: "Làng nghề Vũ Thư", vibe: "heritage" },
    { name: "Cồn Vành", vibe: "nature" },
  ]},
  { name: "Ninh Bình", tier: 3, spots: [ // + Hà Nam + Nam Định
    { name: "Chùa Tam Chúc", vibe: "heritage" },
    { name: "Nhà thờ đá Phát Diệm", vibe: "heritage" },
    { name: "Biển Thịnh Long", vibe: "beach" },
    { name: "Vườn quốc gia Cúc Phương", vibe: "nature" },
    { name: "Cố đô Hoa Lư", vibe: "heritage" },
  ]},
  { name: "Thanh Hóa", tier: 3, spots: [
    { name: "Biển Sầm Sơn", vibe: "beach" },
    { name: "Thành nhà Hồ", vibe: "heritage" },
    { name: "Suối cá thần Cẩm Lương", vibe: "nature" },
    { name: "Khu bảo tồn Pù Luông", vibe: "mountain" },
    { name: "Khu di tích Lam Kinh", vibe: "heritage" },
  ]},
  { name: "Nghệ An", tier: 3, spots: [
    { name: "Biển Cửa Lò", vibe: "beach" },
    { name: "Khu di tích Kim Liên", vibe: "heritage" },
    { name: "Vườn quốc gia Pù Mát", vibe: "nature" },
    { name: "Đảo Chè", vibe: "lake" },
    { name: "Truông Bồn", vibe: "heritage" },
  ]},
  { name: "Hà Tĩnh", tier: 2, spots: [
    { name: "Biển Thiên Cầm", vibe: "beach" },
    { name: "Ngã ba Đồng Lộc", vibe: "heritage" },
    { name: "Chùa Hương Tích", vibe: "heritage" },
    { name: "Biển Xuân Thành", vibe: "beach" },
    { name: "Khu di tích Nguyễn Du", vibe: "heritage" },
  ]},
  { name: "Quảng Trị", tier: 3, spots: [ // + Quảng Bình
    { name: "Động Phong Nha", vibe: "nature" },
    { name: "Động Thiên Đường", vibe: "nature" },
    { name: "Thành cổ Quảng Trị", vibe: "heritage" },
    { name: "Địa đạo Vịnh Mốc", vibe: "heritage" },
    { name: "Biển Nhật Lệ", vibe: "beach" },
  ]},
  { name: "Huế", tier: 4, spots: [
    { name: "Đại Nội Huế", vibe: "heritage" },
    { name: "Lăng Khải Định", vibe: "heritage" },
    { name: "Chùa Thiên Mụ", vibe: "heritage" },
    { name: "Biển Lăng Cô", vibe: "beach" },
    { name: "Phá Tam Giang", vibe: "lake" },
  ]},
  { name: "Đà Nẵng", tier: 4, spots: [ // + Quảng Nam
    { name: "Bà Nà Hills", vibe: "mountain" },
    { name: "Cù Lao Chàm", vibe: "island" },
    { name: "Thánh địa Mỹ Sơn", vibe: "heritage" },
    { name: "Bán đảo Sơn Trà", vibe: "beach" },
    { name: "Cầu Vàng", vibe: "mountain" },
  ]},
  { name: "Quảng Ngãi", tier: 2, spots: [ // + Kon Tum
    { name: "Đảo Lý Sơn", vibe: "island" },
    { name: "Măng Đen", vibe: "mountain" },
    { name: "Biển Sa Huỳnh", vibe: "beach" },
    { name: "Nhà thờ gỗ Kon Tum", vibe: "heritage" },
    { name: "Cầu treo Kon Klor", vibe: "nature" },
  ]},
  { name: "Gia Lai", tier: 3, spots: [ // + Bình Định
    { name: "Biển Hồ Pleiku", vibe: "lake" },
    { name: "Núi lửa Chư Đăng Ya", vibe: "mountain" },
    { name: "Thác Phú Cường", vibe: "nature" },
    { name: "Quảng trường Đại Đoàn Kết", vibe: "city" },
    { name: "Tháp Đôi", vibe: "heritage" },
  ]},
  { name: "Đắk Lắk", tier: 3, spots: [ // + Phú Yên
    { name: "Hồ Lắk", vibe: "lake" },
    { name: "Thác Dray Nur", vibe: "nature" },
    { name: "Ghềnh Đá Đĩa", vibe: "beach" },
    { name: "Vịnh Xuân Đài", vibe: "beach" },
    { name: "Bản Đôn", vibe: "nature" },
  ]},
  { name: "Khánh Hòa", tier: 4, spots: [ // + Ninh Thuận
    { name: "Đảo Bình Ba", vibe: "island" },
    { name: "Vịnh Vĩnh Hy", vibe: "island" },
    { name: "Đồi cát Nam Cương", vibe: "nature" },
    { name: "Tháp Chàm Poklong Garai", vibe: "heritage" },
    { name: "Đảo Bình Hưng", vibe: "island" },
  ]},
  { name: "Lâm Đồng", tier: 4, spots: [ // + Đắk Nông + Bình Thuận
    { name: "Thác Dambri", vibe: "nature" },
    { name: "Hồ Tà Đùng", vibe: "lake" },
    { name: "Đảo Phú Quý", vibe: "island" },
    { name: "Thung lũng Tình Yêu", vibe: "mountain" },
    { name: "Thác Pongour", vibe: "nature" },
  ]},
  { name: "Đồng Nai", tier: 3, spots: [ // + Bình Phước
    { name: "Vườn quốc gia Cát Tiên", vibe: "nature" },
    { name: "Thác Giang Điền", vibe: "nature" },
    { name: "Hồ Thác Mơ", vibe: "lake" },
    { name: "Núi Bà Rá", vibe: "mountain" },
    { name: "Bửu Long", vibe: "lake" },
  ]},
  { name: "Hồ Chí Minh", tier: 4, spots: [ // + Bình Dương + Bà Rịa-Vũng Tàu
    { name: "Bãi biển Vũng Tàu", vibe: "beach" },
    { name: "Hồ Tràm", vibe: "beach" },
    { name: "Khu du lịch Đại Nam", vibe: "city" },
    { name: "Địa đạo Củ Chi", vibe: "heritage" },
    { name: "Cần Giờ", vibe: "nature" },
  ]},
  { name: "Tây Ninh", tier: 3, spots: [ // + Long An
    { name: "Núi Bà Đen", vibe: "mountain" },
    { name: "Tòa Thánh Cao Đài", vibe: "heritage" },
    { name: "Hồ Dầu Tiếng", vibe: "lake" },
    { name: "Làng nổi Tân Lập", vibe: "nature" },
    { name: "Cánh đồng Đồng Tháp Mười", vibe: "nature" },
  ]},
  { name: "Đồng Tháp", tier: 2, spots: [ // + Tiền Giang
    { name: "Vườn quốc gia Tràm Chim", vibe: "nature" },
    { name: "Làng hoa Sa Đéc", vibe: "nature" },
    { name: "Cù lao Thới Sơn", vibe: "nature" },
    { name: "Chợ nổi Cái Bè", vibe: "city" },
    { name: "Khu di tích Xẻo Quít", vibe: "nature" },
  ]},
  { name: "An Giang", tier: 4, spots: [ // + Kiên Giang
    { name: "Núi Sam - Châu Đốc", vibe: "heritage" },
    { name: "Rừng tràm Trà Sư", vibe: "nature" },
    { name: "Hà Tiên", vibe: "beach" },
    { name: "Núi Cấm", vibe: "mountain" },
    { name: "Đảo Nam Du", vibe: "island" },
  ]},
  { name: "Vĩnh Long", tier: 2, spots: [ // + Bến Tre + Trà Vinh
    { name: "Cồn Phụng", vibe: "nature" },
    { name: "Cù lao An Bình", vibe: "nature" },
    { name: "Ao Bà Om", vibe: "heritage" },
    { name: "Biển Ba Động", vibe: "beach" },
    { name: "Vườn trái cây Vĩnh Long", vibe: "nature" },
  ]},
  { name: "Cần Thơ", tier: 3, spots: [ // + Sóc Trăng + Hậu Giang
    { name: "Chùa Dơi", vibe: "heritage" },
    { name: "Chợ nổi Ngã Bảy", vibe: "city" },
    { name: "Cù lao Tân Lộc", vibe: "nature" },
    { name: "Vườn cò Bằng Lăng", vibe: "nature" },
    { name: "Biển Mỏ Ó", vibe: "beach" },
  ]},
  { name: "Cà Mau", tier: 1, spots: [ // + Bạc Liêu
    { name: "Mũi Cà Mau", vibe: "nature" },
    { name: "Rừng U Minh Hạ", vibe: "nature" },
    { name: "Nhà Công tử Bạc Liêu", vibe: "heritage" },
    { name: "Vườn chim Bạc Liêu", vibe: "nature" },
    { name: "Cánh đồng điện gió Bạc Liêu", vibe: "nature" },
  ]},
];

const VIBE_CONFIG = {
  beach:    { types: ["Deluxe", "Suite", "Villa", "Bungalow"], priceMul: 1.3, pool: "exterior" },
  island:   { types: ["Villa", "Bungalow", "Suite"], priceMul: 1.5, pool: "exterior" },
  mountain: { types: ["Deluxe", "Bungalow", "Superior"], priceMul: 1.0, pool: "interior" },
  lake:     { types: ["Deluxe", "Superior", "Bungalow"], priceMul: 0.95, pool: "exterior" },
  heritage: { types: ["Deluxe", "Suite", "Superior"], priceMul: 1.1, pool: "interior" },
  nature:   { types: ["Bungalow", "Deluxe", "Superior"], priceMul: 0.9, pool: "ambiance" },
  city:     { types: ["Deluxe", "Suite", "Superior", "Penthouse"], priceMul: 1.2, pool: "interior" },
};

const TIER_BASE_PRICE = { 1: 550000, 2: 800000, 3: 1100000, 4: 1500000 };
const TYPE_PRICE_MULTIPLIER = {
  Standard: 1, Superior: 1.15, Deluxe: 1.5, Suite: 2.5,
  "Family Room": 2, Bungalow: 1.8, Villa: 3.5, Penthouse: 5,
};
const TYPE_CAPACITY = {
  Standard: 2, Superior: 2, Deluxe: 2, Suite: 3,
  "Family Room": 4, Bungalow: 2, Villa: 4, Penthouse: 4,
};

const DESC_TEMPLATES = {
  beach: [
    (spot) => `Phòng hướng biển gần ${spot}, tiếng sóng vỗ mỗi sớm mai.`,
    (spot) => `Không gian nghỉ dưỡng sát ${spot}, ban công đón trọn gió biển.`,
  ],
  island: [
    (spot) => `Nghỉ dưỡng biệt lập gần ${spot}, làn nước trong xanh quanh năm.`,
    (spot) => `View biển đảo hướng ${spot}, không gian yên tĩnh tách biệt.`,
  ],
  mountain: [
    (spot) => `Phòng hướng núi gần ${spot}, khí hậu mát mẻ quanh năm.`,
    (spot) => `Không gian ấm cúng gần ${spot}, phù hợp nghỉ dưỡng vùng cao.`,
  ],
  lake: [
    (spot) => `View hồ thơ mộng gần ${spot}, không khí trong lành.`,
    (spot) => `Phòng ven hồ gần ${spot}, không gian tĩnh lặng thư giãn.`,
  ],
  heritage: [
    (spot) => `Gần ${spot}, thuận tiện tham quan di tích và tìm hiểu văn hóa địa phương.`,
    (spot) => `Không gian mang đậm dấu ấn lịch sử, chỉ vài phút tới ${spot}.`,
  ],
  nature: [
    (spot) => `Giữa thiên nhiên gần ${spot}, không gian xanh mát yên bình.`,
    (spot) => `Phòng gần ${spot}, phù hợp du khách yêu thích khám phá tự nhiên.`,
  ],
  city: [
    (spot) => `Vị trí thuận tiện gần ${spot}, dễ dàng di chuyển tham quan.`,
    (spot) => `Trung tâm nhộn nhịp gần ${spot}, đầy đủ tiện nghi hiện đại.`,
  ],
};

// Deterministic pseudo-variation (not true randomness) so re-running the
// script produces the exact same dataset — needed for the idempotent re-run
// guarantee (same room_name -> same generated price every time).
function jitter(index, spread) {
  return ((index * 37) % (spread * 2 + 1)) - spread;
}

function buildGeneratedRooms() {
  const rooms = [];
  let index = 0;

  for (const province of PROVINCES) {
    for (const spot of province.spots) {
      const config = VIBE_CONFIG[spot.vibe];
      const location = `${spot.name}, ${province.name}`;
      const basePrice = TIER_BASE_PRICE[province.tier] * config.priceMul;

      // 2 rooms per location, different types so a single spot still offers
      // room-type variety (matches the pattern used for the original 50).
      const typeA = config.types[index % config.types.length];
      const typeB = config.types[(index + 1) % config.types.length];
      const types = typeA === typeB ? [typeA, config.types[(index + 2) % config.types.length]] : [typeA, typeB];

      types.forEach((type, roomOffset) => {
        const price = Math.round(
          (basePrice * TYPE_PRICE_MULTIPLIER[type] + jitter(index + roomOffset, 60000)) / 10000
        ) * 10000;
        const capacityBase = TYPE_CAPACITY[type];
        const capacity = capacityBase + (jitter(index + roomOffset, 1) > 0 && ["Suite", "Villa", "Family Room"].includes(type) ? 1 : 0);
        const descTemplate = pick(DESC_TEMPLATES[spot.vibe], index + roomOffset);

        rooms.push({
          name: `${type} ${spot.name}`,
          type,
          location,
          price,
          capacity,
          desc: descTemplate(spot.name),
          vibe: spot.vibe,
        });
        index++;
      });
    }
  }

  return rooms;
}


module.exports = { FEATURED_ROOMS, buildGeneratedRooms };
