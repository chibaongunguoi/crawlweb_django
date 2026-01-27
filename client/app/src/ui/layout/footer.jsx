import { Link } from "react-router-dom";
import "./footer.css";

export default function Footer() {
  const handleNewsletterSubmit = (e) => {
    e.preventDefault();
    // Add newsletter subscription logic here
  };

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          {/* About Section */}
          <div className="footer-section footer-about">
            <h3>Về ITWORKS</h3>
            <p>
              ITWORKS - Trang web được xây dựng nhằm tổng hợp và chia sẻ thông
              tin tuyển dụng từ nhiều nguồn uy tín. Hệ thống giúp người tìm việc
              dễ dàng tiếp cận cơ hội nghề nghiệp, đồng thời hỗ trợ doanh nghiệp
              và nhà nghiên cứu trong việc theo dõi xu hướng lao động hoặc các
              vấn đề liên quan đến thị trường lao động IT tại Việt Nam.
            </p>
            <div className="social-links">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-facebook"></i>
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-twitter"></i>
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-linkedin"></i>
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-github"></i>
              </a>
            </div>
          </div>

          {/* Contact Info */}
          <div className="footer-section">
            <h3>Thông Tin Liên Hệ</h3>
            <div className="contact-info">
              <p>
                <i className="fas fa-map-marker-alt"></i>
                12 Nguyễn Hữu Thận, An Khê Đà Nẵng
              </p>
              <p>
                <i className="fas fa-phone"></i>
                +84 0967 430 257
              </p>
              <p>
                <i className="fas fa-envelope"></i>
                ITWORKS@company.vn
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
