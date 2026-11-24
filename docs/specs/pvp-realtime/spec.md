# Đặc tả tính năng: Đá trực tiếp (PvP thời gian thực)

**Ngày tạo:** 20/11/2026
**Trạng thái:** Bản nháp, chờ người dùng duyệt
**Nguồn:** kế hoạch đá trực tiếp do người dùng duyệt ngày 20/11/2026, các quyết định ghép trận / thưởng / rớt mạng đã chốt cùng ngày.

## Clarifications

### Session 2026-11-20

- Q: Khi hai màn hình lệch nhau, xử lý thế nào để người sắp thua không cố ý gửi mã băm sai để né thua? → A: Server tự chạy lại nhật ký để phân xử. Người có mã băm sai bị xử thua 0-3. Nếu cả hai cùng sai thì huỷ trận, không thưởng. *(Cập nhật sau plan: phân xử bằng sim bóng của server thay vì chạy lại nhật ký; tỉ số xử thua theo FR-023. Cập nhật sau review 20/11: lần lệch đầu của một bên chỉ ép bên đó dựng lại từ trạng thái đúng của server, không xử thua. Lệch lần thứ hai của cùng bên trong trận mới bị xử thua. Cả hai bên cùng lệch lần hai thì huỷ trận.)*
- Q: Người bị xử thua ở trận ghép ngẫu nhiên có nhận thưởng thua và được tính nhiệm vụ không? → A: Không nhận xu, không tính nhiệm vụ, nhưng vẫn bị trừ 1 lượt trong giới hạn 15 trận/ngày.
- Q: Người ở lại đang dẫn cách biệt hơn 3 bàn khi đối thủ bỏ trận thì tỉ số ghi nhận là gì? → A: Ghi 3-0 cho người ở lại, trừ khi tỉ số lúc đó có lợi hơn cho người ở lại thì giữ nguyên tỉ số đó.
- Q: Một người rớt mạng rồi vào lại nhiều lần trong một trận thì giới hạn thế nào? → A: Mỗi lần rớt được chờ tối đa 30 s, tổng thời gian rớt cả trận quá 60 s thì bị xử thua.
- Q: Bấm "Tìm trận" mà lâu không có đối thủ thì xử lý sao? → A: Vẫn chờ tiếp. Sau 60 s hiện thêm nút "Đá với máy" (rời hàng chờ, chuyển sang đấu máy) bên cạnh nút Huỷ. Chờ quá 5 phút thì tự rời hàng chờ và báo chưa tìm được đối thủ.
- Q: Trận PvP ghép ngẫu nhiên có tính vào nhiệm vụ "đá trận máy Khó" không? → A: Không. Trận PvP chỉ tính các nhiệm vụ chung (chơi trận, thắng trận, ghi bàn, giữ sạch lưới); nhiệm vụ "máy Khó" chỉ dành cho trận đấu máy.
- Q: Game chưa có trang lịch sử trận, FR-021 xử lý thế nào? → A: Bỏ khỏi đợt này, ghi BACKLOG; vẫn lưu `mode` và đối thủ.

## Kịch bản người dùng & kiểm thử *(bắt buộc)*

### Câu chuyện 1 — Đá với bạn bằng mã phòng (Ưu tiên: P1)

Người chơi A tạo phòng riêng và nhận mã 6 ký tự, gửi mã cho bạn B. B nhập mã, hai người thấy tên và đội hình của nhau, rồi cùng đá một trận đủ hai hiệp. Mỗi người điều khiển đội của mình bằng bàn phím, như khi đá với máy.

**Vì sao ưu tiên:** đây là cách nhỏ nhất để hai người thật đá với nhau. Nó không phụ thuộc vào việc có nhiều người đang online cùng lúc.

**Kiểm thử độc lập:** mở hai trình duyệt với hai tài khoản. A tạo phòng, B nhập mã. Trận chạy hết giờ, cả hai thấy cùng một tỉ số.

**Kịch bản chấp nhận:**
1. **Cho trước** A đã đăng nhập, **khi** A bấm "Tạo phòng", **thì** A thấy mã 6 ký tự và màn chờ đối thủ.
2. **Cho trước** phòng của A đang chờ, **khi** B nhập đúng mã, **thì** cả hai thấy tên và đội hình đối thủ, và trận bắt đầu sau lượt đếm ngược.
3. **Cho trước** trận đang diễn ra, **khi** A sút vào lưới, **thì** cả hai màn hình cùng hiện bàn thắng và tỉ số giống nhau.
4. **Cho trước** trận kết thúc, **khi** tới màn kết quả, **thì** hai người thấy cùng tỉ số và dòng "Trận giao hữu, không có thưởng".
5. **Cho trước** B nhập mã sai hoặc mã đã hết hạn, **khi** B bấm vào phòng, **thì** B nhận thông báo lỗi rõ ràng và vẫn ở màn chờ.

---

### Câu chuyện 2 — Tìm trận ngẫu nhiên (Ưu tiên: P2)

Người chơi bấm "Tìm trận" và được ghép với người khác cũng đang tìm, theo thứ tự ai vào trước được ghép trước.

**Vì sao ưu tiên:** giúp người chơi có đối thủ khi không có bạn chơi cùng. Tính năng này cần câu chuyện 1 chạy được trước.

**Kiểm thử độc lập:** hai tài khoản cùng bấm "Tìm trận", hệ thống ghép họ với nhau và vào trận.

**Kịch bản chấp nhận:**
1. **Cho trước** hàng chờ trống, **khi** A bấm "Tìm trận", **thì** A thấy trạng thái "Đang tìm đối thủ…" kèm thời gian đã chờ và nút Huỷ.
2. **Cho trước** A đang chờ, **khi** B bấm "Tìm trận", **thì** A và B được ghép vào cùng một trận.
3. **Cho trước** trận ghép ngẫu nhiên kết thúc, **khi** tới màn kết quả, **thì** mỗi người thấy phần thưởng của mình.
4. **Cho trước** A đang chờ, **khi** A bấm Huỷ, **thì** A rời hàng chờ và không bị ghép nữa.
5. **Cho trước** A đã chờ 60 s mà chưa có đối thủ, **thì** A thấy thêm nút "Đá với máy". Bấm nút đó thì A rời hàng chờ và chuyển sang màn đấu máy.
6. **Cho trước** A đã chờ 5 phút, **thì** A tự rời hàng chờ và thấy thông báo "Chưa tìm được đối thủ, thử lại sau".
7. **Cho trước** một người đang có trận đang đá hoặc đang ở hàng chờ, **khi** người đó mở thêm tab và tìm trận hoặc tạo/vào phòng, **thì** hệ thống từ chối (báo đang bận). Mỗi người chỉ có một trận hoặc một lượt chờ tại một thời điểm.
8. **Cho trước** A đang đá trận ở tab 1, **khi** A mở tab 2, **thì** tab 1 không bị ngắt. Tab 2 chỉ được vào lại trận đó; nếu tab 1 còn sống thì tab 2 được báo đang bận và tự thử lại. Tab 1 chết thật thì tab 2 vào được, trong hạn 30 s rớt mạng.
9. **Cho trước** A đang chờ ghép hoặc đang giữ phòng đang chờ, **khi** A đóng kết nối (đóng tab, mất mạng), **thì** lượt chờ của A bị xoá, hoặc phòng bị đóng.

---

### Câu chuyện 3 — Rớt mạng và bỏ trận (Ưu tiên: P2)

Nếu một người mất kết nối giữa trận, trận không đứng hình với người còn lại. Cầu thủ của người bị rớt đứng yên. Người đó có 30 giây để vào lại, và tổng thời gian rớt trong cả trận không được quá 60 giây. Vượt một trong hai mức thì người đó bị xử thua (xem FR-023).

**Vì sao ưu tiên:** không có quy tắc này thì người sắp thua sẽ cố tình thoát để né thua, và người còn lại bị kẹt.

**Kiểm thử độc lập:** giữa trận, ngắt mạng một bên. Bên còn lại thấy thông báo đếm ngược 30 s. Không kết nối lại thì người rớt bị xử thua (FR-023). Với trận ghép ngẫu nhiên, bên còn lại nhận thưởng thắng.

**Kịch bản chấp nhận:**
1. **Cho trước** trận đang diễn ra, **khi** B mất kết nối, **thì** A thấy thông báo "Đối thủ mất kết nối" kèm đếm ngược 30 s, và trận vẫn tiếp tục.
2. **Cho trước** B mất kết nối chưa tới 30 s, **khi** B mở lại trang, **thì** B vào lại đúng trận đang đá, đúng tỉ số và thời gian hiện tại.
3. **Cho trước** B mất kết nối quá 30 s, **khi** hết đếm ngược, **thì** trận kết thúc, A thắng 3-0, hoặc giữ tỉ số hiện tại nếu A đang dẫn cách biệt hơn. Nếu là trận ghép ngẫu nhiên, A nhận thưởng thắng; B không nhận xu, không tính nhiệm vụ, nhưng vẫn mất 1 lượt trong giới hạn ngày.
4. **Cho trước** B đóng tab hoặc bấm rời trận, **thì** áp dụng y hệt như rớt mạng.

---

### Câu chuyện 4 — Thay người trong trận (Ưu tiên: P3)

Mỗi người chơi được thay người cho đội mình theo luật như khi đá với máy. Chỉ được thay khi bóng chết, tối đa số lượt như luật hiện hành. Thay xong, cả hai màn hình đều cập nhật.

**Kiểm thử độc lập:** lúc bóng ra biên, A mở panel thay người và thay một cầu thủ. Đội hình của A trên màn hình B đổi đúng.

**Kịch bản chấp nhận:**
1. **Cho trước** bóng chết, **khi** A thay người, **thì** cả hai màn hình cùng thấy cầu thủ mới vào sân.
2. **Cho trước** bóng đang lăn, **khi** A mở panel thay người, **thì** chỉ được chọn trước. Lệnh thay chỉ có hiệu lực khi bóng chết.

---

### Trường hợp biên

- **Hai màn hình lệch nhau:** hệ thống đối chiếu với diễn biến đúng do chính nó tính từ thao tác của cả hai. Lần lệch đầu của một bên: trận không dừng, bên đó được dựng lại màn hình theo diễn biến đúng (có thể thấy khựng ngắn). Bên đó lệch lần thứ hai trong cùng trận thì bị xử thua (FR-023), và hai người nhận thông báo lý do. Nếu cả hai cùng lệch lần hai thì huỷ trận, không ai thắng, không thưởng, thông báo "Trận bị huỷ do lỗi đồng bộ". Mọi lần lệch đều được ghi lại để đội phát triển điều tra.
- **Hai tab của cùng một người:** chỉ một kết nối được giữ trận. Tab mới không đẩy tab cũ ra. Tab mới chỉ vào lại được trận khi tab cũ đã chết (xem Câu chuyện 2, kịch bản 8).
- **Vào lại trận đã xong:** người chơi mở lại trận đã kết thúc hoặc đã huỷ thì thấy lại màn kết quả đã lưu, không bị đưa vào trận. Người không thuộc trận đó bị từ chối.
- **Đăng xuất hoặc xoá tài khoản khi đang đá:** mọi kết nối đá trực tiếp của tài khoản bị ngắt ngay, và trận được xử như rời trận (rớt mạng không vào lại được).
- **Quá nhiều kết nối từ một địa chỉ IP:** tối đa 4 kết nối đá trực tiếp đồng thời cho mỗi IP, kết nối thừa bị từ chối.
- **Mạng chậm, không mất hẳn:** trận vẫn chạy với tốc độ thật. Phím của người mạng chậm có thể tới trễ, khi đó lấy theo phím gần nhất của người đó. Trận không chậm lại vì một người.
- **Cả hai cùng rớt mạng:** nếu không ai vào lại trong 30 s, trận bị huỷ và không ai được thưởng.
- **Tạm dừng:** trận đá trực tiếp không có nút tạm dừng. Khi một người chuyển sang tab khác hoặc cửa sổ mất focus, trận của người đó vẫn chạy và cầu thủ của họ nhận phím rỗng ngay lập tức (kể cả khi đang giữ phím lúc chuyển).
- **Nghỉ giữa hiệp:** cả hai người đều bấm chuyền (không cần cùng lúc) mới đá hiệp 2; chưa đủ thì tự đá sau 30 s như luật hiện hành.
- **Đội hình không hợp lệ:** ví dụ ô thủ môn không có thủ môn. Người đó bị chặn ngay khi tạo phòng, vào phòng hoặc tìm trận, với cùng thông báo như khi đá với máy.
- **Đá với chính mình:** một tài khoản không thể vào phòng do chính mình tạo.
- **Không vào được trận:** sau khi ghép, nếu quá 30 s mà một bên chưa tải xong sân, trận bị huỷ, không thưởng, không ai bị xử thua, cả hai quay về sảnh.
- **Xoá tài khoản giữa chừng:** người đang chờ, đang trong phòng hoặc đang đá mà xoá tài khoản thì kết nối bị ngắt và được xử lý như rời trận.
- **Phòng hết hạn:** phòng không có ai vào sau 10 phút thì tự huỷ.
- **Trận giao hữu (mã phòng):** không bao giờ có xu, không tính vào nhiệm vụ và không tính vào giới hạn 15 trận/ngày. Màn chờ phòng ghi rõ "Giao hữu, không có thưởng" trước khi đá.
- **Ghép ngẫu nhiên trùng đối thủ:** hai tài khoản bị ghép ngẫu nhiên với nhau quá 3 trận trong một ngày thì các trận sau vẫn đá được nhưng không thưởng, màn kết quả ghi rõ lý do. Quy tắc này chống việc hai tài khoản của cùng một người vào hàng chờ cùng lúc để cày xu khi ít người chơi.
- **Hết lượt thưởng trong ngày (trận ghép ngẫu nhiên):** người đã đủ 15 trận có thưởng trong ngày (tính chung với đá máy) vẫn đá được, nhưng không nhận xu. Người còn lại vẫn nhận thưởng bình thường.
- **Thiết bị không hỗ trợ:** điện thoại bị chặn vào trận như chế độ đá máy hiện tại.

## Yêu cầu *(bắt buộc)*

### Yêu cầu chức năng

- **FR-001:** Người chơi đã đăng nhập PHẢI tạo được phòng riêng và nhận mã 6 ký tự dễ đọc (không dùng ký tự dễ nhầm như 0/O, 1/I).
- **FR-002:** Người chơi PHẢI vào được phòng bằng mã. Mã sai, phòng đã đầy hoặc đã hết hạn thì báo lỗi rõ ràng.
- **FR-003:** Người chơi PHẢI tìm được trận ngẫu nhiên, thấy mình đang chờ bao lâu và huỷ được lượt chờ. Sau 60 s chờ PHẢI có lựa chọn chuyển sang đấu máy. Quá 5 phút thì tự rời hàng chờ.
- **FR-004:** Mỗi tài khoản PHẢI chỉ có tối đa một lượt chờ hoặc một trận đá trực tiếp đang diễn ra tại một thời điểm. Kết nối thứ hai của cùng tài khoản không được ngắt kết nối đang giữ trận; chỉ được vào lại trận khi kết nối cũ đã chết.
- **FR-005:** Trước khi vào trận, mỗi người PHẢI thấy tên và đội hình của đối thủ.
- **FR-006:** Mỗi người PHẢI điều khiển đội của mình bằng cùng bộ phím và cùng luật với chế độ đá máy: chuyền, sút, chạy nhanh, đổi người, thẻ phạt, đá phạt có giới hạn 15 s, thủ môn ôm bóng tối đa 10 s, luân lưu nếu luật hiện hành có.
- **FR-007:** Hai người PHẢI luôn thấy cùng một diễn biến trận: vị trí cầu thủ, bóng, tỉ số, thời gian. Độ lệch hiển thị chỉ do trễ mạng.
- **FR-008:** Mỗi người PHẢI thấy trận từ phía đội mình, với HUD ghi đúng đội mình và đội đối thủ.
- **FR-009:** Tỉ số chính thức PHẢI do hệ thống chốt dựa trên toàn bộ thao tác của cả hai người. Không được tin kết quả do trình duyệt tự báo.
- **FR-010:** Hệ thống PHẢI phát hiện khi hai bên lệch diễn biến và tự phân xử. Lần lệch đầu của một bên: ép bên đó dựng lại theo diễn biến đúng, không xử thua. Lệch lần thứ hai của cùng bên trong trận thì bị xử thua (FR-023). Cả hai cùng lệch lần hai thì huỷ trận và không thưởng.
- **FR-011:** Khi một người mất kết nối, trận PHẢI tiếp tục với cầu thủ của người đó đứng yên. Người đó vào lại được trong 30 s. Quá 30 s cho một lần rớt, hoặc tổng thời gian rớt trong cả trận quá 60 s, thì bị **xử thua**. Người còn lại thấy đếm ngược theo thời gian còn lại thực tế (đã trừ các lần rớt trước).
- **FR-012:** Rời trận chủ động (đóng tab, bấm rời) PHẢI được xử lý như mất kết nối.
- **FR-013:** Trận đá trực tiếp KHÔNG có tạm dừng.
- **FR-014:** Mỗi người PHẢI thay người được cho đội mình theo luật hiện hành, chỉ có hiệu lực khi bóng chết, và cả hai màn hình cùng cập nhật.
- **FR-015:** Kết thúc **trận ghép ngẫu nhiên**, mỗi người PHẢI nhận thưởng xu theo bảng thưởng của chế độ đấu máy Khó (thắng/hoà/thua). Trận tính vào giới hạn 15 trận có thưởng mỗi ngày và vào các nhiệm vụ chung (chơi trận, thắng trận, ghi bàn, giữ sạch lưới), **không** tính nhiệm vụ "đá trận máy Khó".
- **FR-016:** Thưởng PHẢI được cộng đúng một lần cho mỗi người mỗi trận, kể cả khi mất kết nối, vào lại hay gửi lặp.
- **FR-017:** Hai tài khoản bị ghép ngẫu nhiên với nhau quá 3 trận trong ngày (tính theo giờ kết thúc trận, GMT+7, như giới hạn hiện hành) thì các trận sau không thưởng.
- **FR-018:** Mọi chữ hiển thị mới PHẢI có tiếng Việt và tiếng Anh, theo giao diện sáng và tối hiện có.
- **FR-019:** Hệ thống PHẢI ghi sự kiện phân tích cho: ghép trận thành công, bắt đầu trận, kết thúc trận, rớt mạng, xử thua, huỷ do lệch.
- **FR-020:** Chỉ người đã đăng nhập mới dùng được tính năng. Kết nối từ trang web khác nguồn, hoặc không khai báo nguồn, PHẢI bị từ chối. Mỗi địa chỉ IP chỉ được tối đa 4 kết nối đồng thời. Khi người dùng đăng xuất hoặc xoá tài khoản, mọi kết nối đá trực tiếp của họ PHẢI bị ngắt và trận đang đá được xử như rời trận (FR-012).
- **FR-021:** *(Đã bỏ khỏi đợt này, ghi vào BACKLOG: game chưa có trang lịch sử trận. Dữ liệu loại trận và đối thủ vẫn được lưu để làm sau.)*
- **FR-022:** **Trận giao hữu** (vào bằng mã phòng) PHẢI không cộng xu, không tính nhiệm vụ, không tính vào giới hạn 15 trận/ngày. Người chơi PHẢI được báo trước khi đá.
- **FR-023:** **Xử thua** PHẢI ghi tỉ số 3-0 cho người ở lại, hoặc giữ tỉ số lúc đó nếu người ở lại đang dẫn cách biệt hơn 3 bàn. Ở trận ghép ngẫu nhiên, người bị xử thua không nhận xu, không tính nhiệm vụ, nhưng vẫn bị trừ 1 lượt trong giới hạn 15 trận/ngày. Người ở lại nhận thưởng thắng. Trận xử thua chỉ tính nhiệm vụ "chơi trận" và "thắng trận" (người ở lại được tính thắng); không tính nhiệm vụ ghi bàn và giữ sạch lưới.
- **FR-024:** Người chơi vào lại một trận đã kết thúc hoặc đã huỷ PHẢI thấy lại kết quả đã lưu. Người không thuộc trận đó PHẢI bị từ chối.
- **FR-025:** Khi kết nối của người đang chờ ghép đóng, lượt chờ PHẢI bị xoá. Khi chủ phòng đang chờ rời hoặc đóng kết nối, phòng PHẢI bị đóng.

### Thực thể chính

- **Phòng:** mã 6 ký tự, người tạo, người vào (nếu có), thời điểm tạo, hạn 10 phút, trạng thái (đang chờ / đã đủ người / đã huỷ).
- **Lượt chờ ghép:** người chơi, thời điểm vào hàng chờ.
- **Trận đá trực tiếp:** hai người chơi (đội nhà, đội khách), ảnh chụp đội hình hai bên lúc vào trận, hạt giống ngẫu nhiên, thời điểm bắt đầu/kết thúc, tỉ số chính thức, cách kết thúc (hết giờ / xử thua / huỷ do lệch / cả hai bỏ), nhật ký thao tác của cả hai bên.
- **Kết quả theo người chơi:** một bản ghi cho mỗi người trong trận, gồm thắng/hoà/thua, thưởng nhận được (có thể bằng 0 kèm lý do), ngày tính thưởng.

## Tiêu chí thành công *(bắt buộc)*

### Kết quả đo được

- **SC-001:** Hai người ở cùng quốc gia, mạng gia đình thông thường, từ lúc người thứ hai nhập mã đến lúc trận bắt đầu mất dưới 10 giây.
- **SC-002:** Khi trễ mạng khứ hồi tới 100 ms, người chơi thấy cầu thủ của mình phản ứng với phím trong vòng 200 ms và trận không bị khựng.
- **SC-003:** Trong 100 trận thử tự động trên cả ba nhóm trình duyệt chính (nhân Chromium, Firefox, Safari), số trận phát hiện lệch là 0.
- **SC-004:** 100% trận kết thúc bình thường cho hai người cùng một tỉ số trên màn hình, và trùng tỉ số hệ thống chốt.
- **SC-005:** 100% trường hợp một người rời trận quá 30 s đều bị xử thua đúng luật FR-023. Ở trận ghép ngẫu nhiên, người còn lại nhận thưởng thắng.
- **SC-006:** Không trường hợp nào một người được cộng thưởng hai lần cho cùng một trận, trong các thử nghiệm gửi lặp và vào lại.
- **SC-007:** Thêm chế độ này không làm thay đổi kết quả hay cảm giác của chế độ đấu máy: kết quả mô phỏng một người chơi với cùng thao tác giữ y nguyên.
- **SC-008:** Người lần đầu dùng tính năng tạo phòng hoặc vào phòng thành công mà không cần hướng dẫn, trong lần chơi thử với ít nhất 3 người.
- **SC-009:** Ở số trận đồng thời tối đa, thời gian mô phỏng bóng của server cho mỗi nhịp đạt p99 trong ngưỡng đã đặt, và tổng tải mô phỏng không quá 40% một lõi CPU. Đo bằng p99, không dùng trung bình.

## Giả định

- Trận đá trực tiếp dài bằng trận đấu máy (mỗi hiệp 3 phút thời gian thật) và dùng cùng luật.
- Ghép ngẫu nhiên theo thứ tự đến, không xét chênh lệch sức mạnh đội hình. Xếp hạng và ghép theo trình độ để đợt sau.
- Người tạo phòng, hoặc người vào hàng chờ trước, là đội nhà.
- Người chơi chủ yếu ở Việt Nam, kết nối tới một máy chủ đặt trong khu vực. Không tối ưu cho trễ liên lục địa.
- Hệ thống chạy trên một máy chủ duy nhất. Phòng và hàng chờ mất khi máy chủ khởi động lại, và trận đang đá lúc đó bị huỷ không thưởng.
- Trận đá trực tiếp chỉ dùng được sau khi game đã deploy công khai. Trước đó chỉ thử trên máy cục bộ hoặc mạng LAN.
- Dùng lại đội hình đã lưu trong màn Đội hình. Không có bước chọn đội riêng cho trận đá trực tiếp.

## Ngoài phạm vi

- Điểm xếp hạng (ELO), bảng xếp hạng, mùa giải.
- Kỹ thuật bù trễ nâng cao giúp trận mượt hơn khi mạng xấu.
- Nhiều máy chủ, phân vùng theo khu vực.
- Điều khiển trên điện thoại/cảm ứng, tay cầm.
- Khán giả xem trận, xem lại trận của người khác.
- Chat, biểu cảm, danh sách bạn bè.
- PvP bất đồng bộ (đá với đội hình người khác do máy điều khiển).
- Trang lịch sử trận (FR-021, hoãn sang BACKLOG).

## Phụ lục kỹ thuật (để tham chiếu khi lập kế hoạch, không thuộc yêu cầu)

Hướng làm đã duyệt: lockstep do server giữ nhịp. Server chạy 60 tick/s, nhận phím của hai bên, chạy một bản sim của riêng mình theo đúng các khung đó (sim bóng), rồi phát khung cho hai trình duyệt. Phím tới trễ thì lặp phím trước đó. Tỉ số, lúc hết trận, việc thay người hợp lệ và việc phân xử khi lệch đều lấy từ sim bóng của server. Client gửi mã băm trạng thái mỗi 60 tick để server so với mã băm của sim bóng. Chi tiết ở kế hoạch `C:\Users\Admin\.claude\plans\len-ke-hoach-di-prancy-melody.md`. Sẽ ghi thành ADR-0012.
