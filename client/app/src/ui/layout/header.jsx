import { Link, useNavigate, useLocation } from "react-router-dom";
import "./userLayout.css";
import { useEffect, useState } from "react";

export default function Header() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const fetchUser = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement getUser function for React
      // const data = await getUser();
      const data = null; // Temporary
      setUser(data);
      // Fetch notifications only if user is logged in and has role 'user'
      if (data && data.role === 'user') {
        fetchNotifications();
      }
    } catch (error) {
      console.error('Error loading user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/user/notifications', {
        method: 'GET',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.data || []);
        const unread = (data.data || []).filter(n => n.status === 'chưa đọc').length;
        setUnreadCount(unread);
      } else {
        console.error('Failed to fetch notifications:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      const response = await fetch(`/api/user/notifications/${notificationId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'đã đọc' }),
      });
      if (response.ok) {
        fetchNotifications();
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [location.pathname]); // Re-fetch user when route changes

  // Listen for custom login/logout events
  useEffect(() => {
    const handleLoginSuccess = () => {
      fetchUser();
    };

    const handleLogoutSuccess = () => {
      setUser(null);
    };

    // Listen for storage events (cross-tab login/logout)
    const handleStorageChange = () => {
      fetchUser();
    };

    // Add event listeners
    window.addEventListener('userLoginSuccess', handleLoginSuccess);
    window.addEventListener('userLogoutSuccess', handleLogoutSuccess);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('userLoginSuccess', handleLoginSuccess);
      window.removeEventListener('userLogoutSuccess', handleLogoutSuccess);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showNotifications && !event.target.closest('.notification-dropdown')) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  async function logOut() {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    setUser(null); // Immediately update local state
    window.dispatchEvent(new CustomEvent('userLogoutSuccess'));
    navigate("/login");
  }

  return (
    <header className="sticky-header">
      <div className="header-container">
        <nav id="navigation" className="menu d-xs-none">
          <div id="brand" className="logo">
            <h1>
              <Link to="/">
                <div className="logo">ITWORKS</div>
              </Link>
            </h1>
          </div>
          <ul className="search">
            <li>
              {/* TODO: Add JobSearch component for React */}
              <input type="search" placeholder="Tìm kiếm việc làm..." className="search-input" />
            </li>

          </ul>{" "}
          <ul className="float-right">
            {user && user.role === 'admin' && (
              <li>
                <Link to="/admin" className="">
                  Quản lý hệ thống
                </Link>
              </li>
            )}

            {isLoading ? (
              <li>
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600 mr-2"></div>
                  <span className="text-sm text-gray-500">Đang tải...</span>
                </div>
              </li>
            ) : user ? (
              <>
                {user.role === 'user' && (
                  <li className="notification-dropdown">
                    <a
                      href="#"
                      className="notification-bell"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowNotifications(!showNotifications);
                      }}
                    >
                      <i className="icon-bell"></i>
                      {unreadCount > 0 && (
                        <span className="notification-badge">{unreadCount}</span>
                      )}
                    </a>
                    {showNotifications && (
                      <div className="notification-dropdown-menu">
                        <div className="notification-header">
                          <h4>Thông báo</h4>
                          {unreadCount > 0 && (
                            <span className="unread-count">{unreadCount} chưa đọc</span>
                          )}
                        </div>
                        <div className="notification-list">
                          {notifications.length === 0 ? (
                            <div className="no-notifications">
                              Không có thông báo nào
                            </div>
                          ) : (
                            notifications.slice(0, 10).map((notification) => (
                              <div
                                key={notification._id}
                                className={`notification-item ${notification.status === 'chưa đọc' ? 'unread' : ''}`}
                                onClick={() => {
                                  if (notification.status === 'chưa đọc') {
                                    markAsRead(notification._id);
                                  }
                                }}
                              >
                                <div className="notification-content">
                                  <p>{notification.content}</p>
                                  <span className="notification-time">
                                    {new Date(notification.createdAt).toLocaleString('vi-VN')}
                                  </span>
                                </div>
                                {notification.status === 'chưa đọc' && (
                                  <span className="notification-dot"></span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                        {notifications.length > 10 && (
                          <div className="notification-footer">
                            <Link to="/user/notifications">Xem tất cả</Link>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )}
                <li className="user-dropdown">
                  <a href="#" className="">
                    {user.username}
                  </a>
                  <ul className="sub-menu user-menu">
                    {user.role !== 'admin' && (
                      <li>
                        <Link to="/user/profile" className="">
                          Thông tin tài khoản
                        </Link>
                      </li>
                    )}
                    <li>
                      <a href="#" onClick={logOut} className="">
                        Đăng xuất
                      </a>
                    </li>
                  </ul>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link to="/login" className="">
                    Đăng nhập
                  </Link>
                </li>{" "}
                <li>
                  <Link to="/register" className="btn-register btn-warning gradient">
                    Đăng ký tài khoản
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>{" "}
        <nav className="d-md-none mobile-nav">
          <span className="search">
            "Đăng nhập" <i className="icon-search"></i>
          </span>{" "}
          <span className="menu-bar">
            <i className="icon-bar"></i>
          </span>
        </nav>
      </div>
    </header>
  );
}
