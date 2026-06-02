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

  const REMOTE_WORDS = ["remote", "work from home", "wfh", "tu xa", "lam tu xa"];
  const REMOTE_CONDENSED = ["remote", "workfromhome", "wfh", "tuxa", "lamtuxa"];
  const HCM_WORDS = ["ho chi minh", "tp ho chi minh", "sai gon", "saigon"];
  const HCM_CONDENSED = ["hochiminh", "tphochiminh", "hcm", "hcmc", "hcmm", "tphcm", "saigon"];
  const HN_WORDS = ["ha noi", "tp ha noi", "hanoi"];
  const HN_CONDENSED = ["hanoi", "tphanoi", "hn"];
  const DN_WORDS = ["da nang", "tp da nang", "danang"];
  const DN_CONDENSED = ["danang", "tpdanang", "dn"];
  const OTHER_WORDS = ["khac", "other", "others"];
  const OTHER_CONDENSED = ["khac", "other", "others"];

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
      // Filter jobs by selected city
      const jobsInCity = allJobs.filter(job => {
        const jobCity = getCanonicalCity(job.province, "Khác");
        return jobCity === selectedCity;
      });

      // Extract skills from filtered jobs
      const skillsInCity = new Set();
      jobsInCity.forEach(job => {
        (job.skills || []).forEach(s => {
          const trimmed = s.trim();
          if (trimmed) skillsInCity.add(trimmed);
        });
      });

      setSkills(Array.from(skillsInCity).sort());
    } else if (!selectedCity && allJobs.length > 0) {
      // Show all skills when no city selected
      const allSkillsList = new Set();
      allJobs.forEach(job => {
        (job.skills || []).forEach(s => {
          const trimmed = s.trim();
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

        // Extract all skills
        const skillsList = new Set();
        const cityMap = new Map();

        jobs.forEach((job) => {
          // Add skills
          (job.skills || []).forEach(skill => {
            const trimmed = skill.trim();
            if (trimmed) skillsList.add(trimmed);
          });

          // Add cities
          if (job.province && job.province.trim()) {
            const normalizedCity = getCanonicalCity(job.province.trim(), "Khác");
            if (normalizedCity && !cityMap.has(normalizedCity.toLowerCase())) {
              cityMap.set(normalizedCity.toLowerCase(), normalizedCity);
            }
          }
        });

        setSkills(Array.from(skillsList).sort());
        setCities(Array.from(cityMap.values()).sort());
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

    if (matchesLocation(text, condensed, REMOTE_WORDS, REMOTE_CONDENSED)) return "Remote";
    if (matchesLocation(text, condensed, HCM_WORDS, HCM_CONDENSED)) return "Hồ Chí Minh";
    if (matchesLocation(text, condensed, HN_WORDS, HN_CONDENSED)) return "Hà Nội";
    if (matchesLocation(text, condensed, DN_WORDS, DN_CONDENSED)) return "Đà Nẵng";
    if (matchesLocation(text, condensed, OTHER_WORDS, OTHER_CONDENSED)) return "Khác";

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
