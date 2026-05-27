import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./JobDetail.css";

export default function JobDetail() {
  const [job, setJob] = useState(null);
  const [isFollowed, setIsFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [followCount, setFollowCount] = useState(0);
  const [companyExists, setCompanyExists] = useState(false);
  const [companyId, setCompanyId] = useState(null);
  const [isApplyLoading, setIsApplyLoading] = useState(false);
  const navigate = useNavigate();
  const { id: jobId } = useParams();

  const sourceLabel = job?.source || 'unknown';

  // Xử lý follow/unfollow
  async function handleFollow() { 
    if (isFollowLoading) return;
    
    try {
      setIsFollowLoading(true);
      const endpoint = isFollowed
        ? `/api/user/favorites/${jobId}/`
        : "/api/user/favorites/";
      const method = isFollowed ? "DELETE" : "POST";
      const requestOptions = {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      };

      if (!isFollowed) {
        requestOptions.body = JSON.stringify({ jobId: jobId });
      }

      const response = await fetch(endpoint, requestOptions);

      if (response.ok) {
        if (method === "POST") {
          const data = await response.json();
          setIsFollowed(data.isFollowed ?? true);
        } else {
          setIsFollowed(false);
        }
        // Update follow count
        fetchFollowCount(jobId);
      } else {
        const errorData = await response.json();
        if (response.status === 401) {
          // User chưa đăng nhập, chuyển đến trang login
          navigate('/login');
        } else if (response.status === 404 && method === "DELETE") {
          // Nếu bản ghi đã bị xóa ở phía server thì đồng bộ lại trạng thái client
          setIsFollowed(false);
          fetchFollowCount(jobId);
        } else if (response.status === 409 && method === "POST") {
          // Trường hợp favorite đã tồn tại, đồng bộ lại trạng thái client
          setIsFollowed(true);
          fetchFollowCount(jobId);
        } else {
          console.error('Follow error:', errorData.error);
          alert('Có lỗi xảy ra khi thực hiện thao tác');
        }
      }
    } catch (error) {
      console.error('Follow error:', error);
      alert('Có lỗi xảy ra khi thực hiện thao tác');
    } finally {
      setIsFollowLoading(false);
    }
  }

  // Lấy trạng thái follow hiện tại
  const fetchFollowStatus = async (jobId) => {
    try {
      const response = await fetch(`/api/user/favorites/?job_id=${jobId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        // Kiểm tra nếu jobId có trong danh sách favorites
        const isFav = data.data?.some(fav => fav._id === jobId);
        setIsFollowed(isFav || false);
      }
    } catch (error) {
      console.error('Error fetching follow status:', error);
    }
  };

  // Lấy số lượt follow
  const fetchFollowCount = async (jobId) => {
    try {
      const response = await fetch(`/api/jobs/-count/?jobId=${jobId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        setFollowCount(data.count || 0);
      }
    } catch (error) {
      console.error('Error fetching follow count:', error);
    }
  };

  // Check if company exists in Company model
  const checkCompanyExists = async (companyName) => {
    try {
      const response = await fetch(`/api/admin/companies/?name=${encodeURIComponent(companyName)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.companies && data.companies.length > 0) {
          const company = data.companies.find(c => c.name === companyName);
          if (company) {
            setCompanyExists(true);
            setCompanyId(company._id);
          }
        }
      }
    } catch (error) {
      console.error('Error checking company:', error);
    }
  };

  // Handle apply to company
  const handleApply = async () => {
    if (isApplyLoading || !companyId) return;
    
    try {
      setIsApplyLoading(true);
      
      // Check if user has UserProfile first
      const profileResponse = await fetch('/api/user/profile/', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (profileResponse.status === 401) {
        navigate('/login');
        return;
      }

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        
        // If no profile exists, show message and redirect
        if (!profileData.data) {
          alert('Bạn chưa có thông tin cá nhân. Hãy cập nhật trong phần tài khoản!');
          navigate('/user/profile');
          return;
        }
      } else {
        alert('Không thể kiểm tra thông tin cá nhân. Vui lòng thử lại!');
        return;
      }

      // Proceed with application
      const response = await fetch("/api/user/apply/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ JobDetailID: jobId }),
      });

      if (response.ok) {
        const data = await response.json();
        alert('Ứng tuyển thành công!');
      } else {
        const errorData = await response.json();
        if (response.status === 401) {
          navigate('/login');
        } else if (response.status === 409) {
          alert('Bạn đã ứng tuyển vào công việc này rồi!');
        } else {
          alert(errorData.error || 'Có lỗi xảy ra khi ứng tuyển');
        }
      }
    } catch (error) {
      console.error('Apply error:', error);
      alert('Có lỗi xảy ra khi ứng tuyển');
    } finally {
      setIsApplyLoading(false);
    }
  };

  function convertInlineAsterisks(text) {
    return text
      .split(/\s*\*\s+/)     // Tách bằng dấu *
      .map(s => s.trim())    // Xóa khoảng trắng thừa
      .filter(Boolean)       // Bỏ chuỗi rỗng
      .map(s => '- ' + s)    // Thêm dấu gạch đầu dòng
      .join('\n');           // Nối bằng xuống dòng
  }

  function hasHtmlMarkup(text) {
    return typeof text === 'string' && /<[a-z][\s\S]*>/i.test(text);
  }

  useEffect(() => {
    if (jobId) {
      fetchJobDetail(jobId);
      fetchFollowStatus(jobId);
      fetchFollowCount(jobId);
    }
  }, [jobId]);

  // Check company when job is loaded
  useEffect(() => {
    if (job?.company_name) {
      checkCompanyExists(job.company_name);
    }
  }, [job]);

  const fetchJobDetail = async (id) => {
    try {
      setLoading(true);
      const response = await fetch("/api/jobDetail/", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const foundJob = data.data?.find(job => job._id === id);
        setJob(foundJob || null);
      }
    } catch (error) {
      console.error('Error fetching job detail:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-300 border-t-blue-600"></div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="not-found-container">
        <div className="not-found-content">
          <h2>Không tìm thấy công việc</h2>
          <button 
            onClick={() => window.history.back()} 
            className="back-link"
          >
            ← Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="job-detail-container">
      {/* Back Button */}
      <button 
        onClick={() => window.history.back()} 
        className="back-button"
      >
        ← Quay lại
      </button>
      
      {/* Header */}
      <div className="job-detail-header">
        <div className="job-header-content">
          <div className="company-logo-large">
            <img
              src={job.thumbnail}
              alt={job.company_name}
              width={100}
              height={100}
            />
          </div>
          <div className="job-header-info">
            <h1 className="job-title-large">{job.job_title || job.company_name}</h1>
            <h2 className="company-name">{job.company_name}</h2>
            <div className="job-source-detail">Nguồn: {sourceLabel}</div>
            <div className="job-meta">
              <span className="meta-item">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="meta-icon">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {job.province}
              </span>
              <span className="meta-item">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="meta-icon">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                {job.salary}
              </span>
            </div>
          </div>
        </div>
        <div className="action-buttons">
          {/* Follow Count Display */}
          <div className="follow-count-display">
            <svg className="heart-icon-count" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span className="count-text">{followCount} lượt yêu thích</span>
          </div>
          
          <button 
            className={`save-button ${isFollowed ? 'followed' : ''}`} 
            onClick={handleFollow}
            disabled={isFollowLoading}
          >
            {isFollowLoading ? (
              <div className="flexing-items">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                Đang xử lý...
              </div>
            ) : (
              <>
                <svg 
                  className="heart-icon" 
                  fill={isFollowed ? "currentColor" : "none"} 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth="2" 
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
                {isFollowed ? 'Đã yêu thích' : 'Yêu thích'}
              </>
            )}
          </button>

          {/* Original URL Button */}
          <button 
            className="original-url-button"
            onClick={() => window.open(job.url, '_blank')}
          >
            <svg className="external-link-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Xem trang gốc
          </button>

          {/* Apply Button - only show if company exists in Company model */}
          {companyExists && (
            <button 
              className="apply-button"
              onClick={handleApply}
              disabled={isApplyLoading}
            >
              {isApplyLoading ? (
                <div className="flexing-items">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                  Đang xử lý...
                </div>
              ) : (
                <>
                  <svg className="apply-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Ứng tuyển
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="job-detail-content">
        <div className="main-content">
          {job.descriptions && Object.entries(job.descriptions).map(([key, value]) => (
            <section className="content-section" key={key}>
              <h3>{key}</h3>
              {hasHtmlMarkup(value) ? (
                <div
                  className="content-html"
                  dangerouslySetInnerHTML={{ __html: value }}
                />
              ) : (
                <div className="content-text">
                  {convertInlineAsterisks(value)}
                </div>
              )}
            </section>
          ))}

          {/* Skills */}
          {job.skills && job.skills.length > 0 && (
            <section className="content-section">
              <h3>Kỹ năng yêu cầu</h3>
              <div className="skills-container">
                {job.skills.map((skill, index) => (
                  <span key={index} className="skill-badge">
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          <div className="info-card">
            <h3>Thông tin chung</h3>
            <div className="info-list">
              {job.job_info && Object.entries(job.job_info).map(([key, value]) => (
                <div className="info-item" key={key}>
                  <span className="info-label">{key}:</span>
                  <span className="info-value">{value}</span>
                </div>
              ))}    
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
