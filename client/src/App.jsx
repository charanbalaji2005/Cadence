import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import TabBar from './components/TabBar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import ThemePicker from './components/ThemePicker.jsx';
import Prompt from './components/Prompt.jsx';
import TestPage from './pages/TestPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useUI } from './context/UIContext.jsx';
import { loadFor } from './lib/store.js';

export default function App() {
  const auth = useAuth();
  const ui = useUI();
  const loc = useLocation();

  // Load results for whoever is signed in (or the guest).
  useEffect(() => { if (auth.ready) loadFor(auth.user); }, [auth.ready, auth.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.body.dataset.route = loc.pathname;
    if (!loc.hash) window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash]);

  // App-wide shortcuts run first (capture phase) so the typing test never sees them.
  useEffect(() => {
    const onKey = e => {
      const k = e.key, mod = e.ctrlKey || e.metaKey;
      if (ui.isOverlayOpen()) { if (k === 'Escape') { e.preventDefault(); ui.closeTop(); } return; }
      if (mod && e.shiftKey && k.toLowerCase() === 't') { e.preventDefault(); ui.openThemePicker(); return; }
      if (k === 'Escape' || (mod && k.toLowerCase() === 'k') || (mod && e.shiftKey && k.toLowerCase() === 'p')) { e.preventDefault(); ui.openPalette(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [ui]);

  useEffect(() => {
    const onMove = e => { if (document.body.classList.contains('typing') && Math.abs(e.movementX) + Math.abs(e.movementY) > 4) document.body.classList.remove('typing'); };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  const onBrand = () => { if (loc.pathname === '/') window.dispatchEvent(new Event('tf:restart')); };

  return (
    <>
      <div className="backdrop" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>
      {auth.offline && <div className="offline" role="status">Can't reach the server. Results will be kept in this browser.</div>}
      <div className="app">
        <Header onBrand={onBrand} />
        <main>
          <Routes>
            <Route path="/" element={<TestPage />} />
            <Route path="/login" element={<AuthPage mode="login" key="login" />} />
            <Route path="/register" element={<AuthPage mode="register" key="register" />} />
            <Route path="/signup" element={<Navigate to="/register" replace />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
      <TabBar />
      <CommandPalette />
      <ThemePicker />
      <Prompt />
    </>
  );
}
