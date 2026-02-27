import React, { useState, useEffect } from 'react';

export default function UserSearch({ users, onFilteredResults }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    let filtered = users;

    // Filter by search term
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(user => 
        user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user._id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by role
    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    onFilteredResults(filtered);
  }, [searchTerm, roleFilter, users, onFilteredResults]);

  return (
    <div className="search-box" style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
      <input
        type="text"
        className="search-input"
        placeholder="Tìm kiếm theo tên, ID hoặc vai trò..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{
          flex: 1,
          padding: '10px 16px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '14px',
          outline: 'none'
        }}
      />
      
      <select
        value={roleFilter}
        onChange={(e) => setRoleFilter(e.target.value)}
        style={{
          padding: '10px 16px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '14px',
          outline: 'none',
          backgroundColor: 'white',
          cursor: 'pointer',
          minWidth: '150px'
        }}
      >
        <option value="all">Tất cả vai trò</option>
        <option value="admin">Quản trị viên</option>
        <option value="company">Công ty</option>
        <option value="user">Người dùng</option>
      </select>
    </div>
  );
}
