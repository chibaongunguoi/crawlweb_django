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
  const [selectedJobIds, setSelectedJobIds] = useState([]);
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

  const handleToggleSelect = (jobId) => {
    setSelectedJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  };

  const handleToggleSelectAll = () => {
    const pageIds = jobs.map((job) => job.id);
    const isAllSelected = pageIds.length > 0 && pageIds.every((id) => selectedJobIds.includes(id));
    setSelectedJobIds((prev) =>
      isAllSelected
        ? prev.filter((id) => !pageIds.includes(id))
        : Array.from(new Set([...prev, ...pageIds]))
    );
  };

  const handleBulkDelete = async () => {
    if (selectedJobIds.length === 0) {
      alert('Vui lòng chọn ít nhất một lịch sử cào');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedJobIds.length} lịch sử cào đã chọn?`)) {
      return;
    }

    try {
      const results = await Promise.allSettled(
        selectedJobIds.map((jobId) =>
          fetch(`/api/scrape/jobs/${jobId}/`, {
            method: 'DELETE',
            credentials: 'include',
          })
        )
      );
      const failed = results.filter((r) => r.status !== 'fulfilled' || !r.value.ok).length;
      showToast(
        failed ? 'error' : 'success',
        failed
          ? `Đã xóa ${selectedJobIds.length - failed} lịch sử, lỗi ${failed}`
          : 'Xóa hàng loạt thành công'
      );
      setSelectedJobIds([]);
      fetchJobs();
    } catch (err) {
      console.error('Error bulk deleting jobs:', err);
      showToast('error', 'Lỗi khi xóa hàng loạt');
    }
  };

  const isAllSelected = jobs.length > 0 && jobs.every((job) => selectedJobIds.includes(job.id));

  const handleDelete = async (jobId) => {
    if (!window.confirm('Bạn có chắc muốn xóa lịch sử cào dữ liệu này?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/scrape/jobs/${jobId}/`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete job');
      }
      
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
        <p className="admin-content-subtitle">Nhập URL để cào dữ liệu việc làm mới</p>
      </div>

      <div className="scrape-section">
        {message.text && (
          <div className={`submit-message ${message.type}`} style={{ marginBottom: '24px' }}>
            <svg className="message-icon" fill="currentColor" viewBox="0 0 20 20" style={{ width: '20px', height: '20px' }}>
              {message.type === 'success' || message.type === 'info' ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
              ) : (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              )}
            </svg>
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
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !urlInput.trim()}
            style={{
              padding: '10px 24px',
              backgroundColor: submitting ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Đang xử lý...' : 'Bắt đầu cào dữ liệu'}
          </button>
        </form>

        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
            Hướng dẫn:
          </h3>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#6b7280' }}>
            <li>Nhập mỗi URL trên một dòng</li>
            <li>Hệ thống sẽ tự động cào dữ liệu từ các URL đã nhập</li>
            <li>Bạn có thể theo dõi tiến độ trong bảng bên dưới</li>
            <li>Sau khi hoàn tất, click "Xem" để xem chi tiết các công việc đã cào</li>
          </ul>
        </div>
      </div>

      {/* Recent Jobs Section */}
      {jobs.length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
              Lịch sử cào dữ liệu
            </h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {selectedJobIds.length > 0 && (
                <button
                  onClick={handleBulkDelete}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                  }}
                >
                  Xóa đã chọn ({selectedJobIds.length})
                </button>
              )}
              <button 
                onClick={fetchJobs} 
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                }}
              >
                {loading ? 'Đang tải...' : 'Làm mới'}
              </button>
            </div>
          </div>
          
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', width: '48px' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      title="Chọn tất cả"
                    />
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>URL</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Trạng thái</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Tiến độ</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Retry</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Lỗi gần nhất</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Thời gian tạo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Hoàn thành</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, index) => (
                  <tr key={job.id} style={{ borderTop: index > 0 ? '1px solid #e5e7eb' : 'none' }}>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedJobIds.includes(job.id)}
                        onChange={() => handleToggleSelect(job.id)}
                      />
                    </td>
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
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>N/A</span>
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
                      ) : job.status === 'retrying' ? (
                        <div style={{ fontSize: '12px', color: '#f97316' }}>
                          Retry sau {job.nextRetryAt ? formatDate(job.nextRetryAt) : '...'}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>-</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                      {job.retryCount || 0}/{job.maxRetries || 0}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280', maxWidth: '220px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.lastError || job.errorMessage || ''}>
                        {job.lastError || job.errorMessage || '-'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {formatDate(job.createdAt)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {formatDate(job.completedAt)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {(job.status === 'failed' || job.status === 'retrying') && (
                          <button
                            onClick={() => handleRetry(job.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 12px',
                              backgroundColor: '#f97316',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '500',
                              cursor: 'pointer',
                            }}
                          >
                            Retry
                          </button>
                        )}
                        {job.status === 'completed' && job.jobCount > 0 && (
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
                            }}
                          >
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Xem
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(job.id)}
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
                          }}
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
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
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
                }}
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
                      flexShrink: 0
                    }}
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