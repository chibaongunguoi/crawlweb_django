import React, { useEffect, useState } from "react";
import "../admin.css";
import JobsOverTimeChart from "./charts/JobsOverTimeChart";
import TopSkillsChart from "./charts/TopSkillsChart";
import FollowApplyChart from "./charts/FollowApplyChart";
import SourceBreakdownChart from "./charts/SourceBreakdownChart";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalJobs: 0,
    totalCompanies: 0
  });
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState({ from: "", to: "" });
  const [filters, setFilters] = useState({ interval: "day", limit: 15, top: 10 });

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

  const handleDrilldown = (payload) => {
    console.log("Chart drilldown:", payload);
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

      <div className="viz-filters">
        <label>
          Từ ngày
          <input
            type="date"
            value={timeRange.from}
            onChange={(e) => setTimeRange((prev) => ({ ...prev, from: e.target.value }))}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={timeRange.to}
            onChange={(e) => setTimeRange((prev) => ({ ...prev, to: e.target.value }))}
          />
        </label>
        <label>
          Nhóm thời gian
          <select
            value={filters.interval}
            onChange={(e) => setFilters((prev) => ({ ...prev, interval: e.target.value }))}
          >
            <option value="day">Ngày</option>
            <option value="week">Tuần</option>
            <option value="month">Tháng</option>
          </select>
        </label>
      </div>

      <div className="charts-grid">
        <JobsOverTimeChart timeRange={timeRange} filters={filters} onDrilldown={handleDrilldown} />
        <TopSkillsChart timeRange={timeRange} filters={filters} onDrilldown={handleDrilldown} />
        <SourceBreakdownChart timeRange={timeRange} onDrilldown={handleDrilldown} />
        <FollowApplyChart filters={filters} onDrilldown={handleDrilldown} />
      </div>
    </div>
  );
}
