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
      // Fetch jobs
      const jobsResponse = await fetch("/api/jobs/");
      const jobsData = await jobsResponse.json();

      if (jobsResponse.ok) {
        const rawItems = jobsData.items || jobsData.data || jobsData || [];
        const items = Array.isArray(rawItems) ? rawItems : [];
        const sortedItems = [...items].sort((a, b) => {
          const aTime = a?.collected_at ? Date.parse(a.collected_at) : 0;
          const bTime = b?.collected_at ? Date.parse(b.collected_at) : 0;
          const safeATime = Number.isNaN(aTime) ? 0 : aTime;
          const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
          return safeBTime - safeATime;
        });
        const filteredJobs = sortedItems.filter((job) => {
  const title = (job.job_title || "").toLowerCase();
  const description = (job.job_description || "").toLowerCase();

  const skills = (job.skills || []).map((s) => s.toLowerCase());

  const city = (job.province || "").toLowerCase();

  const matchQuery =
    !queryText ||
    title.includes(queryText) ||
    description.includes(queryText);

  const matchSkill =
    !selectedSkill ||
    skills.some((s) => s.includes(selectedSkill));

  const matchCity =
    !selectedCity ||
    city.includes(selectedCity);

  return matchQuery && matchSkill && matchCity;
});
        const total = jobsData.total || filteredJobs.length;
        const pages = total > 0 ? Math.ceil(total / jobsPerPage) : 0;


        setJobs(filteredJobs);
        setTotalJobs(total);
        setTotalPages(pages);
        if (pages > 0 && currentPage > pages) {
          setCurrentPage(pages);
        }
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

  const startIndex = (currentPage - 1) * jobsPerPage;
  const currentJobs = jobs.slice(startIndex, startIndex + jobsPerPage);

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
        {currentJobs.map((job) => (
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

      {currentJobs.length === 0 && (
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
