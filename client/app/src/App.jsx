import "./home.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import JobCard from "./ui/components/JobCard";
import Carousel from "./ui/components/Carousel";

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [jobs, setJobs] = useState([]); // State để lưu dữ liệu từ API
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const lastSearchKeyRef = useRef("");
  // const [followCounts, setFollowCounts] = useState({}); // State để lưu số lượt yêu thích
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const queryText = (searchParams.get("q") || "").trim().toLowerCase();
  const selectedSkill = (searchParams.get("skill") || "").trim().toLowerCase();
  const selectedCity = (searchParams.get("city") || "").trim().toLowerCase();
  const highlightTerms = [queryText, selectedSkill, selectedCity].filter(Boolean);

  const jobsPerPage = 24;

  useEffect(() => {
    const searchKey = `${queryText}|${selectedSkill}|${selectedCity}`;
    if (lastSearchKeyRef.current !== searchKey) {
      lastSearchKeyRef.current = searchKey;
      if (currentPage !== 1) {
        setCurrentPage(1);
        return;
      }
    }

    fetchJobsAndFollowCounts();
  }, [queryText, selectedSkill, selectedCity, currentPage]);

  const fetchJobsAndFollowCounts = async () => {
    try {
      const params = new URLSearchParams();
      if (queryText) {
        params.append("q", queryText);
      }
      if (selectedSkill) {
        params.append("skill", selectedSkill);
      }
      if (selectedCity) {
        params.append("city", selectedCity);
      }

      params.append("page", String(currentPage));
      params.append("pageSize", String(jobsPerPage));

      const jobsResponse = await fetch(`http://localhost:8000/api/jobs/search/?${params.toString()}`);
      const jobsData = await jobsResponse.json();

      if (jobsResponse.ok) {
        setJobs(jobsData.items || []);
        setTotalJobs(jobsData.total || 0);
        setTotalPages(jobsData.totalPages || 0);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  // Pagination handlers
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handlePrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Handle card click
  const handleCardClick = (jobId) => {
    navigate(`/job/${jobId}`);
  };

  return (
    <div className="home-container">
      {/* Carousel Section */}
      <Carousel />

      {/* Header Section */}
      <div className="header-section">
        <h1>Cơ hội việc làm</h1>
        {(queryText || selectedSkill || selectedCity) && (
          <p>
            Tìm thấy <strong>{totalJobs}</strong> công việc phù hợp.
          </p>
        )}
      </div>

      {/* Job Cards Grid */}
      <div className="jobs-grid">
        {jobs.map((job) => (
          <JobCard
            key={job._id}
            job={job}
            highlightTerms={highlightTerms}
            // followCount={followCounts[job._id]}
            showFollowBadge={true}
            onClick={() => handleCardClick(job._id)}
          />
        ))}
      </div>

      {jobs.length === 0 && (
        <div className="header-section">
          <p>Không có công việc nào khớp với điều kiện tìm kiếm.</p>
        </div>
      )}

      {/* Pagination */}
      {jobs.length > 0 && totalPages > 1 && (
        <div className="pagination-container">
          <button
            className="pagination-button"
            onClick={handlePrevious}
            disabled={currentPage === 1}
          >
            Previous
          </button>

          <div className="pagination-info">
            Page {currentPage} of {totalPages}
          </div>

          {/* Page Numbers */}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(
            (pageNumber) => (
              <button
                key={pageNumber}
                className={`pagination-button ${currentPage === pageNumber ? "active" : ""
                  }`}
                onClick={() => handlePageChange(pageNumber)}
              >
                {pageNumber}
              </button>
            )
          )}

          <button
            className="pagination-button"
            onClick={handleNext}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
