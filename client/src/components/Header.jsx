import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Keyboard, Crown, ChartLine, Info, Settings, LogIn, LogOut, ChevronDown, UserRound, Bell, Swords, Users, DoorOpen, ArrowRight, ShieldCheck } from 'lucide-react';
import Logo from './Logo.jsx';
import Avatar from './Avatar.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI, useOverlay } from '../context/UIContext.jsx';
import { useCompete } from '../context/CompeteContext.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';

const NAV = [['/', Keyboard, 'Typing test'], ['/compete', Swords, 'Compete'], ['/friends', Users, 'Friends'], ['/leaderboard', Crown, 'Leaderboard'], ['/stats', ChartLine, 'Stats and history'], ['/about', Info, 'About'], ['/settings', Settings, 'Settings']];

export default function Header({ onBrand }) {
  const auth = useAuth();
  const ui = useUI();
  const compete = useCompete();
  const { unreadCount } = useNotifications();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => { setMenu(false); setNotifOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!auth.user) {
      setNotifOpen(false);
    }
  }, [auth.user]);
  // Registered as an overlay so Escape closes the menu (instead of opening the palette) and typing pauses.
  useOverlay('user-menu', menu, () => setMenu(false));
  useEffect(() => { if (menu) requestAnimationFrame(() => menuRef.current?.querySelector('.menu [role="menuitem"]')?.focus()); }, [menu]);
  const menuKeys = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...menuRef.current.querySelectorAll('.menu [role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const fromMenu = fn => () => { setMenu(false); fn(); };
  const room = compete?.room;
  const requests = compete?.friendRequests || 0;
  useEffect(() => {
    if (!menu) return undefined;
    const close = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const signOut = async () => {
    setMenu(false);
    setNotifOpen(false);
    try {
      await auth.logout();
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    ui.toast('See you soon! 👋');
    nav('/');
  };

  return (
    <header className="top">
      <Link className="brand" to="/" onClick={onBrand} aria-label="Cadence, go to the typing test">
        <Logo size={34} />
        <span className="wordmark"><small>keep the rhythm</small><strong>cadence</strong></span>
      </Link>
      <nav className="nav" aria-label="Main">
        {NAV.map(([to, Icon, label]) => (
          <NavLink key={to} to={to} end={to !== '/compete'} title={label} aria-label={to === '/friends' && requests ? `${label}, ${requests} pending request${requests === 1 ? '' : 's'}` : label}
            aria-current={loc.pathname === to || (to === '/compete' && loc.pathname.startsWith('/compete/')) ? 'page' : undefined}>
            <Icon size="1em" />{to === '/friends' && requests > 0 && <span className="nav-badge" aria-hidden="true" />}
          </NavLink>
        ))}
      </nav>
      <div className="top-right">
        {!auth.ready ? null : !auth.user ? (
          <>
            <Link
              className="btn ghost"
              to="/login"
              onMouseEnter={() => auth.wake?.('login_nav_hover')}
              onClick={() => auth.wake?.('login_nav_click')}
            >
              <LogIn size="1em" />Log in
            </Link>
            <Link
              className="btn primary"
              to="/register"
              onMouseEnter={() => auth.wake?.('register_nav_hover')}
              onClick={() => auth.wake?.('register_nav_click')}
            >
              Sign up
            </Link>
          </>
        ) : (
          <>
            {/* Notification Center button & flyout (only rendered when logged in) */}
            <div className="notif-wrapper" style={{ position: 'relative' }}>
              <button
                type="button"
                className={`icon-btn notif-toggle-btn${notifOpen ? ' active' : ''}`}
                title="Inbox & Notifications"
                aria-label="Inbox and Notifications"
                onClick={() => setNotifOpen(o => !o)}
              >
                <Bell size="1.05em" />
                {unreadCount > 0 && <span className="notif-badge-dot" />}
              </button>
              <NotificationCenter isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
            </div>

            <div className="user" ref={menuRef}>
              <button className="user-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
                <Avatar name={auth.user.username} url={auth.user.avatar} />
                <span className="uname">{auth.user.username}</span><ChevronDown size="1em" />
              </button>
            {menu && (
              <div className="menu menu-account" role="menu" aria-label="Account" onKeyDown={menuKeys}>
                <div className="menu-profile">
                  <Avatar name={auth.user.username} url={auth.user.avatar} />
                  <div><strong>{auth.user.username}</strong><small>{auth.user.email}</small></div>
                </div>
                <div className="menu-compete" role="group" aria-label="Compete">
                  <button role="menuitem" type="button" className="menu-cta primary" onClick={fromMenu(() => compete.openCreateRoom())}><Swords size="1em" />Create room</button>
                  <button role="menuitem" type="button" className="menu-cta" onClick={fromMenu(() => compete.openJoinRoom())}><DoorOpen size="1em" />Join room</button>
                </div>
                {room && (
                  <Link role="menuitem" className="menu-room" to={`/compete/${room.code}`} onClick={() => setMenu(false)}>
                    <span className={`cp-live-dot${room.status === 'RUNNING' ? ' racing' : ''}`} aria-hidden="true" />
                    <span>Return to room <strong>{room.code}</strong></span><ArrowRight size="1em" />
                  </Link>
                )}
                <hr />
                <Link role="menuitem" to="/friends"><Users size="1em" />Friends{requests > 0 && <span className="menu-count" aria-label={`${requests} pending`}>{requests}</span>}</Link>
                <Link role="menuitem" to="/compete"><Swords size="1em" />Compete</Link>
                <hr />
                <Link role="menuitem" to={`/profile/${auth.user.username}`}><UserRound size="1em" />Public profile</Link>
                <Link role="menuitem" to="/account"><Settings size="1em" />Account settings</Link>
                <Link role="menuitem" to="/stats"><ChartLine size="1em" />Stats and history</Link>
                <Link role="menuitem" to="/leaderboard"><Crown size="1em" />Leaderboard</Link>
                <Link role="menuitem" to="/settings"><Settings size="1em" />Settings</Link>
                {auth.user.role && auth.user.role !== 'USER' && <Link role="menuitem" to="/admin"><ShieldCheck size="1em" />Admin panel</Link>}
                <hr />
                <button role="menuitem" type="button" onClick={signOut}><LogOut size="1em" />Sign out</button>
              </div>
            )}
          </div>
        </>
      )}
      </div>
    </header>
  );
}
