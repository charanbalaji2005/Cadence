import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, Link } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import TabBar from './components/TabBar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import ThemePicker from './components/ThemePicker.jsx';
import Prompt from './components/Prompt.jsx';
import MaintenanceModal from './components/MaintenanceModal.jsx';
import WaitingRoomModal from './components/WaitingRoomModal.jsx';
import TestPage from './pages/TestPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import AboutPage from './pages/AboutPage.jsx';

import AccountNameModal from './components/AccountNameModal.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useUI } from './context/UIContext.jsx';
import { useNotifications } from './context/NotificationContext.jsx';
import { loadFor } from './lib/store.js';
import { trackPage, trackErrors } from './lib/tracker.js';

// Competition pages load on first visit, so they add nothing to the typing test's startup.
const FriendsPage = lazy(() => import('./pages/FriendsPage.jsx'));
const CompetePage = lazy(() => import('./pages/CompetePage.jsx'));
const RoomPage = lazy(() => import('./pages/RoomPage.jsx'));
const page = el => <Suspense fallback={<div className="spinner" role="status" aria-label="Loading" />}>{el}</Suspense>;
// The admin panel is its own chunk: regular visitors never download it.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

trackErrors();

export default function App() {
  const auth = useAuth();
  const ui = useUI();
  const loc = useLocation();

  // Ping server wake-up as early as possible so Render starts booting immediately
  useEffect(() => { auth.wake?.('cadence_app_mount'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // First-party page analytics (skips admin pages and browsers that opt out).
  useEffect(() => { trackPage(loc.pathname); }, [loc.pathname]);

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

  const { addNotification } = useNotifications();
  const isMaintenanceActive = Boolean(auth.maintenance?.maintenanceMode);
  const isAdminUser = Boolean(auth.user?.role && auth.user.role !== 'USER');
  const [trafficQueue, setTrafficQueue] = useState(null);

  useEffect(() => {
    const onQueued = e => {
      if (isAdminUser || loc.pathname.startsWith('/admin')) return;
      setTrafficQueue(e.detail || { queuePosition: 3, estimatedWaitSeconds: 5 });
    };
    window.addEventListener('cadence:traffic-queued', onQueued);
    return () => window.removeEventListener('cadence:traffic-queued', onQueued);
  }, [isAdminUser, loc.pathname]);

  if (loc.pathname === '/admin' || loc.pathname.startsWith('/admin/')) {
    return (
      <>
        <Suspense fallback={<div className="adm-boot"><div className="spinner" role="status" aria-label="Loading admin panel" /></div>}><AdminApp /></Suspense>
        <CommandPalette />
        <ThemePicker />
        <Prompt />
      </>
    );
  }

  return (
    <>
      <div className="backdrop" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>
      {auth.offline && <div className="offline" role="status">Can't reach the server. Results will be kept in this browser.</div>}
      {isMaintenanceActive && !isAdminUser && (
        <MaintenanceModal
          maintenance={auth.maintenance}
          onRefresh={auth.checkMaintenance}
        />
      )}
      {trafficQueue && (
        <WaitingRoomModal
          queueData={trafficQueue}
          onAdmitted={() => {
            sessionStorage.setItem('tf_traffic_pass', 'true');
            setTrafficQueue(null);
          }}
        />
      )}
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
            <Route path="/friends" element={page(<FriendsPage />)} />
            <Route path="/compete" element={page(<CompetePage />)} />
            <Route path="/compete/join/:code" element={page(<RoomPage />)} />
            <Route path="/compete/:code" element={page(<RoomPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
      <TabBar />
      <CommandPalette />
      <ThemePicker />
      <Prompt />
      <AccountNameModal
        isOpen={auth.ready && !!auth.user && auth.needsOnboarding}
        initialUsername={auth.suggestedUsername}
        onContinue={async ({ username }) => {
          try {
            const res = await auth.completeProfile({ username });
            ui.toast(`Welcome to Cadence, ${res.user.username}!`);
            addNotification({
              category: 'Success',
              title: 'Account created',
              type: 'success'
            });
          } catch (err) {
            ui.toast(err.message || 'Could not set username');
          }
        }}
        onClose={() => auth.closeOnboarding()}
      />
    </>
  );
}
