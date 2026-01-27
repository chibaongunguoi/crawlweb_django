import './JobCard.css';

export default function JobCard({ job, followCount = null, showFollowBadge = false, onClick }) {
  const hasFollowCount = showFollowBadge && followCount !== null && followCount > 0;
  return (
    <div 
      className={`job-card ${onClick ? 'clickable-card' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {hasFollowCount && (
        <div className="follow-badge">
          <svg className="heart-icon-small" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className="follow-count">{followCount}</span>
        </div>
      )}
      
      <div className="job-header">
        <div className="company-logo">
          <img
            src={job.thumbnail || '/default-company.png'}
            alt={job.company_name || 'Company'}
            width="64"
            height="64"
            style={{ objectFit: 'contain' }}
          />
        </div>
        <div className="job-info">
          <h3 className="job-title">{job.job_title}</h3>
          <div className="job-details">
            <span className="detail-item">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {job.salary}
            </span>
            <span className="detail-item">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {job.province}
            </span>
          </div>
          <div className="skills-list">
            {console.log("Job skills:", job.skills)}
            {job.skills && job.skills.map((skill, index) => (
              <span key={index} className="skill-tag">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}