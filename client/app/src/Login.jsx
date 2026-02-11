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
      const response = await fetch("http://127.0.0.1:8000/api/auth/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Important for cookies
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Store user info in localStorage
        localStorage.setItem("user", JSON.stringify(data.user));
        
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
    <div className="login-container">
      <div className="login-wrapper">
        <div className="login-spacer"></div>
        <h1 className="login-title">Đăng nhập</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-form-content">
            <div className="login-field">
              <div className="login-label">Tên đăng nhập</div>
              <input 
                ref={formFieldRef}
                className="login-input"
                type="text"
                name="username"
                placeholder="Tên đăng nhập"
                defaultValue=""
                autoComplete="off"
                required
              />
            </div>
            <div className="login-field">
              <div className="login-label">Mật khẩu</div>
              <input
                className="login-input"
                type="password"
                name="password"
                placeholder="Mật khẩu"
                defaultValue=""
                autoComplete="off"
                required
              />
            </div>
            <div className="login-error">{errorMessage}</div>
            <button
              type="submit"
              disabled={isCheckingLogin}
              className="login-button"
            >
              {isCheckingLogin ? (
                <div className="login-spinner"></div>
              ) : (
                "Đăng nhập"
              )}
            </button>
            
            <div className="login-register-link">
              <span className="login-register-text">Chưa có tài khoản? </span>
              <Link to="/register" className="login-register-anchor">
                Đăng ký
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
