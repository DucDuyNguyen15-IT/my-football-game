# Quickstart: kiểm tra Đá trực tiếp

## Chuẩn bị

1. Bật Docker Desktop, chạy `docker compose -f docker-compose.dev.yml up -d`, rồi `pnpm install`.
2. Cài trình duyệt cho Playwright: `pnpm exec playwright install chromium firefox webkit`.
3. Tạo hai tài khoản test, hoặc dùng seed e2e có sẵn.

## Kịch bản tự động

| # | Lệnh | Kỳ vọng | Ứng với |
|---|---|---|---|
| 1 | `pnpm --filter @pitch/sim exec vitest run` | Golden hash một người không đổi. Replay v2 khớp `stepBoth`. Luật áp cho cả đội khách | SC-007, contracts/sim-api.md |
| 2 | `pnpm e2e:determinism` (script mới) | 100 seed × trận đầy đủ: mã băm mỗi 60 tick giống nhau trên Chromium, Firefox, WebKit và Node | SC-003, research R4 |
| 2b | `pnpm --filter @pitch/server exec tsx scripts/perf-pvp-sim.ts` | p99 thời gian `step` trong ngưỡng đã đặt; sim bóng ≤ 40% một lõi ở số phiên tối đa (không dùng trung bình) | SC-009, research R11 |
| 3 | `pnpm --filter @pitch/server exec vitest run pvp` | Session lockstep với client giả: khung đúng thứ tự, input trễ lặp input cũ, rớt 30 s / cộng dồn 60 s thì xử thua, lệch lần đầu thì dựng lại (catchup) và lệch lần hai mới xử thua, cả hai lệch lần hai thì huỷ, thưởng đúng một lần, friendly 0 xu, trùng cặp quá 3 trận thì không thưởng, xử thua chỉ tính nhiệm vụ chơi/thắng trận, Origin lạ hoặc thiếu bị 403, quá 4 kết nối/IP bị từ chối, socket thứ hai báo busy và không ngắt socket cũ, vào lại trận đã xong nhận lại kết quả, người ngoài trận bị từ chối, đóng socket thì xoá hàng chờ/đóng phòng, đăng xuất/xoá tài khoản ngắt socket | FR-004, 010, 011, 015–017, 020, 022–025 |
| 4 | `pnpm e2e -- pvp.spec.ts` | Hai context: A tạo phòng, B nhập mã, autopilot hai đội, hiệp 10 s. Hai màn kết quả cùng tỉ số, ghi "Giao hữu". Kịch bản thứ hai: hàng chờ, có thưởng | Câu chuyện 1, 2, SC-004 |
| 5 | `pnpm check` | Xanh | — |

## Kiểm tra bằng tay

1. `pnpm dev`. Mở `http://localhost:5173/pvp` ở cửa sổ thường (tài khoản A) và cửa sổ ẩn danh (tài khoản B).
2. A bấm Tạo phòng, B nhập mã. Đá vài phút. Sút một bàn, kiểm cả hai màn hình cùng hiện bàn thắng và cùng tỉ số.
3. Chrome DevTools → Network → throttling khoảng RTT 100 ms trên cửa sổ B. Cầu thủ của B vẫn phản ứng dưới khoảng 200 ms và trận không khựng (SC-002).
4. Tắt mạng ở B 10 s rồi bật lại. B vào lại đúng trận. Tắt tiếp 31 s thì A thắng 3-0 (Câu chuyện 3).
5. Lúc bóng ra biên, A thay người. B thấy cầu thủ mới (Câu chuyện 4).
6. Hai tab: khi A đang đá, mở tab thứ hai cùng tài khoản A. Tab một vẫn đá bình thường. Tab hai báo bận và tự thử lại; đóng tab một thì trong vài giây tab hai vào lại được trận (trong hạn 30 s). Tab hai bấm Tìm trận hoặc Tạo phòng thì bị từ chối.
7. Lệch: dùng công cụ thử làm lệch mã băm của B một lần. B được dựng lại, trận tiếp tục, không bị xử thua. Làm lệch lần hai thì B bị xử thua 3-0.
8. Vào lại trận đã xong: sau khi trận kết thúc, mở lại trang trận từ tab khác. Thấy màn kết quả đã lưu, không vào trận. Tài khoản thứ ba mở trận đó thì bị từ chối.
9. Đăng xuất ở A khi đang đá: kết nối của A bị ngắt, trận xử như rời trận. Đóng tab khi đang chờ ghép hoặc đang giữ phòng thì lượt chờ/phòng biến mất.
10. Một tài khoản bấm Tìm trận và chờ 60 s, kiểm thấy nút "Đá với máy" (Clarification Q5).
