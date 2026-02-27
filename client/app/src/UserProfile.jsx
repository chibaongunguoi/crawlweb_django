import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./UserProfile.css";

export default function UserProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [userProfile, setUserProfile] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [favoriteJobs, setFavoriteJobs] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [applications, setApplications] = useState([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  // Fetch user from API using cookie authentication
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/auth/user/', {
          method: 'GET',
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            setUser(data.user);
          } else {
            navigate('/login');
          }
        } else {
          navigate('/login');
        }
      } catch (err) {
        console.error('Error fetching user:', err);
        navigate('/login');
      }
    };
    fetchUser();
  }, [navigate]);

  // Fetch user profile or company info based on role
  useEffect(() => {
    if (user?.username) {
      if (user.role === 'company') {
        fetchCompanyInfo();
      } else {
        fetchUserProfile();
      }
    }
  }, [user]);

  // Fetch user profile
  const fetchUserProfile = async () => {
    if (!user?.username) return;
    try {
      setProfileLoading(true);
      const res = await fetch('http://localhost:8000/api/user/profile/', {
        method: 'GET',
        credentials: 'include'
      });
      if (!res.ok) {
        setUserProfile(null);
        return;
      }
      const data = await res.json();
      setUserProfile(data.data || null);
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setUserProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  // Fetch company information
  const fetchCompanyInfo = async () => {
    if (!user?.username) return;
    try {
      setProfileLoading(true);
      const res = await fetch(`http://localhost:8000/api/admin/companies/?username=${encodeURIComponent(user.username)}`, {
        method: 'GET',
        credentials: 'include'
      });
      if (!res.ok) {
        setCompanyInfo(null);
        return;
      }
      const data = await res.json();
      if (data.success && data.companies && data.companies.length > 0) {
        setCompanyInfo(data.companies[0]);
      } else {
        setCompanyInfo(null);
      }
    } catch (err) {
      console.error('Error fetching company info:', err);
      setCompanyInfo(null);
    } finally {
      setProfileLoading(false);
    }
  };

  // Fetch favorite jobs
  const fetchFavoriteJobs = async () => {
    if (favoritesLoading) return;
    try {
      setFavoritesLoading(true);
      const response = await fetch('http://localhost:8000/api/user/favorites/', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setFavoriteJobs(data.data || []);
      } else {
        console.error('Error fetching favorites');
      }
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setFavoritesLoading(false);
    }
  };

  // Fetch applications
  const fetchApplications = async () => {
    if (applicationsLoading) return;
    try {
      setApplicationsLoading(true);
      const response = await fetch('http://localhost:8000/api/user/apply/', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setApplications(data.data || []);
      } else {
        console.error('Error fetching applications:', data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setApplicationsLoading(false);
    }
  };

  // Delete application
  const handleDeleteApplication = async (applicationId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa đơn ứng tuyển này?')) {
      return;
    }
    try {
      const response = await fetch(`http://localhost:8000/api/user/apply/${applicationId}/`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (response.ok) {
        alert('Xóa đơn ứng tuyển thành công!');
        fetchApplications();
      } else {
        const data = await response.json();
        alert(data.error || 'Lỗi khi xóa đơn ứng tuyển');
      }
    } catch (error) {
      console.error('Error deleting application:', error);
      alert('Lỗi khi xóa đơn ứng tuyển');
    }
  };

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'favorites') {
      fetchFavoriteJobs();
    } else if (activeTab === 'applications') {
      fetchApplications();
    }
  }, [activeTab]);

  // Handle password change
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({ ...prev, [name]: value }));
    if (passwordMessage.text) {
      setPasswordMessage({ type: '', text: '' });
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordLoading) return;

    const { currentPassword, newPassword, confirmPassword } = passwordForm;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Vui lòng điền đầy đủ thông tin' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu mới và xác nhận mật khẩu không khớp' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      return;
    }

    try {
      setPasswordLoading(true);
      const response = await fetch('http://localhost:8000/api/user/change-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        setPasswordMessage({ type: 'success', text: 'Đổi mật khẩu thành công!' });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPasswordMessage({
          type: 'error',
          text: data.error === 'Current password is incorrect'
            ? 'Mật khẩu hiện tại không đúng'
            : 'Có lỗi xảy ra khi đổi mật khẩu'
        });
      }
    } catch (error) {
      console.error('Change password error:', error);
      setPasswordMessage({ type: 'error', text: 'Có lỗi xảy ra khi đổi mật khẩu' });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Logout
  async function logOut() {
    await fetch("http://localhost:8000/api/auth/logout/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include'
    });
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('userLogoutSuccess'));
    navigate("/login");
  }

  return (
    <div className="profile-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="user-info">
          {user?.role === 'company' && companyInfo ? (
            <>
              <div className="user-avatar">
                {companyInfo.logo ? (
                  <img
                    src={companyInfo.logo}
                    alt={companyInfo.name}
                    className="company-logo-avatar"
                  />
                ) : (
                  <div className="avatar-placeholder">
                    {companyInfo.name?.charAt(0).toUpperCase() || 'C'}
                  </div>
                )}
              </div>
              <h3 className="username">{companyInfo.name || 'Loading...'}</h3>
              <p className="user-role">Company</p>
            </>
          ) : (
            <>
              <div className="user-avatar">
                <div className="avatar-placeholder">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
              </div>
              <h3 className="username">{user?.username || 'Loading...'}</h3>
              <p className="user-role">{user?.role || 'User'}</p>
            </>
          )}
        </div>

        <nav className="sidebar-nav">
          <ul>
            <li>
              <button
                className={`nav-link ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Thông tin cá nhân
              </button>
            </li>
            <li>
              <button
                className={`nav-link ${activeTab === 'applications' ? 'active' : ''}`}
                onClick={() => setActiveTab('applications')}
              >
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Danh sách ứng tuyển
              </button>
            </li>
            <li>
              <button
                className={`nav-link ${activeTab === 'favorites' ? 'active' : ''}`}
                onClick={() => setActiveTab('favorites')}
              >
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Job yêu thích
              </button>
            </li>
            <li>
              <button
                className={`nav-link ${activeTab === 'password' ? 'active' : ''}`}
                onClick={() => setActiveTab('password')}
              >
                <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2m0 0V7a2 2 0 012-2m6 0V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2m8 0V7a2 2 0 00-2-2H9a2 2 0 00-2 2v2" />
                </svg>
                Đổi mật khẩu
              </button>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button onClick={logOut} className="logout-btn">
            <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {activeTab === 'profile' && (
          <div className="content-section">
            <div className="section-header-with-action">
              <h2>Thông tin cá nhân</h2>
            </div>

            <div className="profile-card">
              {profileLoading ? (
                <div className="loading-container">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600"></div>
                  <span>Đang tải thông tin...</span>
                </div>
              ) : user?.role === 'company' ? (
                companyInfo ? (
                  <div className="profile-details">
                    <div className="detail-row">
                      <label>Tên công ty:</label>
                      <span>{companyInfo.name || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <label>Email:</label>
                      <span>{companyInfo.email || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <label>Số điện thoại:</label>
                      <span>{companyInfo.phone || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <label>Website:</label>
                      <span>
                        {companyInfo.website ? (
                          <a href={companyInfo.website} target="_blank" rel="noreferrer" className="cv-link">
                            {companyInfo.website}
                          </a>
                        ) : 'N/A'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <label>Địa chỉ:</label>
                      <span>{companyInfo.address || 'N/A'}</span>
                    </div>
                    {companyInfo.logo && (
                      <div className="detail-row">
                        <label>Logo:</label>
                        <span>
                          <img src={companyInfo.logo} alt="Company Logo" style={{ maxWidth: '100px', borderRadius: '8px' }} />
                        </span>
                      </div>
                    )}
                    <div className="detail-row description-row">
                      <label>Mô tả:</label>
                      <p className="description-text">{companyInfo.description || 'Chưa có mô tả'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="no-profile">
                    <h3>Chưa có thông tin công ty</h3>
                    <p>Công ty của bạn chưa được thiết lập trong hệ thống.</p>
                  </div>
                )
              ) : (
                userProfile ? (
                  <div className="profile-details">
                    <div className="detail-row">
                      <label>Họ & tên:</label>
                      <span>{userProfile.name || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <label>Số điện thoại:</label>
                      <span>{userProfile.phone || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <label>Giới tính:</label>
                      <span>{userProfile.gender ? userProfile.gender.charAt(0).toUpperCase() + userProfile.gender.slice(1) : 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <label>Ngày sinh:</label>
                      <span>{userProfile.birthdate ? new Date(userProfile.birthdate).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <label>CV:</label>
                      <span>
                        {userProfile.cv ? (
                          <a href={userProfile.cv} target="_blank" rel="noreferrer" className="cv-link">Xem CV</a>
                        ) : 'Chưa có'}
                      </span>
                    </div>
                    <div className="detail-row description-row">
                      <label>Mô tả:</label>
                      <p className="description-text">{userProfile.description || 'Chưa có mô tả'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="no-profile">
                    <h3>Chưa có thông tin cá nhân</h3>
                    <p>Bạn chưa thêm hồ sơ cá nhân. Thêm thông tin để hoàn thiện hồ sơ ứng tuyển.</p>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {activeTab === 'favorites' && (
          <div className="content-section">
            <div className="section-header">
              <h2>Job yêu thích</h2>
              <p className="section-subtitle">{favoriteJobs.length} job đã yêu thích</p>
            </div>

            {favoritesLoading ? (
              <div className="loading-container">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600"></div>
                <span>Đang tải...</span>
              </div>
            ) : favoriteJobs.length === 0 ? (
              <div className="empty-state">
                <svg className="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <p>Chưa có job yêu thích</p>
                <p>Bạn chưa lưu job nào. Hãy khám phá và lưu những job bạn quan tâm!</p>
                <Link to="/" className="browse-btn">Khám phá job</Link>
              </div>
            ) : (
              <div className="favorites-grid">
                {favoriteJobs.map((job) => (
                  <div
                    key={job._id}
                    className="favorite-job-card"
                    onClick={() => navigate(`/job/${job._id}`)}
                  >
                    <div className="job-card-header">
                      <div className="company-logo-small">
                        <img src={job.thumbnail} alt={job.company_name} width={48} height={48} />
                      </div>
                      <div className="job-card-info">
                        <h4 className="job-card-title">{job.job_title}</h4>
                        <p className="company-card-name">{job.company_name}</p>
                      </div>
                    </div>
                    <div className="job-card-details">
                      <div className="detail-row">
                        <svg className="detail-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{job.province}</span>
                      </div>
                      <div className="detail-row">
                        <svg className="detail-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                        <span>{job.salary}</span>
                      </div>
                    </div>
                    <div className="job-card-skills">
                      {job.skills?.slice(0, 3).map((skill, index) => (
                        <span key={index} className="skill-tag-small">{skill}</span>
                      ))}
                      {job.skills?.length > 3 && (
                        <span className="more-skills">+{job.skills.length - 3}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'applications' && (
          <div className="content-section">
            <h2>Danh sách ứng tuyển</h2>
            {applicationsLoading ? (
              <div className="loading-container">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600"></div>
                <span>Đang tải...</span>
              </div>
            ) : applications.length === 0 ? (
              <div className="empty-state">
                <svg className="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>Bạn chưa ứng tuyển công việc nào</p>
              </div>
            ) : (
              <div className="applications-table-container">
                <table className="applications-table">
                  <thead>
                    <tr>
                      <th>Tên công việc</th>
                      <th>Tên công ty</th>
                      <th>Trạng thái</th>
                      <th>Thời gian ứng tuyển</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((application) => (
                      <tr key={application._id}>
                        <td>
                          <div className="job-title-cell">
                            {application.JobDetailID?.job_title || 'Chưa rõ'}
                          </div>
                        </td>
                        <td>{application.JobDetailID?.company_name || 'Chưa rõ'}</td>
                        <td className="status-cell">{application.status || 'chưa duyệt'}</td>
                        <td>{new Date(application.time).toLocaleString('vi-VN')}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              onClick={() => navigate(`/job/${application.JobDetailID?._id}`)}
                              className="view-detail-btn"
                              title="Xem chi tiết"
                              disabled={!application.JobDetailID?._id}
                            >
                              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteApplication(application._id)}
                              className="delete-btn"
                              title="Xóa đơn ứng tuyển"
                            >
                              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'password' && (
          <div className="content-section">
            <h2>Đổi mật khẩu</h2>
            <form className="password-form" onSubmit={handlePasswordSubmit}>
              {passwordMessage.text && (
                <div className={`message ${passwordMessage.type}`}>
                  {passwordMessage.text}
                </div>
              )}

              <div className="end-form-group">
                <label htmlFor="current-password">Mật khẩu hiện tại:</label>
                <input
                  type="password"
                  id="current-password"
                  name="currentPassword"
                  className="form-input"
                  placeholder="Nhập mật khẩu hiện tại"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordChange}
                  disabled={passwordLoading}
                />
              </div>

              <div className="end-form-group">
                <label htmlFor="new-password">Mật khẩu mới:</label>
                <input
                  type="password"
                  id="new-password"
                  name="newPassword"
                  className="form-input"
                  placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  disabled={passwordLoading}
                />
              </div>

              <div className="end-form-group">
                <label htmlFor="confirm-password">Xác nhận mật khẩu mới:</label>
                <input
                  type="password"
                  id="confirm-password"
                  name="confirmPassword"
                  className="form-input"
                  placeholder="Xác nhận mật khẩu mới"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  disabled={passwordLoading}
                />
              </div>

              <button type="submit" className="update-btn" disabled={passwordLoading}>
                {passwordLoading ? (
                  <div className="button-loading">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Đang cập nhật...
                  </div>
                ) : (
                  'Cập nhật mật khẩu'
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
