/**
 * Chính sách bảo mật + Điều khoản sử dụng (checklist pháp lý GĐ9, NĐ 13/2023). Trang công khai, không
 * cần đăng nhập. Sửa nội dung thì đổi `UPDATED`.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import './legal.css';

const UPDATED = '16/11/2026';
export const CONTACT_EMAIL = 'nguyenduycn06@gmail.com';

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal">
      <article className="legal__body">
        <nav className="legal__nav" aria-label="Trang pháp lý">
          <Link to="/">← MFG</Link>
          <Link to="/privacy">Chính sách bảo mật</Link>
          <Link to="/terms">Điều khoản sử dụng</Link>
        </nav>
        <h1 className="h1">{title}</h1>
        <p className="muted">Cập nhật: {UPDATED}</p>
        {children}
        <h2 className="h3">Liên hệ</h2>
        <p>
          Câu hỏi, yêu cầu về dữ liệu hoặc khiếu nại:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </article>
    </main>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Chính sách bảo mật">
      <p>
        MFG (My Football Game) là game bóng đá miễn phí trên trình duyệt, do một cá nhân phát triển
        trong khuôn khổ đồ án học tập. Trang này nói rõ game lưu dữ liệu gì của bạn, để làm gì và
        bạn có quyền gì, theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
      </p>

      <h2 className="h3">Dữ liệu được lưu</h2>
      <ul>
        <li>
          <b>Tài khoản:</b> tên đăng nhập; mật khẩu chỉ lưu dạng băm một chiều (argon2), không ai
          đọc lại được mật khẩu gốc; email nếu bạn tự nhập lúc đăng ký.
        </li>
        <li>
          <b>Đăng nhập Google</b> (chỉ khi bạn chọn): mã định danh tài khoản Google và email Google.
        </li>
        <li>
          <b>Dữ liệu chơi:</b> xu, thẻ, đội hình, kết quả trận, nhiệm vụ, lịch sử mở gói và giao
          dịch xu.
        </li>
        <li>
          <b>Sự kiện phân tích nội bộ:</b> các mốc như đăng nhập, mở gói, đá trận, để biết người
          chơi có quay lại không. Không gửi cho công cụ phân tích bên ngoài.
        </li>
        <li>
          <b>Nhật ký máy chủ:</b> địa chỉ IP và thời điểm truy cập, dùng để chống spam, dò mật khẩu.
        </li>
      </ul>

      <h2 className="h3">Cookie và lưu trữ trên trình duyệt</h2>
      <p>
        Game chỉ dùng một cookie tên <code>sid</code> để giữ đăng nhập (tối đa 30 ngày). Không có
        cookie quảng cáo hay theo dõi. Cài đặt đồ hoạ được lưu ngay trên trình duyệt của bạn, không
        gửi lên máy chủ.
      </p>

      <h2 className="h3">Mục đích</h2>
      <p>
        Cho bạn đăng nhập, lưu tiến trình chơi, chống gian lận (xu và tỉ lệ mở thẻ do máy chủ quyết
        định) và cải thiện game. Dữ liệu không được bán, không dùng để quảng cáo.
      </p>

      <h2 className="h3">Bên thứ ba</h2>
      <p>
        Chỉ có Google, khi bạn chọn Đăng nhập bằng Google (theo chính sách của Google). Dữ liệu nằm
        trên máy chủ thuê để chạy game; nhà cung cấp máy chủ không được dùng dữ liệu cho mục đích
        khác.
      </p>

      <h2 className="h3">Thời gian lưu</h2>
      <p>
        Đến khi bạn xoá tài khoản. Bản sao lưu cơ sở dữ liệu có thể còn giữ dữ liệu cũ tối đa 30
        ngày rồi tự xoá.
      </p>

      <h2 className="h3">Quyền của bạn</h2>
      <ul>
        <li>Xem, sửa dữ liệu, rút lại sự đồng ý: gửi email theo địa chỉ ở cuối trang.</li>
        <li>
          <b>Xoá tài khoản:</b> vào trang <Link to="/account">Tài khoản</Link> → Xoá tài khoản. Tên
          đăng nhập, mật khẩu, email, liên kết Google, phiên đăng nhập và sự kiện phân tích bị xoá
          ngay. Thẻ, trận và sổ giao dịch xu được giữ lại nhưng không còn gắn với bạn (dùng để đối
          soát chống gian lận).
        </li>
      </ul>

      <h2 className="h3">Người chơi nhỏ tuổi</h2>
      <p>Nếu bạn dưới 16 tuổi, hãy hỏi ý cha mẹ hoặc người giám hộ trước khi tạo tài khoản.</p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Điều khoản sử dụng">
      <p>
        Khi tạo tài khoản hoặc chơi MFG, bạn đồng ý với các điều khoản dưới đây và với{' '}
        <Link to="/privacy">Chính sách bảo mật</Link>.
      </p>

      <h2 className="h3">Game miễn phí, không có tiền thật</h2>
      <ul>
        <li>Game miễn phí. Không có giao dịch tiền thật và không bán vật phẩm.</li>
        <li>
          Xu và thẻ cầu thủ là vật phẩm ảo, chỉ kiếm được khi chơi. Chúng không có giá trị tiền tệ,
          không quy đổi ra tiền, không chuyển nhượng hay mua bán ngoài game, không hoàn lại.
        </li>
        <li>Tỉ lệ ra thẻ của từng hộp được công khai trong Cửa hàng.</li>
      </ul>

      <h2 className="h3">Nội dung hư cấu</h2>
      <p>
        Cầu thủ, đội bóng và nhà tài trợ trong game đều là hư cấu. Mọi trùng hợp với người, tổ chức
        hay thương hiệu có thật là ngẫu nhiên.
      </p>

      <h2 className="h3">Nguồn tài nguyên</h2>
      <ul>
        <li>
          Bóng: &ldquo;Football&rdquo; của BSlegt (Sketchfab), giấy phép{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
          , đã chỉnh sửa (nén, chuẩn hoá toạ độ).
        </li>
        <li>
          Khung thành: &ldquo;Football Net&rdquo; của Bryan Okafor - Ogu (Sketchfab), giấy phép{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
          , đã chỉnh sửa (nén, chuẩn hoá toạ độ).
        </li>
        <li>Nhân vật và hoạt ảnh cầu thủ: Adobe Mixamo.</li>
      </ul>

      <h2 className="h3">Không được làm</h2>
      <ul>
        <li>Gian lận: sửa game trên trình duyệt, gửi kết quả trận giả, dùng công cụ tự động.</li>
        <li>Lập nhiều tài khoản để gom quà tân thủ, khai thác lỗi thay vì báo lỗi.</li>
        <li>Tấn công, dò mật khẩu hoặc làm quá tải máy chủ.</li>
        <li>Đặt tên đăng nhập xúc phạm, mạo danh người khác.</li>
      </ul>
      <p>
        Tài khoản vi phạm có thể bị khoá hoặc xoá, và vật phẩm kiếm được nhờ gian lận có thể bị thu
        hồi.
      </p>

      <h2 className="h3">Dịch vụ</h2>
      <p>
        Đây là dự án cá nhân nên game có thể bảo trì, thay đổi cân bằng hoặc ngừng hoạt động mà
        không báo trước, và không bảo đảm chạy liên tục. Điều khoản có thể được cập nhật; ngày cập
        nhật ghi ở đầu trang.
      </p>
    </LegalShell>
  );
}
