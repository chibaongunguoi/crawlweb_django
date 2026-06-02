import React, { useEffect, useState } from "react";
import "../admin.css";

export default function NotificationManager() {
  const [notifications, setNotifications] = useState([]);
  const [filteredNotifications, setFilteredNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNotificationIds, setSelectedNotificationIds] = useState([]);

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    // Filter notifications based on search term
    if (searchTerm.trim() === "") {
      setFilteredNotifications(notifications);
    } else {
      const filtered = notifications.filter(notif => 
        notif.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (notif.userID && notif.userID.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (notif.userProfile?.name && notif.userProfile.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredNotifications(filtered);
    }
  }, [searchTerm, notifications]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/notifications/', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.data || []);
      } else {
        console.error('Error fetching notifications');
        setNotifications([]);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNotification = async (notificationId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa thông báo này?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/notifications/${notificationId}/`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        alert('Xóa thông báo thành công!');
        setSelectedNotificationIds((prev) => prev.filter((id) => id !== notificationId));
        fetchNotifications();
      } else {
        const data = await response.json();
        alert(data.error || 'Lỗi khi xóa thông báo');
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      alert('Lỗi khi xóa thông báo');
    }
  };

  const handleSelectNotification = (notificationId) => {
    setSelectedNotificationIds((prev) =>
      prev.includes(notificationId)
        ? prev.filter((id) => id !== notificationId)
        : [...prev, notificationId]
    );
  };

  const handleSelectAllNotifications = (checked, notificationsToSelect) => {
    setSelectedNotificationIds((prev) => {
      const pageIds = notificationsToSelect.map((n) => n.id);
      if (checked) {
        return Array.from(new Set([...prev, ...pageIds]));
      }
      return prev.filter((id) => !pageIds.includes(id));
    });
  };

  const handleBulkDeleteNotifications = async () => {
    if (selectedNotificationIds.length === 0) return;

    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedNotificationIds.length} thông báo đã chọn?`)) {
      return;
    }

    try {
      const results = await Promise.allSettled(
        selectedNotificationIds.map((notificationId) =>
          fetch(`/api/admin/notifications/${notificationId}/`, {
            method: 'DELETE',
            credentials: 'include'
          }).then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data.error || 'Lỗi khi xóa thông báo');
            }
            return notificationId;
          })
        )
      );

      const failedCount = results.filter((r) => r.status === 'rejected').length;
      const successCount = selectedNotificationIds.length - failedCount;

      if (failedCount > 0) {
        alert(`Đã xóa ${successCount} thông báo. ${failedCount} thông báo xóa thất bại.`);
      } else {
        alert(`Đã xóa ${successCount} thông báo thành công!`);
      }

      setSelectedNotificationIds([]);
      fetchNotifications();
    } catch (error) {
      console.error('Error bulk deleting notifications:', error);
      alert('Có lỗi xảy ra khi xóa hàng loạt thông báo');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="admin-content notification-manager-container">
      {/* Header */}
      <div className="admin-content-header">
        <h1 className="admin-content-title">Quản lý thông báo</h1>
        <p className="admin-content-subtitle">Danh sách tất cả thông báo trong hệ thống</p>
      </div>

      {loading ? (
        <div className="notification-loading">
          <div className="loading-spinner"></div>
          <p>Đang tải thông báo...</p>
        </div>
      ) : (
        <div className="notifications-section">
          <div className="notifications-header">
            <h2>Danh sách thông báo ({filteredNotifications.length})</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {selectedNotificationIds.length > 0 && (
                <button
                  className="delete-btn"
                  onClick={handleBulkDeleteNotifications}
                  style={{ padding: '8px 14px' }}
                >
                  Xóa đã chọn ({selectedNotificationIds.length})
                </button>
              )}
              <button className="refresh-btn" onClick={fetchNotifications}>
              <svg className="refresh-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
              </svg>
                Làm mới
              </button>
            </div>
          </div>

          <div className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="Tìm kiếm theo người nhận hoặc nội dung..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="notification-empty" style={{textAlign: 'center', padding: '48px 24px'}}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64" style={{margin: '0 auto', color: '#94a3b8'}}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <h3>{notifications.length === 0 ? 'Chưa có thông báo nào' : 'Không tìm thấy thông báo phù hợp'}</h3>
              <p>Các thông báo sẽ xuất hiện tại đây</p>
            </div>
          ) : (
            <div className="notification-table-wrapper">
              <table className="notification-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr>
                    <th style={{padding: '12px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', width: '48px'}}>
                      <input
                        type="checkbox"
                        checked={filteredNotifications.length > 0 && filteredNotifications.every((n) => selectedNotificationIds.includes(n.id))}
                        disabled={filteredNotifications.length === 0}
                        onChange={(e) => handleSelectAllNotifications(e.target.checked, filteredNotifications)}
                        title="Chọn tất cả"
                      />
                    </th>
                    <th style={{padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0'}}>Người nhận</th>
                    <th style={{padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0'}}>Công việc</th>
                    <th style={{padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0'}}>Nội dung</th>
                    <th style={{padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0'}}>Trạng thái</th>
                    <th style={{padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0'}}>Thời gian</th>
                    <th style={{padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0'}}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotifications.map((notification) => (
                    <tr key={notification.id} style={{borderBottom: '1px solid #e2e8f0'}}>
                      <td style={{padding: '16px', textAlign: 'center'}}>
                        <input
                          type="checkbox"
                          checked={selectedNotificationIds.includes(notification.id)}
                          onChange={() => handleSelectNotification(notification.id)}
                          title="Chọn thông báo"
                        />
                      </td>
                      <td style={{padding: '16px'}}>
                        <div className="user-cell">
                          <span className="user-name">
                            {notification.userProfile?.name || notification.userID || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td style={{padding: '16px'}}>
                        <div className="job-cell">
                          <div className="job-title">
                            {notification.JobDetailID?.job_title || 'N/A'}
                          </div>
                        </div>
                      </td>
                      <td style={{padding: '16px'}}>
                        <div className="content-cell">
                          <div className="notification-content">
                            {notification.content}
                          </div>
                        </div>
                      </td>
                      <td style={{padding: '16px'}}>
                        <span 
                          className={`notification-status ${notification.status === 'chưa đọc' ? 'unread' : 'read'}`}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            background: notification.status === 'chưa đọc' ? '#fef3c7' : '#dbeafe',
                            color: notification.status === 'chưa đọc' ? '#92400e' : '#1e40af'
                          }}
                        >
                          {notification.status}
                        </span>
                      </td>
                      <td style={{padding: '16px'}}>
                        <div className="time-cell">
                          {formatDate(notification.createdAt)}
                        </div>
                      </td>
                      <td className="action-cell" style={{padding: '16px'}}>
                        <button
                          onClick={() => handleDeleteNotification(notification.id)}
                          className="delete-btn"
                          title="Xóa thông báo"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
