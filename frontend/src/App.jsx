import { Link, Route, Routes } from 'react-router-dom';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import LandingPage from './pages/LandingPage.jsx';

function NotFound() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to the URL shortener</Link>
      </p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/stats/:shortCode" element={<AnalyticsPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
