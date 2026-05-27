import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Search from "./Search";

export default function JobSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [skills, setSkills] = useState([]);
  const [cities, setCities] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchSkillsAndCities();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchQuery(params.get('q') || '');
    setSelectedSkill(params.get('skill') || '');
    setSelectedCity(params.get('city') || '');
  }, [location.search]);

  const fetchSkillsAndCities = async () => {
    try {
      const response = await fetch('/api/jobs/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const jobsResponse = await response.json();
        const jobs = jobsResponse.data || jobsResponse || [];
        
        // Extract unique skills
        const allSkills = new Set();
        jobs.forEach(job => {
          if (job.skills && Array.isArray(job.skills)) {
            job.skills.forEach(skill => {
              if (skill && skill.trim()) {
                allSkills.add(skill.trim());
              }
            });
          }
        });
        
        // Extract unique cities with normalization
        const cityMap = new Map();
        jobs.forEach(job => {
          if (job.province && job.province.trim()) {
            const normalizedCity = normalizeCity(job.province.trim());
            if (!cityMap.has(normalizedCity.toLowerCase())) {
              cityMap.set(normalizedCity.toLowerCase(), normalizedCity);
            }
          }
          if (job.location && job.location.trim()) {
            const normalizedCity = normalizeCity(job.location.trim());
            if (!cityMap.has(normalizedCity.toLowerCase())) {
              cityMap.set(normalizedCity.toLowerCase(), normalizedCity);
            }
          }
        });
        
        setSkills(Array.from(allSkills).sort());
        setCities(Array.from(cityMap.values()).sort());
      }
    } catch (error) {
      console.error('Error fetching skills and cities:', error);
    }
  };

  const normalizeCity = (cityName) => {
    return cityName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    
    if (searchQuery.trim()) {
      params.append('q', searchQuery.trim());
    }
    if (selectedSkill) {
      params.append('skill', selectedSkill);
    }
    if (selectedCity) {
      params.append('city', selectedCity);
    }
    
    if (params.toString()) {
      navigate(`/search?${params.toString()}`);
      return;
    }

    navigate('/');
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch(e);
    }
  };

  return (
    <div className="search-form-wrapper">
      <Search
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyPress={handleSearchKeyPress}
        onSearch={handleSearch}
        placeholder="Tìm kiếm việc làm"
      />
    
      <div className="search-filters">
        <select 
          className="filter-select"
          value={selectedSkill}
          onChange={(e) => setSelectedSkill(e.target.value)}
        >
          <option value="">Tất cả kỹ năng</option>
          {skills.map((skill, index) => (
            <option key={index} value={skill}>{skill}</option>
          ))}
        </select>
        <select 
          className="filter-select"
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
        >
          <option value="">Tất cả thành phố</option>
          {cities.map((city, index) => (
            <option key={index} value={city}>{city}</option>
          ))}
        </select>
        <button
        type="button"
        className="search-submit-button"
        onClick={handleSearch}
        >
        Tìm kiếm
      </button>
      </div>
    </div>
  );
}
