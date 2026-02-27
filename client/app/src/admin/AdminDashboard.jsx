import React, { useEffect, useState } from "react";
import "../admin.css";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalJobs: 0,
    totalCompanies: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/admin/stats/', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats || {
          totalUsers: 0,
          totalJobs: 0,
          totalCompanies: 0
        });
      } else {
        console.error('Error fetching stats:', response.status);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span>Đang tải dữ liệu...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-content-header">
        <h1 className="admin-content-title">Dashboard</h1>
        <p className="admin-content-subtitle">Tổng quan hệ thống</p>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card users">
          <div className="stat-label">Tổng số người dùng</div>
          <div className="stat-number">{stats.totalUsers}</div>
        </div>

        <div className="stat-card jobs">
          <div className="stat-label">Tổng số công việc</div>
          <div className="stat-number">{stats.totalJobs}</div>
        </div>

        <div className="stat-card companies">
          <div className="stat-label">Tổng số công ty</div>
          <div className="stat-number">{stats.totalCompanies}</div>
        </div>
      </div>
    </div>
  );
}
