import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Keyboard, Crown, ChartLine, Info, Settings, LogIn, LogOut, ChevronDown, UserRound } from 'lucide-react';
import Logo from './Logo.jsx';
import Avatar from './Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';

const NAV = [['/', Keyboard, 'Typing test'], ['/leaderboard', Crown, 'Leaderboard'], ['/stats', ChartLine, 'Stats and history'], ['/about', Info, 'About'], ['/settings', Settings, 'Settings']];

export default function Header({ onBrand }) {
  const auth = useAuth();
  const ui = useUI();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => { setMenu(false); }, [loc.pathname]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const signOut = async () => { setMenu(false); await auth.logout(); ui.toast('Signed out'); nav('/'); };

  return (
    <header className="top">
      <Link className="brand" to="/" onClick={onBrand} aria-label="TypeFlow, go to the typing test">
        <Logo />
        <span className="wordmark"><small>keep the rhythm</small><strong>typeflow</strong></span>
      </Link>
      <nav className="nav" aria-label="Main">
        {NAV.map(([to, Icon, label]) => (
          <NavLink key={to} to={to} end title={label} aria-label={label} aria-current={loc.pathname === to ? 'page' : undefined}><Icon size="1em" /></NavLink>
        ))}
      </nav>
      <div className="top-right">
        {!auth.ready ? null : !auth.user ? (
          <>
            <Link className="btn ghost" to="/login"><LogIn size="1em" />Log in</Link>
            <Link className="btn primary" to="/register">Sign up</Link>
          </>
        ) : (
          <div className="user" ref={menuRef}>
            <button className="user-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
              <Avatar name={auth.user.username} url={auth.user.avatar} />
              <span className="uname">{auth.user.username}</span><ChevronDown size="1em" />
            </button>
            {menu && (
              <div className="menu" role="menu">
                <Link role="menuitem" to="/account"><UserRound size="1em" />Account</Link>
                <Link role="menuitem" to="/stats"><ChartLine size="1em" />Stats and history</Link>
                <Link role="menuitem" to="/leaderboard"><Crown size="1em" />Leaderboard</Link>
                <Link role="menuitem" to="/settings"><Settings size="1em" />Settings</Link>
                <hr />
                <button role="menuitem" onClick={signOut}><LogOut size="1em" />Sign out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
