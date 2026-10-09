# PRD — Game bóng đá web (tên tạm: "Pitch Cards")

_Phiên bản 1.0 — 2026-10-09 — Trạng thái: DRAFT, cần kiểm chứng bằng playtest._
_Nguồn: `docs/research.md` (Giai đoạn 1), phương án MVP **B — Cân bằng** (`docs/PROGRESS.md`), hỏi đáp với chủ dự án._
_Mọi con số kinh tế/tỉ lệ là **giá trị khởi điểm**, nằm trong file config phía server, được cân chỉnh sau playtest mà không cần sửa PRD (trừ khi đổi cơ chế)._

---

## 1. Tầm nhìn

"FC Online thu nhỏ trên trình duyệt": mở web là chơi được ngay, có trận 2D nhanh 6 phút, trong đó **chỉ số thẻ tạo khác biệt người chơi nhìn thấy được trên sân**, gacha **minh bạch** (box draw) và kinh tế tiền ảo **không lạm phát**.

**Vấn đề:** fan FC Online chơi casual muốn có vòng lặp "mở thẻ → xây đội → đá" trong những khoảng 10–20 phút rảnh, nhưng FC Online nặng, phải cài và gắn với nạp tiền. Game web hiện có thì hoặc chỉ có gameplay (Haxball, Football Legends), hoặc chỉ có quản lý (Hattrick); chưa game nào gộp đủ cả ba (xem research.md §1).

**Bằng chứng:** chủ yếu là **giả định**. Mới có phân tích đối thủ (research.md), chưa có dữ liệu người dùng. Cần kiểm chứng bằng playtest với 5–10 fan FC Online trước khi phát hành.

**Giả thuyết chính:**
> Chúng tôi tin rằng **trận đấu 2D ngắn có chỉ số thẻ ảnh hưởng thấy được, cộng gacha box draw minh bạch** sẽ giữ chân **fan FC Online casual chơi trên trình duyệt**.
> Chúng tôi biết mình đúng khi **Retention D7 ≥ 15%** (≥ 15% tài khoản mới quay lại vào ngày thứ 7).

**Mục đích dự án:** vừa làm portfolio vừa phát hành thật. Làm một mình cùng AI. Mốc mục tiêu **~3–4 tháng nhưng mềm**, có thể kéo dài vì usage AI còn dùng cho việc khác. Ưu tiên làm xong Must trước rồi mới tới Should.

## 2. Người chơi mục tiêu

**Người chơi chính: fan FC Online chơi casual**
- Đã quen với thẻ, độ hiếm, ép thẻ, đội hình của FC Online.
- Ngữ cảnh: giờ nghỉ, máy yếu hoặc máy công cộng, không muốn cài game nặng, không muốn nạp tiền.
- Tình huống khởi phát: có 10–20 phút rảnh và muốn "mở vài gói, đá vài trận".
- Thành công với họ: sau một phiên chơi thấy đội mạnh hơn (thẻ mới, thẻ +), và trận thắng nhờ thẻ tốt *cảm nhận được*.

**Job to be done:** _Khi có 15 phút rảnh trên máy tính, tôi muốn mở thẻ và đá vài trận bóng nhanh, để thấy đội của mình mạnh dần lên mà không phải cài game hay tiêu tiền thật._

**Không nhắm tới:**
- Người chơi mobile (MVP chỉ hỗ trợ bàn phím PC).
- Người chơi cạnh tranh hardcore, cần PvP thời gian thực.
- Người thích quản lý thuần không điều khiển (kiểu Hattrick).
- Người muốn nạp tiền thật để mạnh nhanh (game không có thanh toán thật).

## 3. User stories

| ID | Là… | Tôi muốn… | Để… |
|---|---|---|---|
| US-01 | người chơi mới | đăng ký và có ngay một đội đủ người cùng 1 gói thẻ miễn phí | chơi được trong vòng 2 phút |
| US-02 | người chơi | đá trận 7v7 với máy, chọn mức Dễ/Khó | kiếm xu và thử đội hình |
| US-03 | người chơi | cảm nhận thẻ tốt chạy nhanh hơn, sút chuẩn hơn | thấy công sưu tầm có giá trị |
| US-04 | người chơi | mua gói thẻ và xem hộp còn bao nhiêu thẻ mỗi độ hiếm | biết rõ cơ hội, không thấy bị lừa |
| US-05 | người chơi | xem kho thẻ, lọc theo vị trí/độ hiếm, bán thẻ thừa | dọn kho và kiếm thêm xu |
| US-06 | người chơi | ép thẻ lên +1…+5 và biết trước tỉ lệ thành công | làm mạnh thẻ yêu thích |
| US-07 | người chơi | chọn sơ đồ, xếp 7 đá chính + dự bị | tối ưu đội theo lối chơi |
| US-08 | người chơi | thay người và quản lý thể lực trong trận | dùng tới cầu thủ dự bị |
| US-09 | người chơi | làm 3 nhiệm vụ mỗi ngày | có lý do quay lại hằng ngày |
| US-10 | người chơi | đăng nhập ở máy khác vẫn còn đội và xu | dữ liệu an toàn trên server |
| US-11 | chủ dự án | đo được D7 retention, số trận, số gói mở | biết giả thuyết đúng hay sai |

## 4. Phạm vi tính năng

### 4.1 MVP (MoSCoW)

| Ưu tiên | Tính năng | Lý do |
|---|---|---|
| Must | F1 Trận đấu 2D top-down 7v7 vs máy, 2 mức khó | Rủi ro lớn nhất, là lõi trải nghiệm |
| Must | F2 Luật trận: biên, phạm lỗi xoạc + thẻ vàng/đỏ, luân lưu khi hòa | Cho cảm giác "bóng đá thật" |
| Must | F3 Thể lực + thay người khi bóng chết | Cho dự bị và chỉ số Thể lực có ý nghĩa |
| Must | F4 Hệ thống thẻ: 4 độ hiếm, ~150 thẻ hư cấu, chỉ số ảnh hưởng gameplay | Vòng lặp sưu tầm |
| Must | F5 Mở gói kiểu box draw (gói 1 và gói 5) chạy ở server | Gacha minh bạch, chống gian lận |
| Must | F6 Đội hình: 3 sơ đồ, 7 chính + dự bị, phạt xếp sai vị trí | Vòng lặp xây đội |
| Must | F7 Ví xu + thưởng trận có giới hạn/ngày, sổ giao dịch | Kinh tế, chống lạm phát |
| Must | F8 Tài khoản: đăng ký/đăng nhập, dữ liệu ở server | Ràng buộc server-authoritative |
| Must | F9 Quà tân thủ | Rút ngắn thời gian tới trận đầu tiên |
| Should | F10 Ép thẻ +1→+5 có điểm may mắn | Chỗ tiêu xu (sink) chính, giữ chân lâu dài |
| Should | F11 Bán thẻ cho hệ thống | Dọn kho, sink thẻ |
| Should | F12 Nhiệm vụ ngày | Động lực quay lại → D7 |
| Should | F13 Ghi sự kiện phân tích (analytics) | Đo được giả thuyết |
| Could | F14 Hướng dẫn chơi trận đầu (tutorial) | Giảm bỡ ngỡ với điều khiển |

### 4.2 Sau MVP (theo thứ tự ưu tiên)
1. **PvP bất đồng bộ**: đá với đội hình người khác do AI điều khiển, server mô phỏng, có bảng xếp hạng.
2. Chợ chuyển nhượng giữa người chơi, có phí chợ.
3. Điều khiển cảm ứng/mobile, tay cầm.
4. CLB/quốc tịch hư cấu + bonus "team color".
5. Xếp hạng mùa.
6. PvP thời gian thực (netcode server authoritative).

### 4.3 Không làm (kể cả khi người chơi yêu cầu)
- **Thanh toán bằng tiền thật dưới mọi hình thức**: ràng buộc cố định, gacha chỉ dùng xu.
- **Tên/ảnh cầu thủ thật, tên nhại cầu thủ thật, logo CLB, thương hiệu FIFA/EA**: rủi ro pháp lý khi phát hành (quyền nhân thân, nhãn hiệu). Dùng tên hư cấu "quen tai" (xem F4).
- **11v11 và đồ hoạ 3D**: AI khó cân bằng, nặng với máy yếu (research.md §3).
- **Việt vị**: khó hiển thị và khó hiểu trên sân 7v7 nhỏ.
- **Chat, clan, bạn bè**: cần kiểm duyệt nội dung, ngoài trọng tâm.
- **Tiền ảo thứ hai (premium)**: chỉ một loại xu cho đơn giản và minh bạch.
- **AI học tăng cường**: quá nặng, chỉ dùng AI theo luật.

## 5. Luật trận đấu (F1–F3)

| Mục | Quy định |
|---|---|
| Góc nhìn | 2D top-down, camera bám bóng |
| Số người | 7v7 (1 thủ môn + 6), người chơi điều khiển 1 cầu thủ, AI điều khiển phần còn lại |
| Thời lượng | 2 hiệp × 3 phút thời gian thật, nghỉ giữa hiệp đổi sân. Đồng hồ trong game hiển thị 0'–90' |
| Đối thủ | Máy, mức **Dễ** (đội máy OVR TB ~60, AI phản ứng chậm, sai số chuyền/sút lớn) và **Khó** (OVR TB ~78, phản ứng nhanh) |
| Bóng ra ngoài | Ném biên / phạt góc / phát bóng, đơn giản hoá: tự đặt bóng, người chơi bấm chuyền để tiếp tục (AI tự thực hiện sau 3 giây nếu là đội máy) |
| Phạm lỗi | Xoạc không chạm bóng trước, hoặc xoạc từ phía sau → phạm lỗi, đối phương được đá phạt tại chỗ (trong vòng cấm → phạt đền). Xoạc từ sau khi đối phương đang đối mặt khung thành → thẻ vàng; 2 thẻ vàng = đỏ; xoạc thô bạo (tốc độ cao từ phía sau) có xác suất thẻ đỏ trực tiếp. Thẻ đỏ: cầu thủ rời sân, đội chơi thiếu người |
| Hòa sau 2 hiệp | Đá **luân lưu** 5 lượt mỗi đội, sau đó đá đến khi phân thắng bại (sudden death) |
| Thể lực | Mỗi cầu thủ có thanh thể lực 100%. Chạy nước rút làm thanh tụt nhanh, chạy thường tụt chậm, đứng yên hồi lại. Tốc độ hao phụ thuộc chỉ số Thể lực. Dưới 30% thì tốc độ tối đa và độ chính xác giảm dần |
| Thay người | Tối đa **3 lượt/trận**, chỉ khi bóng chết (biên, góc, phát bóng, sau bàn thắng, nghỉ giữa hiệp). Mở menu thì trận tạm dừng. Đội máy cũng thay người khi cầu thủ dưới 30% thể lực |
| Điều khiển (đề xuất, chốt ở Giai đoạn 4) | WASD/mũi tên: di chuyển · J: chuyền thấp · L: chuyền bổng · K: sút (giữ để tăng lực) · Shift: chạy nước rút · khi **không có bóng**: K = xoạc, J = đổi người gần bóng · Esc/Tab: menu thay người khi bóng chết |
| Kết quả | Thắng / Hòa (thua hay thắng luân lưu) / Thua. Tỉ số và thẻ phạt hiển thị cuối trận |

**Tiêu chí chấp nhận F1–F3**
- [ ] Trận chạy đủ 2 hiệp × 3 phút (±1 giây), đổi sân sau hiệp 1, đạt **≥ 55 FPS trung bình** trên laptop tầm trung (Chrome, tích hợp GPU) với 14 cầu thủ.
- [ ] Vật lý bóng chạy theo bước thời gian cố định (60 tick/s). Cùng trạng thái ban đầu và cùng chuỗi input thì cho cùng kết quả (test tự động).
- [ ] Bóng qua hết vạch biên dọc → ném biên cho đội không chạm bóng cuối; qua vạch cuối sân → phạt góc hoặc phát bóng đúng luật (test tự động cho cả 3 trường hợp).
- [ ] Xoạc không chạm bóng trước → phạm lỗi, đá phạt; phạm lỗi trong vòng cấm → phạt đền; vàng thứ 2 → đỏ và cầu thủ rời sân (test tự động).
- [ ] Hòa sau 2 hiệp → luân lưu 5 lượt, rồi sudden death cho tới khi có kết quả.
- [ ] Thay người chỉ mở được khi bóng chết, tối đa 3 lượt, cầu thủ bị thẻ đỏ không được thay.
- [ ] Mức Khó cho tỉ lệ thắng của máy cao hơn Dễ rõ rệt: mô phỏng AI-vs-AI 100 trận, đội "người" dùng đội khởi đầu, thắng máy Dễ ≥ 60% số trận và thắng máy Khó ≤ 30%.
- [ ] Cùng một tình huống sút, cầu thủ Sút 90 vào khung thành nhiều hơn cầu thủ Sút 55 ít nhất 25 điểm % (mô phỏng 1.000 cú sút).

## 6. Hệ thống thẻ (F4–F6, F10–F11)

### 6.1 Độ hiếm và kho thẻ

| Độ hiếm | OVR | Số mẫu thẻ (~150) | Màu (chốt ở Giai đoạn 4) |
|---|---|---|---|
| Đồng | 50–64 | ~60 | Nâu đồng |
| Bạc | 65–74 | ~45 | Bạc |
| Vàng | 75–84 | ~30 | Vàng |
| Huyền thoại | 85–94 | ~15 | Tím/đen ánh |

- Phân bố vị trí trong mỗi độ hiếm xấp xỉ: TM 12%, Hậu vệ 30%, Tiền vệ 30%, Tiền đạo 28%.
- **Tên hư cấu "quen tai"**: tên hợp với quốc tịch giả định, kèm biệt danh lối chơi (VD: _Rafinho Duarte – "Ma tốc độ"_). **Không** dựa trên một cầu thủ thật cụ thể nào. Dữ liệu thẻ nằm trong file seed riêng.
- Thẻ gồm: tên, biệt danh, vị trí, độ hiếm, chỉ số, OVR, ảnh đại diện vẽ/sinh tự động (không dùng ảnh thật).
- Thuộc tính CLB/quốc tịch để **sau MVP**.

### 6.2 Chỉ số (thang 1–99) và tác động trong trận

| Chỉ số | Áp dụng | Tham số gameplay |
|---|---|---|
| Tốc độ | Cầu thủ ngoài sân | Tốc độ tối đa, gia tốc |
| Sút | Cầu thủ ngoài sân | Lực sút tối đa, sai số góc sút |
| Chuyền | Cầu thủ ngoài sân | Sai số góc/lực chuyền, tầm chuyền bổng |
| Rê bóng | Cầu thủ ngoài sân | Độ dính bóng khi xoay hướng, khả năng giữ bóng khi bị tranh |
| Phòng ngự | Cầu thủ ngoài sân | Bán kính/tỉ lệ tranh bóng, xoạc sạch (ít phạm lỗi hơn) |
| Thể lực | Mọi cầu thủ | Tốc độ hao thể lực |
| Phản xạ | Thủ môn | Thời gian phản ứng với cú sút |
| Bắt bóng | Thủ môn | Tỉ lệ bắt dính hay đẩy ra |
| Vị trí | Thủ môn | Chọn vị trí đứng, bán kính bao phủ |
| Phát bóng | Thủ môn | Độ chính xác phát bóng/chuyền |

**OVR** = trung bình có trọng số theo nhóm vị trí (làm tròn):
- Tiền đạo: Sút 30, Tốc độ 25, Rê 20, Chuyền 10, Thể lực 10, Phòng ngự 5
- Tiền vệ: Chuyền 30, Rê 20, Thể lực 20, Sút 10, Tốc độ 10, Phòng ngự 10
- Hậu vệ: Phòng ngự 40, Tốc độ 20, Thể lực 20, Chuyền 15, Rê 5
- Thủ môn: Phản xạ 35, Bắt bóng 30, Vị trí 25, Phát bóng 10, (Thể lực dùng riêng cho hao thể lực)

### 6.3 Mở gói — box draw (F5)

- Mỗi người chơi có **1 hộp riêng 100 phiếu**: **2 Huyền thoại / 10 Vàng / 30 Bạc / 58 Đồng**.
- Mỗi thẻ mở ra là bốc 1 phiếu **không hoàn lại**: bốc độ hiếm trước, rồi chọn ngẫu nhiên đều 1 mẫu thẻ trong độ hiếm đó.
- Hộp hết phiếu thì tự làm mới với đủ 100 phiếu.
- UI luôn hiển thị số phiếu còn lại theo từng độ hiếm, và tỉ lệ của lần bốc kế tiếp (= số còn lại / tổng còn lại).
- Tỉ lệ khởi điểm tương đương **2% / 10% / 30% / 58%**, được công bố trong trang "Tỉ lệ".

| Gói | Giá | Nội dung |
|---|---|---|
| Gói 1 thẻ | 100 xu | Bốc 1 phiếu |
| Gói 5 thẻ | 450 xu (rẻ 10%) | Bốc 5 phiếu. **Đảm bảo ≥ 1 Bạc trở lên**: nếu 4 phiếu đầu đều là Đồng và hộp còn phiếu Bạc+, phiếu thứ 5 được bốc trong nhóm Bạc+ (theo tỉ lệ số còn lại). Nếu hộp chỉ còn Đồng thì không đảm bảo, và UI báo trước khi mua |

**Tiêu chí chấp nhận F5**
- [ ] Toàn bộ việc bốc thẻ, trừ xu, thêm thẻ vào kho chạy ở **server** trong **một DB transaction**. Client chỉ gửi "mua gói X" và nhận kết quả.
- [ ] Không đủ xu → server từ chối, xu và hộp giữ nguyên.
- [ ] Mở hết 100 phiếu thì nhận **đúng** 2/10/30/58 thẻ theo độ hiếm (test tự động trên nhiều hộp).
- [ ] Mô phỏng 10.000 hộp: tần suất độ hiếm của từng vị trí bốc khớp lý thuyết (kiểm định chi-bình phương, p > 0,01).
- [ ] Gói 5 không bao giờ ra 5 Đồng khi hộp còn ít nhất 1 phiếu Bạc+ (test tự động).
- [ ] Bộ sinh ngẫu nhiên phía server dùng CSPRNG (`crypto`), không dùng `Math.random`.
- [ ] Gửi trùng request (bấm 2 lần, gửi lại) không mở 2 lần: request mang idempotency key.
- [ ] Sau khi mở, kho thẻ và số phiếu còn lại hiển thị đúng mà không cần tải lại trang.

### 6.4 Đội hình (F6)

- Đội hình gồm **7 đá chính + tối đa 5 dự bị**. Một thẻ chỉ được ở một vị trí.
- **3 sơ đồ:** 2-3-1 (cân bằng), 3-2-1 (phòng ngự), 2-2-2 (tấn công), không tính thủ môn.
- Xếp thẻ vào ô khác nhóm vị trí → **−15% mọi chỉ số** của thẻ đó trong trận. UI hiện cảnh báo đỏ.
- **Chỉ số đội** = trung bình OVR hiệu lực (đã trừ phạt sai vị trí) của 7 người đá chính.

**Tiêu chí chấp nhận F6**
- [ ] Kéo-thả thẻ từ kho vào ô; đổi sơ đồ thì giữ các thẻ còn hợp lệ, thẻ thừa chuyển về dự bị hoặc kho.
- [ ] Không vào được trận nếu thiếu thủ môn hoặc chưa đủ 7 người đá chính (thông báo rõ thiếu gì).
- [ ] Chỉ số đội và cảnh báo sai vị trí cập nhật ngay khi thay đổi.
- [ ] Đội hình lưu ở server, đăng nhập máy khác vẫn còn.
- [ ] Thẻ đang nằm trong đội hình không thể bán hay dùng làm nguyên liệu ép.

### 6.5 Ép thẻ +1→+5 (F10)

| Cấp đích | +1 | +2 | +3 | +4 | +5 |
|---|---|---|---|---|---|
| Tỉ lệ thành công cơ bản | 100% | 80% | 60% | 40% | 25% |
| **Tổng** cộng vào mọi chỉ số ở cấp đó (không cộng thêm từ các cấp trước; tối đa 99) | +1 | +2 | +3 | +5 | +7 |
| Phí xu (× hệ số độ hiếm) | 50 | 100 | 200 | 400 | 800 |

- Hệ số độ hiếm của thẻ được ép: Đồng ×1, Bạc ×2, Vàng ×3, Huyền thoại ×5.
- Mỗi lần ép tiêu **1 thẻ nguyên liệu cùng độ hiếm trở lên**: thẻ trùng hay thẻ khác đều được, miễn không nằm trong đội hình. Nguyên liệu đã có cấp + vẫn bị mất (UI cảnh báo).
- **Thất bại:** giữ nguyên cấp, mất nguyên liệu và phí, thẻ được **+10% điểm may mắn** cộng vào tỉ lệ lần ép sau (cộng dồn, tỉ lệ tối đa 100%). Điểm may mắn reset về 0 khi ép thành công. Điểm may mắn gắn với từng thẻ.

**Tiêu chí chấp nhận F10**
- [ ] Trước khi ép, UI hiển thị: tỉ lệ = cơ bản + may mắn, phí, chỉ số sau khi ép.
- [ ] Ép chạy hoàn toàn ở server trong 1 DB transaction (trừ xu, xoá nguyên liệu, quay tỉ lệ, cập nhật cấp/may mắn, ghi giao dịch).
- [ ] Mô phỏng 10.000 lần ép mỗi cấp (may mắn = 0) cho tỉ lệ thành công lệch không quá ±1,5 điểm % so với bảng.
- [ ] Sau 3 lần trượt liên tiếp ở +5, lần thứ 4 có tỉ lệ 55%.
- [ ] Không ép được thẻ đã +5; không ép khi thiếu xu hoặc nguyên liệu không hợp lệ.

### 6.6 Bán thẻ (F11)

| Đồng | Bạc | Vàng | Huyền thoại |
|---|---|---|---|
| 10 xu | 25 xu | 80 xu | 300 xu |

- Giá bán không phụ thuộc cấp +. Giá trị kỳ vọng khi bán lại một thẻ từ gói ≈ 27 xu, thấp hơn nhiều so với giá gói 90–100 xu/thẻ, nên không thể "mua gói rồi bán lời".

**Tiêu chí chấp nhận F11**
- [ ] Bán một hoặc nhiều thẻ cùng lúc, có hộp xác nhận nếu trong số đó có thẻ Vàng+ hoặc thẻ đã +.
- [ ] Không bán được thẻ trong đội hình. Bán thẻ và cộng xu xảy ra trong cùng 1 DB transaction.

## 7. Kinh tế tiền ảo (F7, F9, F12)

**Tiền tệ:** 1 loại duy nhất là **Xu**. Không mua được bằng tiền thật.

### 7.1 Nguồn vào (faucet)

| Nguồn | Giá trị |
|---|---|
| Trận vs máy **Dễ** (thắng / hòa / thua) | 60 / 30 / 15 |
| Trận vs máy **Khó** (thắng / hòa / thua) | 120 / 60 / 30 |
| Thắng luân lưu | Bằng thưởng hòa + 50% chênh lệch giữa thắng và hòa (Dễ 45, Khó 90) |
| Thua luân lưu | Bằng thưởng hòa |
| Nhiệm vụ ngày (3 nhiệm vụ, reset 00:00 GMT+7) | ~50 xu mỗi nhiệm vụ, tổng ~150. Nhiệm vụ lấy từ một danh sách, VD: "Thắng 1 trận", "Ghi 3 bàn", "Mở 1 gói", "Đá 1 trận mức Khó" |
| Bán thẻ | Xem F11 |
| Quà tân thủ (F9) | **11 thẻ Đồng cố định** (1 TM, 3 HV, 4 TV, 3 TĐ = 7 chính + 4 dự bị, đủ cho sơ đồ 2-3-1) + **1 gói 5 thẻ miễn phí** bốc từ hộp của người chơi |

**Giới hạn:** tối đa **15 trận có thưởng/ngày**. Từ trận 16 vẫn đá được nhưng thưởng = 0, và UI báo trước khi vào trận.

### 7.2 Nơi tiêu (sink)
- Mua gói (sink chính về số lượng).
- Phí ép thẻ (sink tăng theo độ hiếm và cấp, hút xu của người chơi lâu năm).
- Thẻ nguyên liệu bị tiêu huỷ khi ép (sink thẻ).

### 7.3 Nhịp tiến triển mục tiêu
- Người chơi đều đặn (~6 trận/ngày, trộn Dễ/Khó, làm đủ nhiệm vụ): **~600 xu/ngày ≈ 6–7 thẻ/ngày**.
- Huyền thoại đầu tiên: trung bình sau ~34 lần bốc, tức **~5–7 ngày**. Muộn nhất là khi bốc hết hộp, ~15 ngày.
- Người chơi chơi tối đa (15 trận Khó thắng hết + nhiệm vụ) có thu nhập trần ~1.950 xu/ngày. Con số này giới hạn tốc độ lạm phát và bot.

### 7.4 Quy tắc bắt buộc
- Mọi thay đổi xu và thẻ chạy **ở server**, trong **DB transaction**, và có **bản ghi transaction** (loại, số lượng, số dư sau, tham chiếu trận/gói/ép).
- Mọi con số trong mục 6–7 nằm trong file config phía server.

**Tiêu chí chấp nhận F7, F9, F12**
- [ ] Số dư xu luôn bằng tổng các bản ghi giao dịch của người chơi (test đối soát).
- [ ] Số dư không bao giờ âm, kể cả khi 2 request mua gói đến gần như cùng lúc (test đồng thời).
- [ ] Thưởng trận chỉ được cấp khi: có **match token** do server phát lúc bắt đầu trận; mỗi token chỉ dùng 1 lần; thời gian từ lúc phát token tới lúc nộp kết quả ≥ 6 phút; tỉ số hợp lý (mỗi đội ≤ 20 bàn); chưa vượt 15 trận có thưởng trong ngày.
- [ ] Tài khoản mới nhận đúng 11 thẻ khởi đầu + 1 gói 5 miễn phí, đúng một lần.
- [ ] Nhiệm vụ ngày cập nhật tiến độ theo sự kiện ở server, nhận thưởng một lần, reset lúc 00:00 GMT+7.

## 8. Tài khoản & phân tích (F8, F13)

- Đăng ký bằng tên đăng nhập + mật khẩu (email để khôi phục là tuỳ chọn). Mật khẩu băm bằng thuật toán chậm (bcrypt/argon2). Phiên đăng nhập dùng cookie httpOnly.
- Không có chế độ khách trong MVP.
- Analytics ghi sự kiện: `register`, `login`, `session_seen` (1 lần/ngày/người, khi gọi API đã đăng nhập), `match_start`, `match_end`, `pack_open`, `upgrade`, `mission_claim`. Dữ liệu này đủ để tính D1/D7 retention, số trận/ngày, số gói mở/ngày.
- Người chơi **"quay lại ngày N"** = có ít nhất 1 sự kiện bất kỳ vào ngày thứ N (GMT+7) sau ngày đăng ký.

**Tiêu chí chấp nhận F8, F13**
- [ ] Đăng ký → đăng nhập → đăng xuất hoạt động. Sai mật khẩu 5 lần trong 15 phút thì tạm khoá đăng nhập 15 phút.
- [ ] Mọi API thay đổi dữ liệu đều yêu cầu đăng nhập và chỉ tác động lên tài khoản của chính người gọi.
- [ ] Có một truy vấn hoặc trang admin đơn giản cho ra D7 retention theo nhóm ngày đăng ký.

## 9. Luồng người chơi chính

1. Đăng ký → nhận 11 thẻ khởi đầu + 1 gói 5 miễn phí.
2. Mở gói miễn phí (xem animation lật thẻ).
3. Màn đội hình: sơ đồ 2-3-1 đã được xếp sẵn, có thể đổi thẻ mới vào.
4. Chọn "Đá với máy", mức Dễ → đá trận 6 phút.
5. Nhận xu, tiến độ nhiệm vụ tăng.
6. Cửa hàng: mua gói và xem hộp còn bao nhiêu phiếu.
7. Ép thẻ, bán thẻ thừa.
8. Thử mức Khó.

**Mục tiêu:** từ lúc đăng ký đến lúc bắt đầu trận đầu tiên **≤ 2 phút**.

## 10. Chỉ số thành công

| Chỉ số | Mục tiêu | Cách đo |
|---|---|---|
| **Retention D7** (chính) | ≥ 15% | Analytics F13 |
| Người chơi thật tháng đầu phát hành | ≥ 50 tài khoản có ≥ 1 trận | Analytics F13 |
| Hiệu năng trận | ≥ 55 FPS TB, laptop tầm trung | Đo ở Giai đoạn 8 |
| Thời gian tới trận đầu | ≤ 2 phút (trung vị) | `register` → `match_start` |
| Playtest trước phát hành | ≥ 7/10 người thấy "thẻ tốt khác biệt rõ trên sân" | Khảo sát 5–10 fan FC Online |

## 11. Hướng kỹ thuật & rủi ro

**Khả thi: TRUNG BÌNH.** Gacha, kinh tế và tài khoản là CRUD + transaction, dễ làm. Phần khó là trận 7v7 với AI "có cảm giác" và thể lực/thay người, trong khi chỉ có một người làm trong 3–4 tháng.

Hướng kỹ thuật (sẽ chốt bằng ADR ở bước 2 của Giai đoạn 2, PRD không quyết định):
- Engine 2D (Phaser 3/PixiJS), vật lý bóng tự viết, **module mô phỏng dùng chung client/server** (cần cho PvP bất đồng bộ sau MVP).
- AI 2 tầng + steering behaviors (research.md §2).
- Trận vs máy chạy ở client. Server chỉ phát match token và kiểm tra kết quả.

| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| Ôm phạm vi B (thể lực, thay người, thẻ phạt, luân lưu) không kịp 3–4 tháng khi làm một mình | Cao | Làm theo thứ tự Must → Should. Thể lực/thay người/luân lưu làm sau khi trận cơ bản đã vui. Có thể lùi F10 (ép thẻ) và F12 (nhiệm vụ) nếu trễ |
| AI 7v7 khó cân bằng, trận nhàm | Cao | Prototype AI sớm; dùng test mô phỏng AI-vs-AI để chỉnh tham số |
| Gian lận kết quả trận vs máy (trận chạy ở client) | Trung bình | Match token, thời lượng tối thiểu, giới hạn 15 trận/ngày (trần ~1.950 xu/ngày). Về sau: client gửi log input, server mô phỏng lại để xác minh |
| Lạm phát xu | Thấp–TB | Có trần thu nhập/ngày, có sink (ép thẻ); theo dõi tổng xu toàn server |
| Tên hư cấu không đủ "quen" với fan | Trung bình | Biệt danh lối chơi, tên đúng chất quốc tịch; kiểm tra lại trong playtest |

## 12. Câu hỏi mở

- [ ] Tên chính thức của game (đang dùng tên tạm "Pitch Cards").
- [ ] Phím điều khiển chi tiết. Chốt ở Giai đoạn 4 sau khi thử prototype.
- [ ] Ảnh đại diện thẻ: tự vẽ, sinh theo tham số (avatar vector), hay chỉ silhouette + màu độ hiếm? Chốt ở Giai đoạn 4.
- [ ] OVR đội máy (~60 / ~78) và độ trễ phản ứng AI cần cân chỉnh qua playtest.
- [ ] Có cần xác minh trận bằng log input ngay trong MVP không, hay chấp nhận rủi ro gian lận cho tới khi có PvP?
- [ ] Hosting và chi phí vận hành khi phát hành thật. Chốt ở ADR hosting.
- [ ] Chính sách quyền riêng tư/điều khoản khi thu thập analytics lúc phát hành.

## 13. Nhật ký quyết định

| Quyết định | Lựa chọn | Phương án khác | Lý do |
|---|---|---|---|
| Phạm vi MVP | B — Cân bằng | A Gọn, C Tham vọng | Chủ dự án chọn ở Giai đoạn 1 |
| Thời lượng trận | 2 × 3 phút | 2 × 2, người chơi tự chọn | Nhiều tình huống hơn, vẫn ngắn |
| Luật | Biên, phạm lỗi + thẻ, luân lưu khi hòa; **không** việt vị | Thêm việt vị | Việt vị khó hiểu trên sân 7v7 nhỏ |
| Thể lực | Thể lực + 3 lượt thay khi bóng chết | Không có / chỉ thanh sprint | Cho dự bị và chỉ số Thể lực ý nghĩa |
| Input | Chỉ bàn phím PC | + tay cầm, + cảm ứng | Giảm phạm vi |
| Độ hiếm | Đồng/Bạc/Vàng/Huyền thoại | Thường/Hiếm/Sử thi/HT; C/B/A/S | Dễ hiểu, quen với fan bóng đá |
| Chỉ số | 6 chỉ số ngoài sân + 4 của thủ môn | 6 chung; 15+ | Mỗi chỉ số gắn thẳng vào tham số gameplay |
| Vị trí | 4 nhóm | Vị trí chi tiết | Đủ cho 7v7 |
| Tên cầu thủ | Hư cấu "quen tai" | Tên nhại cầu thủ thật | Tránh rủi ro quyền nhân thân/nhãn hiệu khi phát hành |
| Rút thẻ | Hộp 100 phiếu riêng mỗi người | Hộp 50; random + bảo hiểm | Minh bạch, có trần chắc chắn |
| Gói | Gói 1 + gói 5 (≥1 Bạc) | Chỉ gói 3; gói theo vị trí | Đơn giản, có lựa chọn |
| Thẻ trùng | Làm nguyên liệu ép + bán | Giữ nguyên | Tạo sink thẻ |
| Ép thất bại | Giữ cấp + điểm may mắn +10% | Tụt cấp; mất trắng | Ít ức chế cho người chơi casual |
| Chống cày | 15 trận có thưởng/ngày | Giảm dần; không giới hạn | Dễ hiểu, giới hạn lạm phát |
| Quà tân thủ | 11 thẻ Đồng + 1 gói 5 | Chỉ tặng xu; chỉ đội | Có đội đủ vị trí ngay, được trải nghiệm mở thẻ |
| Ưu tiên sau MVP | PvP bất đồng bộ | Chợ, mobile, PvP realtime | Rủi ro thấp, tái dùng module mô phỏng |
| Chỉ số thành công | Retention D7 ≥ 15% | Số tài khoản; chỉ cần demo | Đo đúng giả thuyết "giữ chân" |

## 14. Liên kết tới các giai đoạn triển khai

Không lập lịch riêng, các phần dùng theo `docs/ROADMAP.md`:
- Giai đoạn 5 → F1–F3 (+F14)
- Giai đoạn 6 → F4–F6, F10, F11
- Giai đoạn 7 → F7–F9, F12, F13 (PvP bất đồng bộ là sau MVP)
- Giai đoạn 8 → kiểm các tiêu chí chấp nhận và chỉ số hiệu năng
