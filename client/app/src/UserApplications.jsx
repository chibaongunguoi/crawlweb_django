import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./UserApplications.css";

const FILTERS = [
  { key: "all", label: "Tất cả" },
  { key: "chưa duyệt", label: "Chưa duyệt" },
  { key: "đã duyệt", label: "Đã duyệt" },
  { key: "đã từ chối", label: "Đã từ chối" },
];

const FINAL_STATUSES = ["đã duyệt", "đã từ chối"];

function normalizeStatus(status) {
  return (status || "chưa duyệt").trim().toLowerCase();
}

function getApplicationId(application) {
  return application?.id || application?._id || application?.pk;
}

function getJob(application) {
  return application?.job || application?.JobDetailID || {};
}

function getJobId(application) {
  const job = getJob(application);

  if (typeof job?.id === "string") return job.id;
  if (typeof job?._id === "string") return job._id;
  if (typeof application?.JobDetailID === "string") return application.JobDetailID;
  if (typeof application?.job_id === "string") return application.job_id;
  if (typeof application?.jobId === "string") return application.jobId;

  return "";
}

function formatDate(value) {
  if (!value) return "Chưa rõ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa rõ";
  return date.toLocaleString("vi-VN");
}

function getStatusClass(status) {
  const normalized = normalizeStatus(status);

  if (["chưa duyệt", "pending", "new", "đang chờ", "cho duyet", "waiting"].includes(normalized)) {
    return "status-pending";
  }

  if (["đã duyệt", "approved", "accepted", "duyệt", "da duyet"].includes(normalized)) {
    return "status-approved";
  }

  if (["đã từ chối", "rejected", "refused", "từ chối", "da tu choi"].includes(normalized)) {
    return "status-rejected";
  }

  return "status-default";
}

function canWithdraw(application) {
  return !FINAL_STATUSES.includes(normalizeStatus(application?.status));
}

export default function UserApplications() {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [withdrawingId, setWithdrawingId] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  const showToast = (type, message) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3000);
  };

  const extractApplications = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.applications)) return data.applications;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/user/apply/", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (response.status === 401) {
        navigate("/login", { replace: true });
        return;
      }

      const data = await response.json();

      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || "Không thể tải danh sách đơn ứng tuyển");
      }

      setApplications(extractApplications(data));
    } catch (err) {
      console.error("Fetch applications error:", err);
      setError(err.message || "Có lỗi xảy ra khi tải danh sách đơn ứng tuyển");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const filteredApplications = useMemo(() => {
    if (filter === "all") return applications;
    return applications.filter((application) => normalizeStatus(application?.status) === filter);
  }, [applications, filter]);

  const countByFilter = useMemo(() => {
    return FILTERS.reduce((acc, item) => {
      if (item.key === "all") {
        acc[item.key] = applications.length;
      } else {
        acc[item.key] = applications.filter((application) => normalizeStatus(application?.status) === item.key).length;
      }
      return acc;
    }, {});
  }, [applications]);

  const handleViewDetail = (application) => {
    const jobId = getJobId(application);
    if (jobId && typeof jobId === "string") {
      navigate(`/job/${jobId}`);
    }
  };

  const handleWithdraw = async (application) => {
    const applicationId = getApplicationId(application);
    if (!applicationId || withdrawingId) return;

    if (!window.confirm("Bạn có chắc chắn muốn rút đơn ứng tuyển này?")) {
      return;
    }

    try {
      setWithdrawingId(applicationId);

      const response = await fetch(`/api/user/apply/${applicationId}/`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (response.status === 401) {
        navigate("/login", { replace: true });
        return;
      }

      if (response.ok) {
        setApplications((prev) => prev.filter((item) => getApplicationId(item) !== applicationId));
        showToast("success", "Rút đơn ứng tuyển thành công!");
        return;
      }

      const data = await response.json();
      showToast("error", data?.error || "Không thể rút đơn ứng tuyển");
    } catch (err) {
      console.error("Withdraw application error:", err);
      showToast("error", "Có lỗi xảy ra khi rút đơn ứng tuyển");
    } finally {
      setWithdrawingId(null);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="applications-loading">
          <div className="spinner" />
          <span>Đang tải danh sách đơn ứng tuyển...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="applications-error">
          <div className="error-icon">⚠️</div>
          <h3>Không thể tải dữ liệu</h3>
          <p>{error}</p>
          <button type="button" className="retry-btn" onClick={fetchApplications}>
            Thử lại
          </button>
        </div>
      );
    }

    if (applications.length === 0) {
      return (
        <div className="applications-empty">
          <div className="empty-icon">📄</div>
          <h3>Bạn chưa ứng tuyển công việc nào.</h3>
          <p>Khám phá các cơ hội việc làm phù hợp và gửi hồ sơ ngay hôm nay.</p>
          <Link to="/search" className="find-job-btn">
            Tìm việc ngay
          </Link>
        </div>
      );
    }

    if (filteredApplications.length === 0) {
      return (
        <div className="applications-empty">
          <div className="empty-icon">🔎</div>
          <h3>Không có đơn ứng tuyển phù hợp.</h3>
          <p>Hãy chọn trạng thái khác để xem các đơn ứng tuyển của bạn.</p>
        </div>
      );
    }

    return (
      <div className="applications-table-wrap">
        <table className="applications-table">
          <thead>
            <tr>
              <th>Công việc</th>
              <th>Công ty</th>
              <th>Địa điểm</th>
              <th>Mức lương</th>
              <th>Ngày ứng tuyển</th>
              <th>Trạng thái</th>
              <th>Phản hồi</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredApplications.map((application) => {
              const applicationId = getApplicationId(application);
              const job = getJob(application);
              const jobId = getJobId(application);
              const status = application?.status || "chưa duyệt";
              const isWithdrawing = withdrawingId === applicationId;

              return (
                <tr key={applicationId || `${jobId}-${application?.time}`}>
                  <td data-label="Công việc">
                    {jobId ? (
                      <button
                        type="button"
                        className="job-title-link"
                        onClick={() => handleViewDetail(application)}
                      >
                        {job?.job_title || job?.title || "Chưa rõ"}
                      </button>
                    ) : (
                      <span>{job?.job_title || job?.title || "Chưa rõ"}</span>
                    )}
                  </td>
                  <td data-label="Công ty">{job?.company_name || job?.company || "Chưa rõ"}</td>
                  <td data-label="Địa điểm">{job?.province || job?.location || "Chưa rõ"}</td>
                  <td data-label="Mức lương">{job?.salary || "Thỏa thuận"}</td>
                  <td data-label="Ngày ứng tuyển">{formatDate(application?.time || application?.createdAt)}</td>
                  <td data-label="Trạng thái">
                    <span className={`status-badge ${getStatusClass(status)}`}>{status}</span>
                  </td>
                  <td data-label="Phản hồi">{application?.content || "Chưa có phản hồi"}</td>
                  <td data-label="Thao tác">
                    <div className="actions-cell">
                      <button
                        type="button"
                        className="action-btn primary"
                        onClick={() => handleViewDetail(application)}
                        disabled={!jobId}
                      >
                        Xem chi tiết
                      </button>
                      {canWithdraw(application) && (
                        <button
                          type="button"
                          className="action-btn danger"
                          onClick={() => handleWithdraw(application)}
                          disabled={isWithdrawing}
                        >
                          {isWithdrawing ? "Đang rút..." : "Rút đơn"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <main className="user-applications-page">
      {toast && <div className={`applications-toast ${toast.type}`}>{toast.message}</div>}

      <div className="user-applications-container">
        <div className="user-applications-header">
          <h1>Đơn ứng tuyển của tôi</h1>
          <p className="page-subtitle">Theo dõi trạng thái các công việc bạn đã ứng tuyển.</p>
        </div>

        <div className="applications-filter-bar" aria-label="Lọc trạng thái đơn ứng tuyển">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`filter-btn ${filter === item.key ? "active" : ""}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span className="filter-count">{countByFilter[item.key] || 0}</span>
            </button>
          ))}
        </div>

        {renderContent()}
      </div>
    </main>
  );
}