import React, { useEffect, useState } from "react";
import "../admin.css";
import Pagination from "./components/Pagination";

export default function JobManager() {
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    // Filter jobs based on search term
    if (searchTerm.trim() === "") {
      setFilteredJobs(jobs);
    } else {
      const filtered = jobs.filter(job => 
        job.job_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.company_name && job.company_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (job.province && job.province.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredJobs(filtered);
      setCurrentPage(1);
    }
  }, [searchTerm, jobs]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/jobs/', {
        credentials: 'include'
      });
      
      console.log('Jobs response status:', response.status); // Debug
      
      if (response.ok) {
        const data = await response.json();
        console.log('Jobs data:', data); // Debug
        setJobs(data.data || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error fetching jobs:', response.status, errorData);
        alert(`Lỗi: ${errorData.error || 'Không thể tải danh sách công việc'}`);
        setJobs([]);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
      alert('Lỗi kết nối: ' + error.message);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (jobId) => {
    setSelectedJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  };

  const handleToggleSelectAll = () => {
    const pageIds = paginatedJobs.map((job) => job.id);
    const isAllSelected = pageIds.length > 0 && pageIds.every((id) => selectedJobIds.includes(id));
    setSelectedJobIds((prev) =>
      isAllSelected
        ? prev.filter((id) => !pageIds.includes(id))
        : Array.from(new Set([...prev, ...pageIds]))
    );
  };

  const handleBulkDelete = async () => {
    if (selectedJobIds.length === 0) {
      alert("Vui lòng chọn ít nhất một công việc");
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedJobIds.length} công việc đã chọn?`)) {
      return;
    }

    try {
      const results = await Promise.allSettled(
        selectedJobIds.map((jobId) =>
          fetch(`/api/admin/jobs/${jobId}/`, {
            method: "DELETE",
            credentials: "include",
          })
        )
      );
      const failed = results.filter((result) => result.status !== "fulfilled" || !result.value.ok).length;
      alert(failed ? `Đã xóa ${selectedJobIds.length - failed} công việc, lỗi ${failed} công việc` : "Xóa hàng loạt công việc thành công!");
      setSelectedJobIds([]);
      fetchJobs();
    } catch (error) {
      console.error("Error bulk deleting jobs:", error);
      alert("Có lỗi xảy ra khi xóa hàng loạt công việc");
    }
  };

  const handleBulkEdit = () => {
    if (selectedJobIds.length !== 1) {
      alert("Vui lòng chọn đúng 1 công việc để sửa");
      return;
    }
    window.open(`/admin/jobs/${selectedJobIds[0]}/edit`, "_blank");
  };

  const handleDelete = async (jobId, jobTitle) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa công việc "${jobTitle}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        alert('Xóa công việc thành công!');
        fetchJobs();
      } else {
        const data = await response.json();
        alert(data.error || 'Có lỗi xảy ra khi xóa công việc');
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Có lỗi xảy ra khi xóa công việc');
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  };

  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedJobs = filteredJobs.slice(startIndex, endIndex);
  const isAllCurrentPageSelected = paginatedJobs.length > 0 && paginatedJobs.every((job) => selectedJobIds.includes(job.id));

  return (
    <div>
      <div className="admin-content-header">
        <h1 className="admin-content-title">Quản lý công việc</h1>
        <p className="admin-content-subtitle">Danh sách tất cả công việc trong hệ thống</p>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          Đang tải danh sách công việc...
        </div>
      ) : (
        <div className="jobs-section">
          <div className="jobs-header">
            <h2>Danh sách công việc ({filteredJobs.length})</h2>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {selectedJobIds.length > 0 && (
                <>
                  <button className="edit-company-btn" onClick={handleBulkEdit}>
                    Sửa
                  </button>
                  <button className="delete-btn" onClick={handleBulkDelete}>
                    Xóa đã chọn ({selectedJobIds.length})
                  </button>
                </>
              )}
              <button className="refresh-btn" onClick={fetchJobs}>
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
              placeholder="Tìm kiếm theo tên công việc, công ty hoặc địa điểm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="jobs-table-container">
            <table className="jobs-table">
              <thead>
                <tr>
                  <th style={{ width: "48px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={isAllCurrentPageSelected}
                      onChange={handleToggleSelectAll}
                      title="Chọn tất cả trên trang này"
                    />
                  </th>
                  <th>Tên công việc</th>
                  <th>Công ty</th>
                  <th>Địa điểm</th>
                  <th>Lượt theo dõi</th>
                  <th>Ngày thu thập</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="no-jobs">
                      Không tìm thấy công việc nào
                    </td>
                  </tr>
                ) : (
                  paginatedJobs.map((job) => (
                    <tr key={job.id} className="job-row">
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedJobIds.includes(job.id)}
                          onChange={() => handleToggleSelect(job.id)}
                        />
                      </td>
                      <td>
                        <div style={{maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                          {job.job_title}
                        </div>
                      </td>
                      <td>{job.company_name || 'N/A'}</td>
                      <td>{job.province || 'N/A'}</td>
                      <td style={{textAlign: 'center'}}>{job.followCount || 0}</td>
                      <td>{formatDate(job.collected_at)}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="delete-btn"
                            onClick={() => handleDelete(job.id, job.job_title)}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      )}
    </div>
  );
}
