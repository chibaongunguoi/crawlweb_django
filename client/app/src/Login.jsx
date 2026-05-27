import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./login.css";

export default function LoginPage() {
  const navigate = useNavigate();

  // Focus when the page finishes loading
  const formFieldRef = useRef(null);
  useEffect(() => {
    formFieldRef.current?.focus();
  }, []);

  const [errorMessage, setErrorMessage] = useState("");
  const [isCheckingLogin, setIsCheckingLogin] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setIsCheckingLogin(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const username = formData.get("username");
    const password = formData.get("password");

    try {
      const response = await fetch("/api/auth/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Important for cookies
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Login successful:", data);
        
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('userLoginSuccess'));
        
        // Redirect based on response
        if (data?.redirect) {
          navigate(data.redirect);
        } else {
          navigate('/');
        }
      } else if (response.status === 401) {
        setErrorMessage("Sai tên đăng nhập hoặc mật khẩu.");
      } else {
        setErrorMessage("Máy chủ đang gặp sự cố, vui lòng thử lại sau.");
      }
    } catch (error) {
      console.error("Login error:", error);
      setErrorMessage("Không thể kết nối đến máy chủ.");
    }

    setIsCheckingLogin(false);
  }

  return (
    <div className="auth-page-container">
      <div className="auth-form-wrapper">
        <h1 className="auth-page-title">Đăng nhập</h1>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-form-box">
            <div className="auth-field">
              <label className="auth-label">Tên đăng nhập</label>
              <input 
                ref={formFieldRef}
                className="auth-input"
                type="text"
                name="username"
                placeholder="Tên đăng nhập"
                autoComplete="off"
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Mật khẩu</label>
              <input
                className="auth-input"
                type="password"
                name="password"
                placeholder="Mật khẩu"
                autoComplete="off"
                required
              />
            </div>
            {errorMessage && (
              <div className="auth-error">{errorMessage}</div>
            )}
            <button
              type="submit"
              disabled={isCheckingLogin}
              className="auth-button"
            >
              {isCheckingLogin ? (
                <div className="auth-spinner"></div>
              ) : (
                "Đăng nhập"
              )}
            </button>
            
            <div className="auth-link-section">
              <span className="auth-link-text">Chưa có tài khoản? </span>
              <Link to="/register" className="auth-link">
                Đăng ký
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
