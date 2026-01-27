
import { useState, useEffect, useRef } from "react";
import "./admin.css";

export default function App() {
  const [scrapeUrls, setScrapeUrls] = useState("");
  const [scrapeButtonActive, setScrapeButtonActive] = useState(true);
  const [loadingScrape, setLoadingScrape] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentJobId, setCurrentJobId] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [toast, setToast] = useState({ show: false, type: '', message: '' });
  const [viewModal, setViewModal] = useState({ show: false, job: null });
  const pollingIntervalRef = useRef(null);

  // Show toast notification
  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => {
      setToast({ show: false, type: '', message: '' });
    }, 5000);
  };

  // Poll job status
  const pollJobStatus = async (jobId) => {
    try {
      const response = await fetch(`/api/scrape/status/${jobId}`);
      if (response.ok) {
        const { job } = await response.json();
        
        // Update job in recent jobs list
        setRecentJobs(prev => {
          const index = prev.findIndex(j => j.id === jobId);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = job;
            return updated;
          }
          return [job, ...prev];
        });

        // Update progress message if job is processing
        if (job.status === 'processing' && job.totalUrls > 0) {
          const progressPercent = job.progress || 0;
          const processed = job.processedUrls || 0;
          const total = job.totalUrls || 0;
          setMessage({ 
            type: 'info', 
            text: `Đang xử lý... ${processed}/${total} URL (${progressPercent}%)` 
          });
        }

        // If job is completed or failed, stop polling and show notification
        if (job.status === 'completed' || job.status === 'failed') {
          if (currentJobId === jobId) {
            setCurrentJobId(null);
            setScrapeButtonActive(true);
            setLoadingScrape(false);
            
            if (job.status === 'completed') {
              showToast('success', `Cào dữ liệu thành công! Đã thu thập ${job.jobCount} công việc từ ${job.totalUrls} URL.`);
              setMessage({ type: 'success', text: `Hoàn thành! Đã thu thập ${job.jobCount} công việc từ ${job.totalUrls} URL.` });
              setScrapeUrls("");
            } else {
              showToast('error', `Cào dữ liệu thất bại: ${job.errorMessage || 'Lỗi không xác định'}`);
              setMessage({ type: 'error', text: job.errorMessage || 'Có lỗi xảy ra khi cào dữ liệu!' });
            }
          }
          
          // Stop polling for this job
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      }
    } catch (error) {
      console.error("Error polling job status:", error);
    }
  };

  // Fetch recent jobs on mount
  useEffect(() => {
    const fetchRecentJobs = async () => {
      try {
        const response = await fetch('/api/scrape/jobs');
        if (response.ok) {
          const { jobs } = await response.json();
          setRecentJobs(jobs || []);
        }
      } catch (error) {
        console.error("Error fetching recent jobs:", error);
      }
    };
    
    fetchRecentJobs();
  }, []);

  // Start polling when a job is submitted
  useEffect(() => {
    if (currentJobId) {
      // Poll immediately
      pollJobStatus(currentJobId);
      
      // Then poll every 3 seconds
      pollingIntervalRef.current = setInterval(() => {
        pollJobStatus(currentJobId);
      }, 3000);
    }

    // Cleanup on unmount or when jobId changes
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [currentJobId]);

  // Handle modal keyboard events
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && viewModal.show) {
        closeViewModal();
      }
    };

    if (viewModal.show) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewModal.show]);

  const handleScrapeSubmit = async (e) => {
    e.preventDefault();
    setScrapeButtonActive(false);
    setLoadingScrape(true);
    setMessage({ type: '', text: '' });
    
    const form_data = new FormData(e.currentTarget);
    const urlsText = form_data.get("urls");
    
    // Split by newlines and filter out empty lines
    const urls = urlsText.split('\n').map(url => url.trim()).filter(url => url);
    
    if (urls.length === 0) {
      setMessage({ type: 'error', text: 'Vui lòng nhập ít nhất một URL hợp lệ!' });
      setScrapeButtonActive(true);
      setLoadingScrape(false);
      return;
    }
    
    try {
      const response = await fetch("/api/scrape/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      if (response.ok) {
        const { jobId } = await response.json();
        setCurrentJobId(jobId);
        setMessage({ type: 'info', text: `Đang xử lý ${urls.length} URL...` });
        // Polling will be handled by useEffect
      } else {
        setMessage({ type: 'error', text: 'Có lỗi xảy ra khi gửi yêu cầu!' });
        setScrapeButtonActive(true);
        setLoadingScrape(false);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage({ type: 'error', text: 'Có lỗi xảy ra khi gửi yêu cầu!' });
      setScrapeButtonActive(true);
      setLoadingScrape(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { text: 'Đang chờ', color: 'bg-yellow-100 text-yellow-800' },
      processing: { text: 'Đang xử lý', color: 'bg-blue-100 text-blue-800' },
      completed: { text: 'Hoàn thành', color: 'bg-green-100 text-green-800' },
      failed: { text: 'Thất bại', color: 'bg-red-100 text-red-800' },
    };
    const badge = badges[status] || badges.pending;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('vi-VN');
  };

  const handleViewDetail = async (jobUrl) => {
    try {
      // Fetch JobDetail by URL
      const response = await fetch(`/api/jobDetail?url=${encodeURIComponent(jobUrl)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && data.data._id) {
          // Open in new tab
          window.open(`/job/${data.data._id}`, '_blank');
        } else {
          showToast('error', 'Không tìm thấy công việc');
        }
      } else {
        showToast('error', 'Lỗi khi tải thông tin công việc');
      }
    } catch (error) {
      console.error('Error fetching job detail:', error);
      showToast('error', 'Có lỗi xảy ra');
    }
  };

  const handleViewJobUrls = (job) => {
    setViewModal({ show: true, job });
  };

  const closeViewModal = () => {
    setViewModal({ show: false, job: null });
  };

  const handleDeleteJob = async (jobId) => {
    // if (!confirm('Bạn có chắc chắn muốn xóa lịch sử cào dữ liệu này?')) {
    //   return;
    // }

    try {
      const response = await fetch(`/api/scrape/jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showToast('success', 'Xóa lịch sử thành công');
        // Remove from list
        setRecentJobs(prev => prev.filter(job => job.id !== jobId));
      } else {
        showToast('error', 'Lỗi khi xóa lịch sử');
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      showToast('error', 'Có lỗi xảy ra');
    }
  };

  return (
    <div>
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white`}>
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            {toast.type === 'success' ? (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            ) : (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
            )}
          </svg>
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      <div className="admin-content-header">
        <h1 className="admin-content-title">Crawl thông tin việc làm</h1>
        <p className="admin-content-subtitle">Nhập URL để cào dữ liệu việc làm mới</p>
      </div>

      <div className="scrape-section">
        {message.text && (
          <div className={`submit-message ${message.type}`} style={{ marginBottom: '24px' }}>
            <svg className="message-icon" fill="currentColor" viewBox="0 0 20 20">
              {message.type === 'success' ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
              ) : (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              )}
            </svg>
            {message.text}
          </div>
        )}

        <div className="scrape-form-container">
          <form onSubmit={handleScrapeSubmit} className="scrape-form">
            <div className="form-group">
              <label htmlFor="urls" className="form-label">
                URLs cần cào dữ liệu (mỗi URL một dòng):
              </label>
              <div className="input-group">
                <textarea
                  name="urls"
                  id="urls"
                  value={scrapeUrls}
                  onChange={(e) => setScrapeUrls(e.target.value)}
                  placeholder="Nhập các URL, mỗi URL trên một dòng&#10;Ví dụ:&#10;https://www.topcv.vn/tim-viec-lam&#10;https://www.vietnamworks.com/tim-viec-lam"
                  className="url-input"
                  rows="6"
                  required
                />
                <button 
                  type="submit" 
                  className={`submit-btn ${!scrapeButtonActive ? 'disabled' : ''}`}
                  disabled={!scrapeButtonActive}
                >
                  {loadingScrape ? (
                    <>
                      <div className="loading-spinner-small"></div>
                      Đang cào...
                    </>
                  ) : (
                    'Bắt đầu cào'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="scrape-instructions">
          <h3>Hướng dẫn sử dụng:</h3>
          <ul>
            <li>Nhập các URL của trang web chứa thông tin việc làm, mỗi URL trên một dòng</li>
            <li>Hệ thống sẽ tự động phân tích và trích xuất dữ liệu từ tất cả các URL</li>
            <li>Dữ liệu sau khi cào sẽ được lưu vào hệ thống</li>
            <li>Kiểm tra tab "Quản lý công việc" để xem kết quả</li>
          </ul>
        </div>
      </div>

      {/* Recent Jobs Section */}
      {recentJobs.length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#1f2937' }}>
            Lịch sử cào dữ liệu
          </h2>
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>URL</th>
                  <th className="badge-text" style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Trạng thái</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Tiến độ</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Thời gian tạo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Hoàn thành</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job, index) => (
                  <tr key={job.id} style={{ borderTop: index > 0 ? '1px solid #e5e7eb' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151', maxWidth: '300px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {job.urls && job.urls.length > 0 ? (
                          <>
                            <div style={{ fontWeight: '500' }}>{job.urls.length} URL</div>
                            <div style={{ fontSize: '12px', color: '#6b7280', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {job.urls[0]}
                              {job.urls.length > 1 && ` +${job.urls.length - 1} more`}
                            </div>
                          </>
                        ) : (
                          <a href={job.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>
                            {job.url}
                          </a>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {getStatusBadge(job.status)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {job.status === 'processing' && job.totalUrls > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px' }}>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {job.processedUrls || 0}/{job.totalUrls} URL
                          </div>
                          <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: '4px', height: '6px' }}>
                            <div 
                              style={{ 
                                width: `${job.progress || 0}%`, 
                                backgroundColor: '#3b82f6', 
                                height: '6px', 
                                borderRadius: '4px',
                                transition: 'width 0.3s ease'
                              }}
                            />
                          </div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>
                            {job.progress || 0}%
                          </div>
                        </div>
                      ) : job.status === 'completed' ? (
                        <div style={{ fontSize: '12px', color: '#10b981' }}>
                          {job.jobCount} công việc
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          -
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {formatDate(job.createdAt)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {formatDate(job.completedAt)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {job.status === 'completed' && job.jobCount > 0 ? (
                          <button
                            onClick={() => handleViewJobUrls(job)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 12px',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                          >
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Xem
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
                        >
                          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View URLs Modal */}
      {viewModal.show && viewModal.job && (
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
          onClick={closeViewModal}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
                Danh sách URL đã cào ({viewModal.job.jobCount} công việc)
              </h3>
              <button
                onClick={closeViewModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>
                Thời gian hoàn thành: {formatDate(viewModal.job.completedAt)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {viewModal.job.urls && viewModal.job.urls.map((url, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: '#f9fafb'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '14px',
                      color: '#3b82f6',
                      textDecoration: 'none',
                      wordBreak: 'break-all',
                      marginBottom: '4px'
                    }}>
                      {url}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      URL {index + 1}
                    </div>
                  </div>
                  <button
                    onClick={() => handleViewDetail(url)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Xem công việc
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={closeViewModal}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#6b7280'}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
