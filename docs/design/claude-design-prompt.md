# Prompt cho Claude Design — làm lại toàn bộ giao diện

_Dán phần trong khung dưới vào Claude Design (claude.ai, mục Design). Đính kèm thêm 3 file để Claude Design bám đúng hệ thống hiện có: `docs/DESIGN.md`, `apps/web/src/styles/tokens.css`, `docs/design/prototypes/pack-opening.html`. Nếu muốn, đính kèm thêm vài ảnh chụp màn hình game hiện tại._

---

```
Thiết kế lại TOÀN BỘ giao diện cho một game bóng đá chạy trên trình duyệt (web game, desktop trước), tên tạm "MFG". Thể loại: đá bóng 7v7 với máy + sưu tầm thẻ cầu thủ (gacha bằng xu ảo) + xếp đội hình. Người chơi là fan game bóng đá thẻ kiểu FC Online, chơi casual 15 phút/phiên với vòng lặp: mở gói thẻ → xếp đội → đá trận → nhận xu → mở gói tiếp.

MỤC TIÊU
Giao diện hiện tại chạy được nhưng còn đơn giản. Tôi cần bản thiết kế đẹp, có chiều sâu, cảm giác "game" thật (không giống trang web quản trị), nhưng vẫn đọc nhanh: OVR, vị trí, độ hiếm, số xu phải nhìn là thấy. Mỗi màn phải chỉ rõ bước tiếp theo của người chơi.

HỆ THỐNG THIẾT KẾ (giữ, có thể nâng cấp — xem file DESIGN.md và tokens.css đính kèm)
- Chủ đề "Sân đêm": sân bóng dưới đèn pha. Chỉ có giao diện tối. Nền xanh đen #0a1310, panel #111d18 / #182822 / #213530, chữ trắng phấn #edf2ec, chữ phụ #9db0a6, nút chính màu chanh #c8f031 (chữ tối trên nền chanh), xu màu #f2b33d, nguy hiểm #ff5a4e, cảnh báo #ffc23d, thành công #3dd68c, thông tin #5cc8ff.
- Điểm nhận diện: "vạch phấn" — đường kẻ sân (vòng tròn giữa sân, vạch giữa, vòng cấm địa, chấm phạt đền) dùng làm cấu trúc UI: đường phân cách, khung sân khấu, ô xếp đội.
- Thẻ cầu thủ có GÓC VÁT (trên-phải và dưới-trái) như mác áo đấu. TUYỆT ĐỐI không dùng hình khiên kiểu FUT/FIFA.
- 4 độ hiếm, mặt thẻ luôn tối, khung có màu, kèm ký hiệu ◆ để không chỉ dựa vào màu:
  Đồng khung #b87040 (◆, khung trơn) · Bạc #aeb7c2 (◆◆, sọc chéo mảnh) · Vàng #e0ae2e (◆◆◆, khung đôi + vệt sáng lướt khi hover) · Huyền thoại #9b6bff (◆◆◆◆, khung foil nhiều màu chuyển động chậm). Màu tím CHỈ dành cho Huyền thoại.
- Màu đội trên sân: nhà xanh dương #3fa9f5, khách cam #ff7a45.
- Font: Barlow Condensed 600/700 cho số, OVR, tỉ số, tiêu đề, nhãn in hoa; Be Vietnam Pro 400/500/600 cho văn bản. Số dùng tabular-nums. Cỡ chữ: 12/14/16/20/28/40/64.
- Viết tắt tiếng Anh cho vị trí/chỉ số: GK/DF/MF/FW, PAC/SHO/PAS/DRI/DEF/PHY. Mọi chữ khác bằng TIẾNG VIỆT có dấu.
- KHÔNG: gradient tím-xanh làm nền, glassmorphism, blob trang trí, card lồng card, hero kiểu landing page marketing.
- Avatar cầu thủ là hình vector sinh tự động (đầu + tóc + màu da + áo), không phải ảnh thật.

RÀNG BUỘC BẮT BUỘC
- Toàn bộ dữ liệu hư cấu: tên cầu thủ hư cấu nghe "quen tai" nhưng không phải người thật, không tên nhại; không logo CLB, không thương hiệu FIFA/EA/FC Online.
- Tiền là "xu" ảo kiếm trong game. Không có nạp tiền thật, không có nút mua bằng tiền thật, không hiển thị giá tiền thật.
- Màn trận đấu tối thiểu 1280×720; các màn menu dùng được từ 768px trở lên. Chưa cần mobile.
- Tương phản chữ đạt WCAG AA, có viền focus rõ cho bàn phím, hỗ trợ "giảm chuyển động".

CÁC MÀN CẦN THIẾT KẾ (mỗi màn: trạng thái bình thường + trạng thái đang tải + trống + lỗi nếu có)

1. Intro / màn chờ: logo MFG trên nền sân đêm, đèn pha bật dần (chỉ cần khung hình tĩnh + mô tả chuyển động).

2. Đăng nhập / Đăng ký (một màn, chuyển tab):
   - Ô tên đăng nhập, mật khẩu (nút hiện/ẩn), email không bắt buộc khi đăng ký.
   - Nút "Đăng nhập bằng Google".
   - Bước phụ sau khi đăng nhập Google lần đầu: chọn tên người chơi (có gợi ý sẵn).
   - Lỗi theo từng ô, thông báo khoá đăng nhập 15 phút sau 5 lần sai, thông báo "thao tác quá nhanh".
   - Gợi ý quà tân thủ: 11 thẻ Đồng + 1 gói 5 thẻ miễn phí.

3. Trang chủ (menu chính, sau khi đăng nhập):
   - Thanh trên: tên người chơi, số xu, điều hướng (Trang chủ, Cửa hàng, Kho thẻ, Đội hình), đăng xuất.
   - Nút lớn "Đá với máy" (chọn Dễ/Khó ở bước sau), hiển thị "Trận có thưởng hôm nay: 3/15".
   - Thẻ tóm tắt đội: sơ đồ, OVR trung bình, 7 cầu thủ đá chính dạng mini.
   - Bảng "Nhiệm vụ ngày": 3 nhiệm vụ (VD "Thắng 1 trận", "Ghi 3 bàn", "Mở 1 gói", "Đá 1 trận mức Khó"), thanh tiến độ, thưởng ~50 xu, nút "Nhận", reset lúc 00:00.
   - Lối tắt: gói miễn phí còn lại, hộp thẻ còn bao nhiêu phiếu.

4. Cửa hàng:
   - Gói 1 thẻ (100 xu) và gói 5 thẻ (450 xu, bảo đảm ít nhất 1 thẻ Bạc trở lên).
   - "Hộp thẻ" của riêng người chơi: 100 phiếu gồm 2 Huyền thoại / 10 Vàng / 30 Bạc / 58 Đồng, bốc đến đâu trừ đến đó; hiển thị còn lại bao nhiêu mỗi loại và tỉ lệ hiện tại; cảnh báo khi hộp chỉ còn Đồng; làm mới hộp khi hết.
   - Trạng thái không đủ xu.

5. Mở gói thẻ (màn quan trọng nhất về cảm xúc — xem prototype pack-opening.html đính kèm):
   - Sân khấu là vòng tròn giữa sân, thẻ úp, lật từng thẻ (CSS 3D), độ hiếm cao có hiệu ứng mạnh hơn (Vàng có tia sáng, Huyền thoại có hào quang foil + rung nhẹ).
   - Gói 5 thẻ: lật lần lượt hoặc "Lật tất cả", tóm tắt cuối với nút "Mở tiếp", "Xếp đội", "Về kho".
   - Thẻ trùng: hiển thị nhãn "Trùng" và giá bán nhanh.

6. Kho thẻ:
   - Lưới thẻ, lọc theo độ hiếm / vị trí / đang trong đội hình, sắp xếp theo OVR / mới nhất / độ hiếm, ô tìm tên.
   - Bảng chi tiết bên phải khi chọn thẻ: avatar, tên, vị trí, OVR, 6 chỉ số, cấp ép (+0 đến +5), nút "Ép thẻ", "Bán (N xu)" có xác nhận, nhãn "Đang trong đội hình" (không bán được).
   - Trạng thái kho trống.

7. Ép thẻ (nâng cấp +1 → +5):
   - Chọn thẻ cần ép và 1 thẻ nguyên liệu (cùng độ hiếm trở lên, không nằm trong đội hình). Nguyên liệu sẽ MẤT dù thành công hay thất bại.
   - Hiển thị: tỉ lệ thành công = tỉ lệ cơ bản + điểm may mắn tích luỹ từ lần trượt trước (thanh 2 màu), phí xu, bảng chỉ số trước → sau (+5 = tổng +7 chỉ số), cảnh báo rõ khi nguyên liệu đã được ép hoặc hiếm hơn thẻ chính (phải giữ nút 1 giây để xác nhận).
   - Hiệu ứng thành công (thẻ nảy, vòng sáng chanh) và thất bại (thẻ rung, chữ đỏ, may mắn tăng).

8. Đội hình:
   - Sân nhìn từ trên xuống bằng vạch phấn, 3 sơ đồ 7 người: 2-3-1 (cân bằng), 3-2-1 (phòng ngự), 2-2-2 (tấn công) + thủ môn.
   - 7 ô đá chính + 5 ô dự bị, kéo-thả thẻ từ danh sách kho bên cạnh vào ô; đổi chỗ hai thẻ.
   - Xếp sai vị trí: viền đỏ + chỉ số bị phạt 15% hiển thị rõ.
   - OVR đội, nút "Tự xếp đội mạnh nhất", "Lưu", báo thiếu thủ môn / thiếu người.

9. Trước trận:
   - Chọn độ khó Dễ / Khó (mô tả ngắn, thưởng xu tương ứng).
   - Cảnh báo "Trận này không có thưởng" khi đã đá đủ 15 trận có thưởng trong ngày.
   - Màn đối đầu: đội mình vs đội máy, OVR hai bên, nút "Vào trận".

10. HUD trong trận (đè lên sân 3D góc camera truyền hình — chỉ thiết kế lớp HUD, nền là ảnh sân):
   - Bảng tỉ số trên giữa (NHÀ 0–0 KHÁCH, hiệp, phút), minimap góc trên phải, thẻ cầu thủ đang điều khiển góc dưới trái (số áo, vị trí, thanh thể lực).
   - Thanh lực trên đầu cầu thủ khi giữ phím: chuyền (xanh), chọc khe (tím), sút (chanh).
   - Dải gợi ý phím: Mũi tên di chuyển · E nước rút · S chuyền/đổi người · A chuyền bổng/xoạc · D sút/áp sát · W chọc khe · Q+W chọc khe bổng · Esc tạm dừng.
   - Thông báo sự kiện: BÀN THẮNG, thẻ vàng/đỏ, phạt góc, ném biên, hết hiệp; replay quay chậm (nhãn "REPLAY", "S bỏ qua").
   - Luân lưu: bảng 5 lượt mỗi đội với chấm tròn trúng/trượt.

11. Menu tạm dừng: Tiếp tục, Thay người (chỉ bật khi bóng chết; tối đa N lượt), Đồ hoạ (Thấp/Cao, đêm/hoàng hôn/ngày, bật/tắt chi tiết như cỏ 3D, bóng đổ, khán giả), Bỏ trận.

12. Kết quả trận: tỉ số lớn, thắng/hoà/thua (kể cả thắng/thua luân lưu), thống kê (sút, kiểm soát bóng, thẻ phạt), "+60 xu" có hiệu ứng đếm, tiến độ nhiệm vụ vừa tăng, trạng thái "Không có thưởng" / lỗi gửi kết quả với nút "Gửi lại". Nút "Đá tiếp", "Về trang chủ".

13. Hướng dẫn trận đầu (onboarding): lớp phủ chỉ từng phím theo bước, nút "Bỏ qua". Luồng tân thủ: đăng ký → mở gói miễn phí → xem đội hình xếp sẵn → "Đá với máy – Dễ", tổng không quá 2 phút.

14. Trang quản trị tối giản (chỉ admin): bảng retention D1/D7 theo ngày đăng ký.

15. Thành phần dùng chung (design system): nút (chính/phụ/ma/nguy hiểm, kèm trạng thái loading, disabled, nút giữ để xác nhận), thẻ cầu thủ ở 3 cỡ (mini trong ô đội hình, vừa trong lưới, lớn khi mở gói), chip độ hiếm, badge vị trí, hiển thị xu, thanh tiến độ, tab, hộp thoại xác nhận, toast, ô nhập, skeleton loading, trạng thái trống.

ĐẦU RA MONG MUỐN
- Bản thiết kế từng màn ở 1280×720 (màn menu thêm bản 768px), dạng prototype HTML/CSS có thể bấm qua lại giữa các màn.
- Design system: token màu, chữ, khoảng cách, bo góc, bóng, chuyển động (thời lượng + easing), và toàn bộ component ở mục 15.
- Ghi chú chuyển động cho các khoảnh khắc chính: lật thẻ, ép thẻ thành công/thất bại, bàn thắng, nhận xu.
- Code sẽ được dựng lại bằng React + Vite + CSS thuần dùng biến CSS (không Tailwind, không thư viện UI), nên hãy đặt tên token và component rõ ràng để chuyển sang code dễ dàng. Xuất gói bàn giao cho Claude Code khi xong.
```
