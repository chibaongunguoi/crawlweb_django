import { Routes, Route, useLocation } from 'react-router-dom';
import Home from './App';
import LoginPage from './Login';
import RegisterPage from './Register';
import UserProfile from './UserProfile';
import JobDetail from './JobDetail';
import Header from './ui/layout/header';
import Footer from './ui/layout/footer';
import AdminLayout from './admin/AdminLayout';
import AdminDashboard from './admin/AdminDashboard';
import UserManager from './admin/UserManager';
import JobManager from './admin/JobManager';
import CompanyManager from './admin/CompanyManager';
import NotificationManager from './admin/NotificationManager';
import ScrapeManager from './admin/ScrapeManager';
import './App.css';
export default function AppRouter() {
  const location = useLocation();
  
  // Routes that shouldn't show header/footer
  const noLayoutRoutes = ['/admin'];
  const showLayout = !noLayoutRoutes.some(route => location.pathname.startsWith(route));

  return (
    <div className="app-wrapper">
      {showLayout && <Header />}
      <main className="main-content-wrapper">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/user/profile" element={<UserProfile />} />
          <Route path="/job/:id" element={<JobDetail />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<UserManager />} />
            <Route path="jobs" element={<JobManager />} />
            <Route path="companies" element={<CompanyManager />} />
            <Route path="notifications" element={<NotificationManager />} />
            <Route path="scrape" element={<ScrapeManager />} />
          </Route>
          
          {/* Add more routes here as needed */}
        </Routes>
      </main>
      {showLayout && <Footer />}
    </div>
  );
}

