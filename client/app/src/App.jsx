import "./home.css";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import JobCard from "./ui/components/JobCard";
import Carousel from "./ui/components/Carousel";

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [jobs, setJobs] = useState([]); // State để lưu dữ liệu từ API
  // const [followCounts, setFollowCounts] = useState({}); // State để lưu số lượt yêu thích
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Fetching jobs and follow counts...");
    fetchJobsAndFollowCounts();
  }, []);

  const fetchJobsAndFollowCounts = async () => {
    try {
      // Fetch jobs
      const jobsResponse = await fetch("http://127.0.0.1:8000/api/jobs/");
      const jobsData = await jobsResponse.json();
      setJobs(jobsData);
      console.log("Fetched jobs:", jobsData);
      if (jobsResponse.ok) {  
        if (jobsData) {
          console.log("Fetched jobs:", jobsData.data);
          // // Fetch follow counts for all jobs
          // const jobIds = jobsData.data.map(job => job._id);
          // const followResponse = await fetch("/api/follow/count", {
          //   method: "POST",
          //   headers: {
          //     "Content-Type": "application/json",
          //   },
          //   body: JSON.stringify({ jobIds }),
          // });
          
          // if (followResponse.ok) {
          //   const followData = await followResponse.json();
          //   setFollowCounts(followData);
          // }
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const jobsPerPage = 24;
  const totalPages = Math.ceil(jobs.length / jobsPerPage);

  // Calculate jobs for current page
  const indexOfLastJob = currentPage * jobsPerPage;
  const indexOfFirstJob = indexOfLastJob - jobsPerPage;
  const currentJobs = jobs.slice(indexOfFirstJob, indexOfLastJob);

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
      </div>

      {/* Job Cards Grid */}
      <div className="jobs-grid">
        {currentJobs.map((job) => (
          <JobCard
            key={job._id}
            job={job}
            // followCount={followCounts[job._id]}
            showFollowBadge={true}
            onClick={() => handleCardClick(job._id)}
          />
        ))}
      </div>

      {/* Pagination */}
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
    </div>
  );
}
