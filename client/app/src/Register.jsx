import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./register.css";

export default function RegisterPage() {
  const navigate = useNavigate();

  // Focus when the page finishes loading
  const formFieldRef = useRef(null);
  useEffect(() => {
    formFieldRef.current?.focus();
  }, []);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: ""
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear messages when user starts typing
    if (errorMessage) {
      setErrorMessage("");
    }
    if (successMessage) {
      setSuccessMessage("");
    }
  };

  async function handleSubmit(event) {
    event.preventDefault();

    // Validation
    if (!formData.username.trim()) {
      setErrorMessage("Vui lòng nhập tên đăng nhập.");
      return;
    }

    if (formData.username.trim().length < 3) {
      setErrorMessage("Tên đăng nhập phải có ít nhất 3 ký tự.");
      return;
    }

    if (!formData.password) {
      setErrorMessage("Vui lòng nhập mật khẩu.");
      return;
    }

    if (formData.password.length < 6) {
      setErrorMessage("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage("Mật khẩu xác nhận không khớp.");
      return;
    }

    setIsRegistering(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("http://localhost:8000/api/auth/register/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage("Đăng ký thành công! Chuyển hướng đến trang đăng nhập...");
        
        // Clear form
        setFormData({
          username: "",
          password: "",
          confirmPassword: ""
        });

        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate("/login");
        }, 2000);

      } else if (response.status === 400) {
        setErrorMessage(data.error || "Thông tin đăng ký không hợp lệ.");
      } else if (response.status === 409) {
        setErrorMessage("Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.");
      } else {
        setErrorMessage("Máy chủ đang gặp sự cố, vui lòng thử lại sau.");
      }
    } catch (error) {
      console.error("Registration error:", error);
      setErrorMessage("Có lỗi xảy ra khi đăng ký. Vui lòng thử lại.");
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <div className="auth-page-container">
      <div className="auth-form-wrapper">
        <h1 className="auth-page-title">Đăng ký tài khoản</h1>
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-form-box">
            <div className="auth-field">
              <label className="auth-label">Tên đăng nhập *</label>
              <input 
                ref={formFieldRef}
                className="auth-input"
                type="text" 
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                placeholder="Tên đăng nhập (ít nhất 3 ký tự)" 
                autoComplete="off" 
                required 
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Mật khẩu *</label>
              <input 
                className="auth-input"
                type="password" 
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="Mật khẩu (ít nhất 6 ký tự)" 
                autoComplete="new-password" 
                required 
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Xác nhận mật khẩu *</label>
              <input 
                className="auth-input"
                type="password" 
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                placeholder="Nhập lại mật khẩu" 
                autoComplete="new-password" 
                required 
              />
            </div>

            {errorMessage && (
              <div className="auth-error">{errorMessage}</div>
            )}

            {successMessage && (
              <div className="auth-success">{successMessage}</div>
            )}

            <button 
              type="submit" 
              disabled={isRegistering} 
              className="auth-button"
            >
              {isRegistering ? (
                <div className="auth-spinner"></div>
              ) : (
                "Đăng ký"
              )}
            </button>

            <div className="auth-link-section">
              <span className="auth-link-text">Đã có tài khoản? </span>
              <Link to="/login" className="auth-link">
                Đăng nhập
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
