import React, { useState, useEffect, useRef, useCallback } from 'react';
import './admin.css';

const SCHEDULE_TYPE_LABELS = { daily: 'Hằng ngày', weekly: 'Hằng tuần', cron: 'Cron' };
const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const DEFAULT_SEED_URL = 'https://itworks.asia/job/';
const DEVWORK_SEED_URL = 'https://devwork.vn/viec-lam';

const SOURCE_LABELS = {
  itworks: 'itworks.asia',
  devwork: 'Devwork',
};

const emptyScheduleForm = {
  name: '',
  source: 'itworks',
  urls: DEFAULT_SEED_URL,
  crawlMode: 'crawl_then_scrape',
  scheduleType: 'daily',
  timeOfDay: '09:00',
  dayOfWeek: '1',
  cronExpression: '',
  maxDetailUrls: '',
  active: true,
};

const ScrapeManager = () => {
  const [activeTab, setActiveTab] = useState('manual');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [polling, setPolling] = useState(false);
  const [toast, setToast] = useState({ show: false, type: '', message: '' });
  const [viewModal, setViewModal] = useState({ show: false, job: null });
  const [message, setMessage] = useState({ type: '', text: '' });
  const pollingIntervalRef = useRef(null);

  // Schedule state
  const [schedules, setSchedules] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ ...emptyScheduleForm });
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [scheduleError, setScheduleError] = useState('');

  // Show toast notification
  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => {
      setToast({ show: false, type: '', message: '' });
    }, 5000);
  };

  // Fetch all jobs
  const fetchJobs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/scrape/jobs/', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      } else {
        setError('Failed to fetch jobs');
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const response = await fetch('/api/scrape/schedules/', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setSchedules(data.schedules || []);
      }
    } catch (err) {
      console.error('Error fetching schedules:', err);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchSchedules();
  }, [fetchSchedules]);

  // Poll for active job status
  useEffect(() => {
    if (!activeJobId || !polling) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const pollJobStatus = async () => {
      try {
        const response = await fetch(`/api/scrape/status/${activeJobId}/`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          const job = data.job;
          
          setJobs(prevJobs => {
            const index = prevJobs.findIndex(j => j.id === activeJobId);
            if (index >= 0) {
              const updated = [...prevJobs];
              updated[index] = job;
              return updated;
            }
            return [job, ...prevJobs];
          });
          
          if (job.status === 'processing' && job.totalUrls > 0) {
            const progressPercent = job.progress || 0;
            const processed = job.processedUrls || 0;
            const total = job.totalUrls || 0;
            setMessage({ 
              type: 'info', 
              text: `Đang xử lý... ${processed}/${total} URL (${progressPercent}%)` 
            });
          }
          
          if (job.status === 'completed' || job.status === 'failed') {
            setActiveJobId(null);
            setSubmitting(false);
            setPolling(false);
            
            if (job.status === 'completed') {
              showToast('success', `Cào dữ liệu thành công! Đã thu thập ${job.jobCount} công việc từ ${job.totalUrls} URL.`);
              setMessage({ type: 'success', text: `Hoàn thành! Đã thu thập ${job.jobCount} công việc từ ${job.totalUrls} URL.` });
              setUrlInput("");
            } else {
              showToast('error', `Cào dữ liệu thất bại: ${job.errorMessage || 'Lỗi không xác định'}`);
              setMessage({ type: 'error', text: job.errorMessage || 'Có lỗi xảy ra khi cào dữ liệu!' });
            }
            
            fetchJobs();
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    };

    pollingIntervalRef.current = setInterval(pollJobStatus, 3000);
    pollJobStatus();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [activeJobId, polling]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    
    const urls = urlInput
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);
    
    if (urls.length === 0) {
      setMessage({ type: 'error', text: 'Vui lòng nhập ít nhất một URL hợp lệ!' });
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/scrape/upload/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ urls }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit URLs');
      }
      
      const data = await response.json();
      setActiveJobId(data.jobId);
      setPolling(true);
      setMessage({ type: 'info', text: `Đang xử lý ${urls.length} URL...` });
      fetchJobs();
    } catch (err) {
      console.error('Error submitting URLs:', err);
      setError(err.message);
      setMessage({ type: 'error', text: 'Có lỗi xảy ra khi gửi yêu cầu!' });
      setSubmitting(false);
    }
  };

  const handleDelete = async (jobId) => {
    if (!window.confirm('Bạn có chắc muốn xóa lịch sử cào dữ liệu này?')) return;
    
    try {
      const response = await fetch(`/api/scrape/jobs/${jobId}/`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete job');
      showToast('success', 'Xóa lịch sử thành công');
      setJobs(prev => prev.filter(job => job.id !== jobId));
    } catch (err) {
      console.error('Error deleting job:', err);
      showToast('error', 'Lỗi khi xóa lịch sử');
    }
  };

  const handleRetry = async (jobId) => {
    try {
      const response = await fetch(`/api/scrape/jobs/${jobId}/retry/`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        showToast('success', 'Đã xếp lại vào hàng đợi để retry');
        fetchJobs();
      } else {
        showToast('error', 'Không thể retry job này');
      }
    } catch (error) {
      console.error('Error retrying job:', error);
      showToast('error', 'Có lỗi xảy ra');
    }
  };

  const handleViewJobUrls = (job) => {
    setViewModal({ show: true, job });
  };

  const closeViewModal = () => {
    setViewModal({ show: false, job: null });
  };

  const handleViewDetail = async (jobUrl) => {
    try {
      const response = await fetch(`/api/jobs/?url=${encodeURIComponent(jobUrl)}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const jobsList = data.data || data.jobs || [];
        if (jobsList && jobsList.length > 0) {
          window.open(`/job/${jobsList[0]._id}`, '_blank');
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

  // ---- Schedule handlers ----
  const openCreateSchedule = () => {
    setEditingScheduleId(null);
    setScheduleForm({ ...emptyScheduleForm });
    setScheduleError('');
    setShowScheduleForm(true);
  };

  const openEditSchedule = (schedule) => {
    setEditingScheduleId(schedule.id);
    setScheduleForm({
      name: schedule.name || '',
      source: schedule.source || 'itworks',
      urls: (schedule.urls || []).join('\n'),
      crawlMode: schedule.crawlMode || 'crawl_then_scrape',
      scheduleType: schedule.scheduleType || 'daily',
      timeOfDay: schedule.timeOfDay || '09:00',
      dayOfWeek: schedule.dayOfWeek != null ? String(schedule.dayOfWeek) : '1',
      cronExpression: schedule.cronExpression || '',
      maxDetailUrls: schedule.maxDetailUrls != null ? String(schedule.maxDetailUrls) : '',
      active: schedule.active,
    });
    setScheduleError('');
    setShowScheduleForm(true);
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    setScheduleError('');

    const payload = {
      name: scheduleForm.name,
      source: scheduleForm.source,
      urls: scheduleForm.urls.split('\n').map(u => u.trim()).filter(Boolean),
      crawlMode: scheduleForm.crawlMode,
      scheduleType: scheduleForm.scheduleType,
      timeOfDay: scheduleForm.timeOfDay,
      active: scheduleForm.active,
    };
    if (scheduleForm.scheduleType === 'weekly') {
      payload.dayOfWeek = parseInt(scheduleForm.dayOfWeek, 10);
    }
    if (scheduleForm.scheduleType === 'cron') {
      payload.cronExpression = scheduleForm.cronExpression;
    }
    if (scheduleForm.maxDetailUrls) {
      payload.maxDetailUrls = parseInt(scheduleForm.maxDetailUrls, 10);
    }

    try {
      const url = editingScheduleId
        ? `/api/scrape/schedules/${editingScheduleId}/`
        : '/api/scrape/schedules/';
      const method = editingScheduleId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setScheduleError(data.error || 'Có lỗi xảy ra');
        return;
      }

      showToast('success', editingScheduleId ? 'Đã cập nhật lịch' : 'Đã tạo lịch mới');
      setShowScheduleForm(false);
      fetchSchedules();
    } catch (err) {
      setScheduleError('Có lỗi xảy ra: ' + err.message);
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    try {
      const response = await fetch(`/api/scrape/schedules/${scheduleId}/toggle/`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, active: data.active, nextRunAt: data.schedule?.nextRunAt } : s));
        showToast('success', data.active ? 'Đã bật lịch' : 'Đã tắt lịch');
      }
    } catch (err) {
      showToast('error', 'Lỗi khi thay đổi trạng thái');
    }
  };

  const handleRunScheduleNow = async (scheduleId) => {
    try {
      const response = await fetch(`/api/scrape/schedules/${scheduleId}/run/`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        showToast('success', `Đã tạo job: ${data.jobId}`);
        fetchSchedules();
        fetchJobs();
      } else {
        const data = await response.json();
        showToast('error', data.error || 'Không thể chạy lịch');
      }
    } catch (err) {
      showToast('error', 'Có lỗi xảy ra');
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Bạn có chắc muốn xóa lịch này?')) return;
    try {
      const response = await fetch(`/api/scrape/schedules/${scheduleId}/`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        showToast('success', 'Đã xóa lịch');
        setSchedules(prev => prev.filter(s => s.id !== scheduleId));
      }
    } catch (err) {
      showToast('error', 'Lỗi khi xóa lịch');
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Đang chờ', color: '#f59e0b' },
      queued: { label: 'Trong hàng đợi', color: '#0ea5e9' },
      processing: { label: 'Đang xử lý', color: '#3b82f6' },
      retrying: { label: 'Đang retry', color: '#f97316' },
      completed: { label: 'Hoàn thành', color: '#10b981' },
      failed: { label: 'Thất bại', color: '#ef4444' }
    };
    const config = statusConfig[status] || { label: status, color: '#6b7280' };
    return (
      <span style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: '500',
        backgroundColor: `${config.color}20`,
        color: config.color
      }}>
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // ---- Tab Button Style ----
  const tabBtn = (tab) => ({
    padding: '10px 24px',
    border: 'none',
    borderBottom: activeTab === tab ? '3px solid #3b82f6' : '3px solid transparent',
    backgroundColor: 'transparent',
    color: activeTab === tab ? '#3b82f6' : '#6b7280',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  return (
    <div className="admin-content">
      {/* Toast Notification */}
      {toast.show && (
        <div style={{
          position: 'fixed', top: '16px', right: '16px', zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '12px 16px',
          backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white', borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        }}>
          <span style={{ fontWeight: '500' }}>{toast.message}</span>
        </div>
      )}

      <div className="admin-content-header">
        <h1 className="admin-content-title">Crawl thông tin việc làm</h1>
        <p className="admin-content-subtitle">Quản lý cào dữ liệu thủ công và tự động theo lịch</p>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <button style={tabBtn('manual')} onClick={() => setActiveTab('manual')}>Cào thủ công</button>
        <button style={tabBtn('schedule')} onClick={() => setActiveTab('schedule')}>Lịch cào tự động</button>
      </div>

      {/* ===================== MANUAL TAB ===================== */}
      {activeTab === 'manual' && (
        <>
          <div className="scrape-section">
            {message.text && (
              <div className={`submit-message ${message.type}`} style={{ marginBottom: '24px' }}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ marginBottom: '32px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#374151' }}>
                  URLs (mỗi URL một dòng)
                </label>
                <textarea
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/job1&#10;https://example.com/job2"
                  rows={6}
                  disabled={submitting}
                  style={{
                    width: '100%', padding: '12px',
                    border: '1px solid #d1d5db', borderRadius: '8px',
                    fontSize: '14px', fontFamily: 'monospace', resize: 'vertical'
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !urlInput.trim()}
                style={{
                  padding: '10px 24px',
                  backgroundColor: submitting ? '#9ca3af' : '#3b82f6',
                  color: 'white', border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: '500',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Đang xử lý...' : 'Bắt đầu cào dữ liệu'}
              </button>
            </form>
          </div>

          {/* Recent Jobs */}
          {jobs.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>Lịch sử cào dữ liệu</h2>
                <button onClick={fetchJobs} disabled={loading}
                  style={{ padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '500' }}>
                  {loading ? 'Đang tải...' : 'Làm mới'}
                </button>
              </div>
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ backgroundColor: '#f9fafb' }}>
                    <tr>
                      {['URL', 'Trạng thái', 'Tiến độ', 'Retry', 'Lỗi', 'Tạo lúc', 'Hoàn thành', 'Thao tác'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job, idx) => (
                      <tr key={job.id} style={{ borderTop: idx > 0 ? '1px solid #e5e7eb' : 'none' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151', maxWidth: '300px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {job.urls?.length > 0 ? (
                              <>
                                <div style={{ fontWeight: '500' }}>{job.urls.length} URL</div>
                                <div style={{ fontSize: '12px', color: '#6b7280', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {job.urls[0]}{job.urls.length > 1 && ` +${job.urls.length - 1} more`}
                                </div>
                              </>
                            ) : <span style={{ fontSize: '12px', color: '#6b7280' }}>N/A</span>}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{getStatusBadge(job.status)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {job.status === 'processing' && job.totalUrls > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px' }}>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>{job.processedUrls || 0}/{job.totalUrls} URL</div>
                              <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: '4px', height: '6px' }}>
                                <div style={{ width: `${job.progress || 0}%`, backgroundColor: '#3b82f6', height: '6px', borderRadius: '4px', transition: 'width 0.3s ease' }} />
                              </div>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>{job.progress || 0}%</div>
                            </div>
                          ) : job.status === 'completed' ? (
                            <span style={{ fontSize: '12px', color: '#10b981' }}>{job.jobCount} công việc</span>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#6b7280' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{job.retryCount || 0}/{job.maxRetries || 0}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280', maxWidth: '220px' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.lastError || job.errorMessage || ''}>{job.lastError || job.errorMessage || '-'}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>{formatDate(job.createdAt)}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>{formatDate(job.completedAt)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {(job.status === 'failed' || job.status === 'retrying') && (
                              <button onClick={() => handleRetry(job.id)}
                                style={{ padding: '6px 12px', backgroundColor: '#f97316', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                Retry
                              </button>
                            )}
                            {job.status === 'completed' && job.jobCount > 0 && (
                              <button onClick={() => handleViewJobUrls(job)}
                                style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                Xem
                              </button>
                            )}
                            <button onClick={() => handleDelete(job.id)}
                              style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
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
        </>
      )}

      {/* ===================== SCHEDULE TAB ===================== */}
      {activeTab === 'schedule' && (
        <div>
          {/* Schedule Form Modal */}
          {showScheduleForm && (
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
              onClick={() => setShowScheduleForm(false)}>
              <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', maxWidth: '560px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}
                onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
                  {editingScheduleId ? 'Sửa lịch' : 'Tạo lịch cào tự động'}
                </h3>
                {scheduleError && (
                  <div style={{ padding: '10px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>{scheduleError}</div>
                )}
                <form onSubmit={handleScheduleSubmit}>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Tên lịch</label>
                    <input value={scheduleForm.name} onChange={e => setScheduleForm(f => ({ ...f, name: e.target.value }))} required
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Nguồn</label>
                    <select value={scheduleForm.source} onChange={e => {
                      const newSource = e.target.value;
                      setScheduleForm(f => ({
                        ...f,
                        source: newSource,
                        urls: newSource === 'devwork' ? DEVWORK_SEED_URL : f.urls,
                        crawlMode: newSource === 'devwork' ? 'crawl_then_scrape' : f.crawlMode,
                      }));
                    }}
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}>
                      <option value="itworks">itworks.asia</option>
                      <option value="devwork">Devwork</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Seed URLs (mỗi URL một dòng)</label>
                    <textarea value={scheduleForm.urls} onChange={e => setScheduleForm(f => ({ ...f, urls: e.target.value }))} rows={3}
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Chế độ cào</label>
                    <select value={scheduleForm.crawlMode} onChange={e => setScheduleForm(f => ({ ...f, crawlMode: e.target.value }))}
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}>
                      <option value="crawl_then_scrape">Crawl list → Scrape detail</option>
                      <option value="detail_urls">Scrape URL trực tiếp</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Kiểu lịch</label>
                    <select value={scheduleForm.scheduleType} onChange={e => setScheduleForm(f => ({ ...f, scheduleType: e.target.value }))}
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}>
                      <option value="daily">Hằng ngày</option>
                      <option value="weekly">Hằng tuần</option>
                      <option value="cron">Cron</option>
                    </select>
                  </div>
                  {(scheduleForm.scheduleType === 'daily' || scheduleForm.scheduleType === 'weekly') && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Giờ chạy (HH:MM)</label>
                      <input type="time" value={scheduleForm.timeOfDay} onChange={e => setScheduleForm(f => ({ ...f, timeOfDay: e.target.value }))}
                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                    </div>
                  )}
                  {scheduleForm.scheduleType === 'weekly' && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Thứ trong tuần</label>
                      <select value={scheduleForm.dayOfWeek} onChange={e => setScheduleForm(f => ({ ...f, dayOfWeek: e.target.value }))}
                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}>
                        {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}
                  {scheduleForm.scheduleType === 'cron' && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Cron Expression</label>
                      <input value={scheduleForm.cronExpression} onChange={e => setScheduleForm(f => ({ ...f, cronExpression: e.target.value }))} placeholder="0 9 * * *"
                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                  )}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Giới hạn số detail URLs (tùy chọn)</label>
                    <input type="number" min="1" value={scheduleForm.maxDetailUrls} onChange={e => setScheduleForm(f => ({ ...f, maxDetailUrls: e.target.value }))} placeholder="Không giới hạn"
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={scheduleForm.active} onChange={e => setScheduleForm(f => ({ ...f, active: e.target.checked }))} />
                      <span style={{ fontWeight: '500', fontSize: '14px' }}>Kích hoạt</span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowScheduleForm(false)}
                      style={{ padding: '10px 20px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }}>
                      Hủy
                    </button>
                    <button type="submit"
                      style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
                      {editingScheduleId ? 'Cập nhật' : 'Tạo lịch'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>Lịch cào tự động</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={fetchSchedules}
                style={{ padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500', cursor: 'pointer' }}>
                {scheduleLoading ? 'Đang tải...' : 'Làm mới'}
              </button>
              <button onClick={openCreateSchedule}
                style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500', cursor: 'pointer' }}>
                + Tạo lịch mới
              </button>
            </div>
          </div>

          {schedules.length === 0 && !scheduleLoading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              Chưa có lịch cào nào. Nhấn "Tạo lịch mới" để bắt đầu.
            </div>
          )}

          {schedules.length > 0 && (
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f9fafb' }}>
                  <tr>
                    {['Tên', 'Nguồn', 'Seed URLs', 'Loại lịch', 'Chạy gần nhất', 'Chạy tiếp theo', 'Trạng thái', 'Thao tác'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s, idx) => (
                    <tr key={s.id} style={{ borderTop: idx > 0 ? '1px solid #e5e7eb' : 'none' }}>
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>{s.name || '-'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{SOURCE_LABELS[s.source] || s.source || '-'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280', maxWidth: '200px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(s.urls || []).join('\n')}>
                          {(s.urls || []).join(', ')}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{SCHEDULE_TYPE_LABELS[s.scheduleType] || s.scheduleType}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{formatDate(s.lastRunAt)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{formatDate(s.nextRunAt)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500',
                          backgroundColor: s.active ? '#10b98120' : '#ef444420',
                          color: s.active ? '#10b981' : '#ef4444',
                        }}>
                          {s.active ? 'Bật' : 'Tắt'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button onClick={() => handleToggleSchedule(s.id)}
                            style={{ padding: '5px 10px', backgroundColor: s.active ? '#f59e0b' : '#10b981', color: 'white', border: 'none', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}>
                            {s.active ? 'Tắt' : 'Bật'}
                          </button>
                          <button onClick={() => handleRunScheduleNow(s.id)}
                            style={{ padding: '5px 10px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}>
                            Chạy ngay
                          </button>
                          <button onClick={() => openEditSchedule(s)}
                            style={{ padding: '5px 10px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}>
                            Sửa
                          </button>
                          <button onClick={() => handleDeleteSchedule(s.id)}
                            style={{ padding: '5px 10px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}>
                            Xóa
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

      {/* View URLs Modal */}
      {viewModal.show && viewModal.job && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={closeViewModal}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Danh sách URL đã cào ({viewModal.job.jobCount} công việc)</h3>
              <button onClick={closeViewModal} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>
              Thời gian hoàn thành: {formatDate(viewModal.job.completedAt)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {viewModal.job.urls?.map((url, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', color: '#3b82f6', wordBreak: 'break-all' }}>{url}</div>
                  </div>
                  <button onClick={() => handleViewDetail(url)}
                    style={{ padding: '8px 16px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}>
                    Xem công việc
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button onClick={closeViewModal}
                style={{ padding: '10px 20px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScrapeManager;