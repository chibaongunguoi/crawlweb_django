import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import "../admin.css";

export default function AdminLayout() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/auth/user/", {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const userData = data.user; // Backend trả về {user: {...}}
        
        console.log('User data:', userData); // Debug log
        
        // Check if user is admin
        if (!userData || userData.role !== 'admin') {
          alert("Bạn không có quyền truy cập trang này!");
          navigate('/');
          return;
        }
        
        setUser(userData);
        setLoading(false);
      } else {
        navigate('/login');
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      navigate('/login');
    }
  };

  const logOut = async () => {
    try {
      await fetch("http://localhost:8000/api/auth/logout/", {
        method: "POST",
        credentials: "include",
      });
      navigate("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const isActive = (path) => {
    if (path === '/admin' && location.pathname === '/admin') return true;
    if (path !== '/admin' && location.pathname.startsWith(path)) return true;
    return false;
  };

  if (loading || !user) {
    return (
      <div className="admin-loading">
        <div className="admin-loading-content">
          <div className="loading-spinner"></div>
          <p>Đang kiểm tra quyền truy cập...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-header">
          <h1>
            <a href="/" className="router-link-exact-active router-link-active">
              <div className="logo" style={{fontSize: '24px', fontWeight: 'bold', color: 'white'}}>ITWORKS</div>
            </a>
          </h1>
          <p className="admin-subtitle">Quản trị hệ thống</p>
        </div>

        <nav className="admin-nav">
          <ul>
            <li>
              <button
                className={`admin-nav-link ${isActive('/admin') && location.pathname === '/admin' ? 'active' : ''}`}
                onClick={() => navigate('/admin')}
              >
                <svg className="admin-nav-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/>
                </svg>
                Dashboard
              </button>
            </li>
            <li>
              <button
                className={`admin-nav-link ${isActive('/admin/users') ? 'active' : ''}`}
                onClick={() => navigate('/admin/users')}
              >
                <svg className="admin-nav-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                </svg>
                Quản lý tài khoản
              </button>
            </li>
            <li>
              <button
                className={`admin-nav-link ${isActive('/admin/jobs') ? 'active' : ''}`}
                onClick={() => navigate('/admin/jobs')}
              >
                <svg className="admin-nav-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd"/>
                </svg>
                Quản lý công việc
              </button>
            </li>
            <li>
              <button
                className={`admin-nav-link ${isActive('/admin/companies') ? 'active' : ''}`}
                onClick={() => navigate('/admin/companies')}
              >
                <svg className="admin-nav-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm3 3a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm0 3a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd"/>
                </svg>
                Quản lý công ty
              </button>
            </li>
            <li>
              <button
                className={`admin-nav-link ${isActive('/admin/notifications') ? 'active' : ''}`}
                onClick={() => navigate('/admin/notifications')}
              >
                <svg className="admin-nav-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM8 16a2 2 0 104 0H8z"/>
                </svg>
                Quản lý thông báo
              </button>
            </li>
          </ul>
        </nav>

        <div className="admin-footer">
          <button onClick={logOut} className="admin-logout-btn">
            <svg className="admin-nav-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd"/>
            </svg>
            Đăng xuất ({user?.role})
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
