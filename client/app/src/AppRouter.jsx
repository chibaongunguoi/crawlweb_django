import { Routes, Route, useLocation } from 'react-router-dom';
import Home from './App';
import LoginPage from './Login';
import RegisterPage from './Register';
import Header from './ui/layout/header';
import Footer from './ui/layout/footer';

export default function AppRouter() {
  const location = useLocation();
  
  // Routes that shouldn't show header/footer
  const noLayoutRoutes = ['/login', '/register'];
  const showLayout = !noLayoutRoutes.includes(location.pathname);

  return (
    <div className="app-wrapper">
      {showLayout && <Header />}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* Add more routes here as needed */}
        </Routes>
      </main>
      {showLayout && <Footer />}
    </div>
  );
}
