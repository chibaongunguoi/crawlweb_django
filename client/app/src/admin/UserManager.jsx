import React, { useEffect, useState } from "react";
import "./admin.css";
import Pagination from "./components/Pagination";
import EditUserProfileForm from "../ui/components/EditUserProfileForm";
import UserSearch from "./components/UserSearch";

export default function UserManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users/', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        console.error('Response not ok:', response.status, response.statusText);
        setUsers([]);
        return;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Response is not JSON:', contentType);
        setUsers([]);
        return;
      }

      const text = await response.text();
      if (!text) {
        console.error('Empty response body');
        setUsers([]);
        return;
      }

      const data = JSON.parse(text);
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUserId(user.username);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingUserId(null);
  };

  const handleSaveProfile = () => {
    setShowEditModal(false);
    setEditingUserId(null);
    fetchUsers(); // Refresh the list
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa người dùng này?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('Xóa người dùng thành công!');
        setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
        fetchUsers();
      } else {
        alert(data.error || 'Có lỗi xảy ra khi xóa người dùng');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Có lỗi xảy ra khi xóa người dùng');
    }
  };

  const handleSelectUser = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllUsers = (checked, selectableUsers) => {
    setSelectedUserIds((prev) => {
      const pageIds = selectableUsers.map((user) => user.id);
      if (checked) {
        return Array.from(new Set([...prev, ...pageIds]));
      }
      return prev.filter((id) => !pageIds.includes(id));
    });
  };

  const handleBulkDelete = async () => {
    if (selectedUserIds.length === 0) return;

    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedUserIds.length} người dùng đã chọn?`)) {
      return;
    }

    try {
      const results = await Promise.allSettled(
        selectedUserIds.map((userId) =>
          fetch(`/api/admin/users/${userId}/`, {
            method: 'DELETE',
            credentials: 'include'
          }).then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) {
              throw new Error(data.error || 'Có lỗi xảy ra khi xóa người dùng');
            }
            return userId;
          })
        )
      );

      const failedCount = results.filter((result) => result.status === 'rejected').length;
      const successCount = selectedUserIds.length - failedCount;

      if (failedCount > 0) {
        alert(`Đã xóa ${successCount} người dùng. ${failedCount} người dùng xóa thất bại.`);
      } else {
        alert(`Đã xóa ${successCount} người dùng thành công!`);
      }

      setSelectedUserIds([]);
      fetchUsers();
    } catch (error) {
      console.error('Error bulk deleting users:', error);
      alert('Có lỗi xảy ra khi xóa hàng loạt người dùng');
    }
  };

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
  const selectablePaginatedUsers = paginatedUsers.filter((user) => user.role !== 'admin');
  const allSelectableUsersSelected =
    selectablePaginatedUsers.length > 0 &&
    selectablePaginatedUsers.every((user) => selectedUserIds.includes(user.id));

  return (
    <div>
      <div className="admin-content-header">
        <h1 className="admin-content-title">Quản lý tài khoản</h1>
        <p className="admin-content-subtitle">Danh sách tất cả tài khoản trong hệ thống</p>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          Đang tải danh sách tài khoản...
        </div>
      ) : (
        <div className="users-section">
          <div className="users-header">
            <h2>danh sách tài khoản ({filteredUsers.length})</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {selectedUserIds.length > 0 && (
                <button
                  className="delete-btn"
                  onClick={handleBulkDelete}
                  style={{ padding: '8px 14px' }}
                >
                  Xóa đã chọn ({selectedUserIds.length})
                </button>
              )}
              <button className="refresh-btn" onClick={fetchUsers}>
              <svg className="refresh-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
              </svg>
                Làm mới
              </button>
            </div>
          </div>

          <UserSearch 
            users={users}
            onFilteredResults={setFilteredUsers}
          />
          
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th style={{ width: '48px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allSelectableUsersSelected}
                      disabled={selectablePaginatedUsers.length === 0}
                      onChange={(e) => handleSelectAllUsers(e.target.checked, selectablePaginatedUsers)}
                      title="Chọn tất cả trên trang hiện tại"
                    />
                  </th>
                  <th>Avatar</th>
                  <th>Tên người dùng</th>
                  <th>Vai trò</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="no-users">
                      Không tìm thấy người dùng nào
                    </td>
                  </tr>
                  ) : (
                    paginatedUsers.map((user) => (
                      <tr key={user.id} className="user-row">
                        <td style={{ textAlign: 'center' }}>
                          {user.role !== 'admin' && (
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(user.id)}
                              onChange={() => handleSelectUser(user.id)}
                              title="Chọn người dùng"
                            />
                          )}
                        </td>
                        <td>
                          <div className="user-avatar">
                            <div className="avatar-circle">
                              {user.username?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                          </div>
                        </td>
                        <td className="username-cell">
                          <div className="username-info">
                            <span className="username">{user.username}</span>
                            <span className="user-id">ID: {user.id}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`role-badge`}>
                            {user.role === 'admin' ? 'Quản trị viên' : user.role === 'company' ? 'Công ty' : 'Người dùng'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleEdit(user)}
                              className="edit-company-btn"
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                              title="Chỉnh sửa"
                            >
                              <svg className="edit-icon" fill="currentColor" viewBox="0 0 20 20" width="14" height="14">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                              </svg>
                            </button>
                            {user.role !== 'admin' && (
                              <button
                                onClick={() => handleDelete(user.id)}
                                className="delete-company-btn"
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                title="Xóa"
                              >
                                <svg className="delete-icon" fill="currentColor" viewBox="0 0 20 20" width="14" height="14">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredUsers.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* Edit User Profile Modal */}
      {showEditModal && editingUserId && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={handleCloseEditModal}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <EditUserProfileForm
              userId={editingUserId}
              onSave={handleSaveProfile}
              onCancel={handleCloseEditModal}
            />
          </div>
        </div>
      )}
    </div>
  );
}
