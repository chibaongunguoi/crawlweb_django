import "./home.css";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import JobCard from "./ui/components/JobCard";
import Carousel from "./ui/components/Carousel";

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [jobs, setJobs] = useState([]); // State để lưu dữ liệu từ API
  // const [followCounts, setFollowCounts] = useState({}); // State để lưu số lượt yêu thích
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const queryText = (searchParams.get("q") || "").trim().toLowerCase();
  const selectedSkill = (searchParams.get("skill") || "").trim().toLowerCase();
  const selectedCity = (searchParams.get("city") || "").trim().toLowerCase();
  const highlightTerms = [queryText, selectedSkill, selectedCity].filter(Boolean);

  useEffect(() => {
    fetchJobsAndFollowCounts();
  }, []);

  const fetchJobsAndFollowCounts = async () => {
    try {
      // Fetch jobs
      const jobsResponse = await fetch("/api/jobs/");
      const jobsData = await jobsResponse.json();
      
      if (jobsResponse.ok) {
        // Extract data array from response
        const jobsArray = jobsData.data || jobsData || [];
        setJobs(jobsArray);
        
        // if (jobsArray.length > 0) {
        //   // Fetch follow counts for all jobs
        //   const jobIds = jobsArray.map(job => job._id);
        //   const followResponse = await fetch("/api/follow/count", {
        //     method: "POST",
        //     headers: {
        //       "Content-Type": "application/json",
        //     },
        //     body: JSON.stringify({ jobIds }),
        //   });
          
        //   if (followResponse.ok) {
        //     const followData = await followResponse.json();
        //     setFollowCounts(followData);
        //   }
        // }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const jobsPerPage = 24;
  const filteredJobs = jobs.filter((job) => {
    const title = (job.job_title || "").toLowerCase();
    const company = (job.company_name || "").toLowerCase();
    const province = (job.province || "").toLowerCase();
    const locationText = (job.location || "").toLowerCase();
    const skillList = Array.isArray(job.skills)
      ? job.skills.map((skill) => (skill || "").toLowerCase())
      : [];

    const matchesQuery =
      !queryText ||
      title.includes(queryText) ||
      company.includes(queryText) ||
      province.includes(queryText) ||
      locationText.includes(queryText) ||
      skillList.some((skill) => skill.includes(queryText));

    const matchesSkill =
      !selectedSkill || skillList.some((skill) => skill === selectedSkill);

    const matchesCity =
      !selectedCity ||
      province.includes(selectedCity) ||
      locationText.includes(selectedCity);

    return matchesQuery && matchesSkill && matchesCity;
  });

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / jobsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [queryText, selectedSkill, selectedCity]);

  // Calculate jobs for current page
  const indexOfLastJob = currentPage * jobsPerPage;
  const indexOfFirstJob = indexOfLastJob - jobsPerPage;
  const currentJobs = filteredJobs.slice(indexOfFirstJob, indexOfLastJob);

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
            Tìm thấy <strong>{filteredJobs.length}</strong> công việc phù hợp.
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

      {filteredJobs.length === 0 && (
        <div className="header-section">
          <p>Không có công việc nào khớp với điều kiện tìm kiếm.</p>
        </div>
      )}

      {/* Pagination */}
      {filteredJobs.length > 0 && (
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
