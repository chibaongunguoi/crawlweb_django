import React, { useState, useEffect } from 'react';
import './admin.css';

const ScrapeManager = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, []);

  // Poll for active job status
  useEffect(() => {
    if (!activeJobId || !polling) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/scrape/status/${activeJobId}/`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          const job = data.job;
          
          // Update job in list
          setJobs(prevJobs => 
            prevJobs.map(j => j.id === activeJobId ? job : j)
          );
          
          // Stop polling if job is complete or failed
          if (job.status === 'completed' || job.status === 'failed') {
            setPolling(false);
            setActiveJobId(null);
            fetchJobs(); // Refresh full list
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [activeJobId, polling]);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/scrape/jobs/', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Parse URLs from input (one per line)
    const urls = urlInput
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);
    
    if (urls.length === 0) {
      alert('Vui lòng nhập ít nhất một URL');
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/scrape/upload/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ urls }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit URLs');
      }
      
      const data = await response.json();
      
      // Clear input
      setUrlInput('');
      
      // Start polling for this job
      setActiveJobId(data.jobId);
      setPolling(true);
      
      // Refresh job list
      fetchJobs();
      
      alert('Đã bắt đầu crawl dữ liệu!');
    } catch (err) {
      console.error('Error submitting URLs:', err);
      setError(err.message);
      alert('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (jobId) => {
    if (!window.confirm('Bạn có chắc muốn xóa công việc này?')) {
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/scrape/jobs/${jobId}/`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete job');
      }
      
      // Refresh list
      fetchJobs();
    } catch (err) {
      console.error('Error deleting job:', err);
      alert('Lỗi khi xóa: ' + err.message);
    }
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      pending: 'status-badge status-pending',
      processing: 'status-badge status-processing',
      completed: 'status-badge status-completed',
      failed: 'status-badge status-failed',
    };
    
    const statusText = {
      pending: 'Đang chờ',
      processing: 'Đang xử lý',
      completed: 'Hoàn thành',
      failed: 'Thất bại',
    };
    
    return (
      <span className={statusClasses[status] || 'status-badge'}>
        {statusText[status] || status}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN');
  };

  return (
    <div className="admin-content">
      <div className="admin-header">
        <h1>Quản Lý Crawl Dữ Liệu</h1>
      </div>

      {error && (
        <div className="error-message" style={{ 
          padding: '10px', 
          marginBottom: '20px', 
          backgroundColor: '#ffebee', 
          color: '#c62828',
          borderRadius: '4px' 
        }}>
          {error}
        </div>
      )}

      {/* Submit URLs Form */}
      <div className="card" style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '15px' }}>Thêm URL Crawl Mới</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>URLs (mỗi URL một dòng):</label>
            <textarea
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.topcv.vn/tim-viec-lam-python&#10;https://www.topcv.vn/tim-viec-lam-react"
              rows="6"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '14px',
              }}
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !urlInput.trim()}
          >
            {submitting ? 'Đang gửi...' : 'Bắt Đầu Crawl'}
          </button>
        </form>
      </div>

      {/* Jobs List */}
      <div className="card">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px' 
        }}>
          <h2>Lịch Sử Crawl</h2>
          <button 
            onClick={fetchJobs} 
            className="btn btn-secondary"
            disabled={loading}
          >
            {loading ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>

        {loading && jobs.length === 0 ? (
          <p>Đang tải dữ liệu...</p>
        ) : jobs.length === 0 ? (
          <p>Chưa có công việc crawl nào</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Trạng Thái</th>
                  <th>Tiến Độ</th>
                  <th>URLs</th>
                  <th>Công Việc</th>
                  <th>Tạo Lúc</th>
                  <th>Hoàn Thành</th>
                  <th>Lỗi</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {job.id.substring(0, 8)}...
                    </td>
                    <td>{getStatusBadge(job.status)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          flex: 1,
                          height: '20px',
                          backgroundColor: '#e0e0e0',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          minWidth: '100px',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${job.progress || 0}%`,
                            backgroundColor: job.status === 'completed' ? '#4caf50' : 
                                           job.status === 'failed' ? '#f44336' : '#2196f3',
                            transition: 'width 0.3s',
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {job.progress || 0}%
                        </span>
                      </div>
                    </td>
                    <td>
                      {job.processedUrls}/{job.totalUrls}
                    </td>
                    <td>
                      <strong>{job.jobCount || 0}</strong> jobs
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {formatDate(job.createdAt)}
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {formatDate(job.completedAt)}
                    </td>
                    <td style={{ 
                      fontSize: '12px', 
                      color: job.errorMessage ? '#c62828' : '#666',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {job.errorMessage || '-'}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="btn-delete"
                        style={{
                          padding: '5px 10px',
                          fontSize: '12px',
                        }}
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
    </div>
  );
};

export default ScrapeManager;
