# Nghiên cứu Giai đoạn 1 — Đối thủ & kỹ thuật

_Cập nhật: 2026-10-09. Số có dấu "~" là ước lượng từ cộng đồng, chưa kiểm chứng với nguồn chính thức._

## 1. Bảng so sánh đối thủ

| | **FC Online** (Nexon, PC) | **eFootball** (Konami) | **Haxball** (web) | **Football Legends** (web, Poki) | **Hattrick** (web) |
|---|---|---|---|---|---|
| Nhóm | Đối thủ trực tiếp | Trực tiếp | Liền kề (gameplay) | Liền kề (gameplay) | Liền kề (quản lý) |
| Trận đấu | 3D, 11v11, điều khiển 1 cầu thủ, AI lo phần còn lại | 3D, 11v11, có chế độ chỉ ra lệnh chiến thuật | 2D top-down, mỗi người 1 hình tròn, 1 nút sút, vật lý va chạm, nhiều người chơi | 2D nhìn ngang, 1v1/2v2, nhân vật đầu to, siêu sút | Không điều khiển — engine mô phỏng theo chỉ số + chiến thuật |
| Thẻ / độ hiếm | "Mùa thẻ" (ICON, TOTY, sự kiện…) thay cho độ hiếm cố định | Loại thẻ: Standard, Featured, Epic, Big Time, Show Time | Không | Không (mở khoá nhân vật) | Không gacha; cầu thủ tự sinh, mua qua chợ |
| Nâng cấp | Ép thẻ +1→+10: tỉ lệ thành công giảm dần, thất bại tụt cấp, dùng thẻ phụ để tăng tỉ lệ. Thêm team color, trần lương đội hình | Lên cấp bằng EXP từ trận/token, tự phân điểm kỹ năng; Booster slot | — | — | Tập luyện theo tuần, giới hạn theo phút thi đấu |
| Kinh tế | BP (kiếm trong game) + FC (tiền thật). Phí chợ cơ bản ~40%. Lạm phát nặng → 08/2026 phải đổi đơn vị 100 triệu BP = 1 BP | GP (kiếm) + Coins (tiền thật). Gói "box draw": hộp có số thẻ cố định, rút không hoàn lại → minh bạch | Miễn phí | Quảng cáo | Tài chính CLB (vé, lương); trả phí chỉ để thêm tiện ích, **không** lợi thế |
| Bài học | Vòng lặp "mở thẻ → ép → khoe" rất mạnh nhưng gây lạm phát | Box draw giảm cảm giác "bị lừa" | Vật lý đơn giản + nhiều người = vui, mượt trên web | Trận ngắn 2–3 phút, điều khiển ít nút | Mô phỏng theo chỉ số dễ làm, chạy hoàn toàn ở server |

**Kết luận:** Chưa có game web nào kết hợp *điều khiển trận đấu* + *gacha thẻ* + *xây đội hình* ở mức chơi được. Game web hiện có chỉ có gameplay (Haxball, Football Legends) hoặc chỉ có quản lý (Hattrick); các web "pack opener" kiểu FUTBIN chỉ mô phỏng mở thẻ, không có trận. **Điểm khác biệt khả thi:** "FC Online thu nhỏ trên trình duyệt" — trận nhanh 2D, chỉ số thẻ ảnh hưởng *thấy được* lên gameplay, gacha minh bạch, kinh tế chống lạm phát.

## 2. Kỹ thuật

**Engine 2D vs 3D cho web**

| | 2D (Phaser 3 / PixiJS) | 3D (Babylon.js / Three.js) |
|---|---|---|
| Độ khó | Thấp, nhiều tutorial; Phaser có sẵn input, scene, tween | Cao: model, animation xương, camera, ánh sáng |
| Tài nguyên | Sprite/vector tự vẽ được, nhẹ | Cần model 3D + animation chạy/sút |
| Hiệu năng | Hàng nghìn sprite ở ~60 FPS, chạy tốt máy yếu | Ổn với 22 cầu thủ low-poly, nặng với điện thoại/máy yếu |
| Gần FC Online | Kém về hình ảnh | Gần hơn |

→ Khuyến nghị **2D top-down**. Chênh lệch FPS giữa các engine nhỏ, nên chọn theo tính năng và thời gian làm. Phaser 4 còn mới — Phaser 3 an toàn hơn (chốt ở ADR Giai đoạn 2).

**Vật lý bóng**
- Không cần engine vật lý đầy đủ. Đủ dùng: bóng là điểm 2D + độ cao z giả (chuyền bổng/sút xa), ma sát lăn, trọng lực theo z, nảy ở cột/biên. Khoảng 100 dòng tự viết, **dùng chung một module cho client và server**.
- Nếu cần va chạm phức tạp: Planck.js (Box2D, JS thuần, chạy được trên server) hoặc Rapier (Rust/WASM, nhanh, 2D/3D). Tránh Matter.js cho server (ít cập nhật, chậm).
- Dùng **bước thời gian cố định** (vd 60 tick/s). Không trông vào kết quả giống hệt giữa các máy; với PvP thì server quyết định, client chỉ dự đoán và nhận snapshot sửa sai.

**AI cầu thủ** (mẫu "Simple Soccer" — sách *Programming Game AI by Example*, M. Buckland)
- AI **2 tầng**: máy trạng thái của *đội* (Tấn công / Phòng ngự / Chuẩn bị giao bóng) + của *từng cầu thủ* (Về vị trí, Đuổi bóng, Hỗ trợ, Kèm người, Chuyền/Sút).
- Di chuyển bằng **steering behaviors**: seek, arrive, pursuit, interpose, separation.
- Cầu thủ hỗ trợ chọn "điểm hỗ trợ" tốt nhất trên lưới điểm (chấm theo khả năng nhận chuyền, khả năng sút).
- Chỉ số thẻ (tốc độ, chuyền, sút…) thành tham số: tốc độ tối đa, sai số góc chuyền/sút, bán kính tranh bóng → thẻ tốt *thấy* khác biệt.
- Học tăng cường (Google Research Football) quá nặng cho dự án này → chỉ dùng AI theo luật.

**Ràng buộc server (CLAUDE.md):** tỉ lệ rơi, ép thẻ, tiền ảo luôn ở server. Trận vs máy có thể chạy ở client, nhưng server phải kiểm phần thưởng (giới hạn thưởng/ngày, thời lượng trận hợp lý).

## 3. Phản biện
- **Rủi ro lớn nhất là gameplay, không phải gacha.** Hệ thống thẻ làm vài tuần là xong; trận đấu "có cảm giác" mới tốn công → MVP ưu tiên trận đấu.
- **11v11 là bẫy:** AI 20 cầu thủ khó cân bằng, màn hình 2D chật. 5v5 dễ chơi và dễ làm AI hơn nhiều.
- **PvP thời gian thực** cần netcode (dự đoán, nội suy, server authoritative) — gần như một dự án riêng. Để sau.
- **Kinh tế:** bài học FC Online là lạm phát. Cần chỗ tiêu tiền (phí ép thẻ, phí chợ) ngay từ đầu, và công bố tỉ lệ rơi.

## 4. Ba phương án phạm vi MVP

| | **A — Gọn (khuyến nghị)** | **B — Cân bằng** | **C — Tham vọng** |
|---|---|---|---|
| Trận đấu | 2D top-down, **5v5**, vs máy, 3–4 phút | 2D top-down, **7v7**, vs máy, 2 mức khó | 2D, 5v5, vs máy **+ PvP thời gian thực** |
| Điều khiển | Di chuyển, chuyền, sút, đổi người | + chuyền bổng, xoạc, chạy nước rút | Như B |
| Thẻ | 3 độ hiếm (Thường/Hiếm/Huyền thoại), 1 loại gói, ~60 thẻ hư cấu | 4 độ hiếm, gói box draw, ~150 thẻ | Như B |
| Nâng cấp | Chưa có | Ép thẻ +1→+5, tỉ lệ công khai | Như B + chợ chuyển nhượng |
| Đội hình | 1 sơ đồ, kéo-thả 5 vị trí | 3 sơ đồ, chỉ số đội, dự bị | Như B |
| Kinh tế | 1 tiền ảo: thưởng trận, mua gói | + nhiệm vụ ngày, phí ép thẻ | + phí chợ, xếp hạng mùa |
| Tài khoản | Đăng nhập cơ bản, dữ liệu ở server | Như A | Như A + ghép trận |
| Ước lượng | ~6–8 tuần | ~10–12 tuần | ~16+ tuần |
| Rủi ro | Thấp — nâng lên B được | Trung bình — AI 7v7 khó cân bằng | Cao (netcode) |

**Khuyến nghị A**, mở rộng dần sang B khi trận đấu đã vui. PvP ở Giai đoạn 7 nên bắt đầu bằng PvP **bất đồng bộ** (đá với đội hình người khác do AI điều khiển, server mô phỏng) trước PvP thời gian thực.

**Cần bạn chốt:** chọn A, B hay C? (kèm: 2D top-down? 5v5? vs máy trước, PvP sau?)

## Nguồn
- FC Online: [Đổi đơn vị BP](https://www.invenglobal.com/articles/24953/from-10-quadrillion-to-100-million-fc-online-applies-currency-unit-adjustment) · [Kiếm BP](https://www.invenglobal.com/articles/21684/f2p-friendly-a-guide-to-earning-bp-in-fc-online-coupon-events) · [Phí chợ (công cụ bên thứ ba)](https://mimmi.co.kr/fc%EC%98%A8%EB%9D%BC%EC%9D%B8-%ED%94%BC%ED%8C%8C-%EC%88%98%EC%88%98%EB%A3%8C-%EA%B3%84%EC%82%B0%EA%B8%B0/) · [Trait, trần lương](https://labs.invenglobal.com/articles/23149/26tots-ready-for-action-four-new-traits-added-and-salary-cap-increased)
- eFootball: [Booster (Konami)](https://www.konami.com/games/eu/en/topics/18189/) · [Lên cấp](https://pesmastery.com/efootball-level-up-guide/)
- Web: [Football Legends – Poki](https://poki.com/en/g/football-legends) · [Hattrick](https://wikipedia.classicistranieri.com/en/articles/h/a/t/Hattrick.html) · Haxball (haxball.com)
- Engine: [Benchmark render JS](https://github.com/Shirajuki/js-game-rendering-benchmark) · [So sánh engine JS](https://blog.openreplay.com/javascript-game-engines-compared/) · [Three.js vs Babylon.js](https://blog.logrocket.com/three-js-vs-babylon-js/)
- Vật lý: [Rapier vs Matter.js](https://learnwithhasan.com/js-libraries/compare/rapier-vs-matter-js/) · [Planck.js](https://learnwithhasan.com/js-libraries/planck-js/)
- AI: [Programming Game AI by Example](https://www.oreilly.com/library/view/programming-game-ai/9781556220784/chapter-64.html) · [Port Simple Soccer](https://github.com/luiskarlos/soccer) · [Google Research Football](https://arxiv.org/abs/1907.11180)
