import React, { useEffect, useState } from "react";
import "../admin.css";
import Pagination from "./components/Pagination";

export default function CompanyManager() {
  const [companies, setCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [newCompany, setNewCompany] = useState({
    name: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    description: '',
    username: '',
    password: ''
  });
  const itemsPerPage = 20;

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    // Filter companies based on search term
    if (searchTerm.trim() === "") {
      setFilteredCompanies(companies);
    } else {
      const filtered = companies.filter(company => 
        company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (company.email && company.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (company.username && company.username.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredCompanies(filtered);
      setCurrentPage(1);
    }
  }, [searchTerm, companies]);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/companies-list/', {
        credentials: 'include'
      });
      
      console.log('Companies response status:', response.status); // Debug
      
      if (response.ok) {
        const data = await response.json();
        console.log('Companies data:', data); // Debug
        setCompanies(data.companies || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error fetching companies:', response.status, errorData);
        alert(`Lỗi: ${errorData.error || 'Không thể tải danh sách công ty'}`);
        setCompanies([]);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
      alert('Lỗi kết nối: ' + error.message);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (companyId, companyName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa công ty "${companyName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/companies-list/${companyId}/`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        alert('Xóa công ty thành công!');
        setSelectedCompanyIds((prev) => prev.filter((id) => id !== companyId));
        fetchCompanies();
      } else {
        const data = await response.json();
        alert(data.error || 'Có lỗi xảy ra khi xóa công ty');
      }
    } catch (error) {
      console.error('Error deleting company:', error);
      alert('Có lỗi xảy ra khi xóa công ty');
    }
  };

  const handleSelectCompany = (companyId) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(companyId) ? prev.filter((id) => id !== companyId) : [...prev, companyId]
    );
  };

  const handleSelectAllCompanies = (checked, companiesToSelect) => {
    setSelectedCompanyIds((prev) => {
      const pageIds = companiesToSelect.map((company) => company.id);
      if (checked) {
        return Array.from(new Set([...prev, ...pageIds]));
      }
      return prev.filter((id) => !pageIds.includes(id));
    });
  };

  const handleBulkDeleteCompanies = async () => {
    if (selectedCompanyIds.length === 0) return;

    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedCompanyIds.length} công ty đã chọn?`)) {
      return;
    }

    try {
      const results = await Promise.allSettled(
        selectedCompanyIds.map((companyId) =>
          fetch(`/api/admin/companies-list/${companyId}/`, {
            method: 'DELETE',
            credentials: 'include'
          }).then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data.error || 'Có lỗi xảy ra khi xóa công ty');
            }
            return companyId;
          })
        )
      );

      const failedCount = results.filter((result) => result.status === 'rejected').length;
      const successCount = selectedCompanyIds.length - failedCount;

      if (failedCount > 0) {
        alert(`Đã xóa ${successCount} công ty. ${failedCount} công ty xóa thất bại.`);
      } else {
        alert(`Đã xóa ${successCount} công ty thành công!`);
      }

      setSelectedCompanyIds([]);
      fetchCompanies();
    } catch (error) {
      console.error('Error bulk deleting companies:', error);
      alert('Có lỗi xảy ra khi xóa hàng loạt công ty');
    }
  };

  const handleAddCompany = async (e) => {
    e.preventDefault();
    
    if (!newCompany.name || !newCompany.username || !newCompany.password) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc (Tên, Username, Password)');
      return;
    }

    try {
      const response = await fetch('/api/admin/companies-list/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(newCompany)
      });

      if (response.ok) {
        alert('Thêm công ty thành công!');
        setShowAddForm(false);
        setNewCompany({
          name: '',
          email: '',
          phone: '',
          website: '',
          address: '',
          description: '',
          username: '',
          password: ''
        });
        fetchCompanies();
      } else {
        const data = await response.json();
        alert(data.error || 'Có lỗi xảy ra khi thêm công ty');
      }
    } catch (error) {
      console.error('Error adding company:', error);
      alert('Có lỗi xảy ra khi thêm công ty');
    }
  };

  const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCompanies = filteredCompanies.slice(startIndex, endIndex);
  const allPaginatedCompaniesSelected =
    paginatedCompanies.length > 0 &&
    paginatedCompanies.every((company) => selectedCompanyIds.includes(company.id));

  return (
    <div>
      <div className="admin-content-header">
        <h1 className="admin-content-title">Quản lý công ty</h1>
        <p className="admin-content-subtitle">Danh sách tất cả công ty trong hệ thống</p>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          Đang tải danh sách công ty...
        </div>
      ) : (
        <div className="companies-section">
          <div className="companies-header">
            <h2>Danh sách công ty ({filteredCompanies.length})</h2>
            <div style={{display: 'flex', gap: '12px'}}>
              {selectedCompanyIds.length > 0 && (
                <button
                  className="delete-btn"
                  onClick={handleBulkDeleteCompanies}
                >
                  Xóa đã chọn ({selectedCompanyIds.length})
                </button>
              )}
              <button 
                className="refresh-btn" 
                onClick={() => setShowAddForm(true)}
                style={{background: '#3b82f6', color: 'white', border: 'none'}}
              >
                + Thêm công ty
              </button>
              <button className="refresh-btn" onClick={fetchCompanies}>
                <svg className="refresh-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
                </svg>
                Làm mới
              </button>
            </div>
          </div>

          {/* Add Company Modal */}
          {showAddForm && (
            <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2 className="modal-title">Thêm công ty mới</h2>
                </div>
                <form onSubmit={handleAddCompany}>
                  <div className="form-group">
                    <label className="form-label">Tên công ty *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newCompany.name}
                      onChange={(e) => setNewCompany({...newCompany, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Username *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newCompany.username}
                      onChange={(e) => setNewCompany({...newCompany, username: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <input
                      type="password"
                      className="form-input"
                      value={newCompany.password}
                      onChange={(e) => setNewCompany({...newCompany, password: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      value={newCompany.email}
                      onChange={(e) => setNewCompany({...newCompany, email: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Số điện thoại</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newCompany.phone}
                      onChange={(e) => setNewCompany({...newCompany, phone: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Website</label>
                    <input
                      type="url"
                      className="form-input"
                      value={newCompany.website}
                      onChange={(e) => setNewCompany({...newCompany, website: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Địa chỉ</label>
                    <textarea
                      className="form-textarea"
                      value={newCompany.address}
                      onChange={(e) => setNewCompany({...newCompany, address: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mô tả</label>
                    <textarea
                      className="form-textarea"
                      value={newCompany.description}
                      onChange={(e) => setNewCompany({...newCompany, description: e.target.value})}
                    />
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>
                      Hủy
                    </button>
                    <button type="submit" className="btn-primary">
                      Thêm công ty
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="Tìm kiếm theo tên công ty, email hoặc username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="companies-table-container">
            <table className="companies-table">
              <thead>
                <tr>
                  <th style={{ width: '48px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allPaginatedCompaniesSelected}
                      disabled={paginatedCompanies.length === 0}
                      onChange={(e) => handleSelectAllCompanies(e.target.checked, paginatedCompanies)}
                      title="Chọn tất cả trên trang hiện tại"
                    />
                  </th>
                  <th>Tên công ty</th>
                  <th>Email</th>
                  <th>Số điện thoại</th>
                  <th>Username</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCompanies.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="no-companies">
                      Không tìm thấy công ty nào
                    </td>
                  </tr>
                ) : (
                  paginatedCompanies.map((company) => (
                    <tr key={company.id} className="company-row">
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedCompanyIds.includes(company.id)}
                          onChange={() => handleSelectCompany(company.id)}
                          title="Chọn công ty"
                        />
                      </td>
                      <td>{company.name}</td>
                      <td>{company.email || 'N/A'}</td>
                      <td>{company.phone || 'N/A'}</td>
                      <td>{company.username || 'N/A'}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="delete-btn"
                            onClick={() => handleDelete(company.id, company.name)}
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
