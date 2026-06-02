import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Search from "./Search";

export default function JobSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [skills, setSkills] = useState([]);
  const [cities, setCities] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
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

  // Update skills when city is selected
  useEffect(() => {
  if (selectedCity && allJobs.length > 0) {
    const jobsInCity = allJobs.filter(
      job => (job.province || "").trim() === selectedCity
    );

    const skillsInCity = new Set();

    jobsInCity.forEach(job => {
      (job.skills || []).forEach(skill => {
        const trimmed = skill.trim();
        if (trimmed) skillsInCity.add(trimmed);
      });
    });

    setSkills(Array.from(skillsInCity).sort());
  } else if (!selectedCity && allJobs.length > 0) {
    const allSkillsList = new Set();

    allJobs.forEach(job => {
      (job.skills || []).forEach(skill => {
        const trimmed = skill.trim();
        if (trimmed) allSkillsList.add(trimmed);
      });
    });

    setSkills(Array.from(allSkillsList).sort());
  }
}, [selectedCity, allJobs]);

  const fetchSkillsAndCities = async () => {
  try {
    const response = await fetch('/api/jobs/', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const jobs = data.data || [];

      setAllJobs(jobs);

      const skillsSet = new Set();
      const citiesSet = new Set();

      jobs.forEach(job => {
        // Skills
        (job.skills || []).forEach(skill => {
          const trimmed = skill.trim();
          if (trimmed) skillsSet.add(trimmed);
        });

        // Province
        const province = (job.province || "").trim();
        if (province) {
          citiesSet.add(province);
        }
      });

      setSkills(Array.from(skillsSet).sort());
      setCities(Array.from(citiesSet).sort());
    }
  } catch (error) {
    console.error('Error fetching skills and cities:', error);
  }
};

  const normalizeLocationText = (value) => {
    if (!value) return "";
    const ascii = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  };

  const condenseLocationText = (value) => value.replace(/[^a-z0-9]+/g, "");

  const matchesLocation = (text, condensed, words, condensedWords) =>
    words.some((token) => text.includes(token)) ||
    condensedWords.some((token) => condensed.includes(token));

  const getCanonicalCity = (value, fallback = "") => {
    const text = normalizeLocationText(value);
    if (!text) return fallback;
    const condensed = condenseLocationText(text);


    return fallback;
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
