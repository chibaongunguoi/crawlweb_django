import './JobCard.css';

export default function JobCard({ job, followCount = null, showFollowBadge = false, onClick, highlightTerms = [] }) {
  const hasFollowCount = showFollowBadge && followCount !== null && followCount > 0;
  const source = job.source || 'unknown';

  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightText = (text) => {
    const rawText = text ?? '';
    const terms = (highlightTerms || []).filter(Boolean);

    if (!rawText || terms.length === 0) {
      return rawText;
    }

    const pattern = terms.map((term) => escapeRegex(term)).join('|');
    if (!pattern) {
      return rawText;
    }

    const regex = new RegExp(`(${pattern})`, 'ig');
    const parts = String(rawText).split(regex);

    return parts.map((part, index) => {
      const isMatch = terms.some(
        (term) => part && part.toLowerCase() === term.toLowerCase()
      );

      return isMatch ? (
        <mark key={`${part}-${index}`} className="text-highlight">{part}</mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      );
    });
  };

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
          <h3 className="job-title">{highlightText(job.job_title)}</h3>
          <div className="job-source">Nguồn: {source}</div>
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
              {highlightText(job.salary)}
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
              {highlightText(job.province)}
            </span>
          </div>
          <div className="skills-list">
            {job.skills && job.skills.map((skill, index) => (
              <span key={index} className="skill-tag">
                {highlightText(skill)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}