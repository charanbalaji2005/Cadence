import { NavLink, useLocation } from 'react-router-dom';
import { Keyboard, Crown, ChartLine, Settings, UserRound, LogIn, Swords } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function TabBar() {
  const { user } = useAuth();
  const loc = useLocation();
  const items = [['/', Keyboard, 'Type'], ['/compete', Swords, 'Compete'], ['/leaderboard', Crown, 'Ranks'], ['/stats', ChartLine, 'Stats'], ['/settings', Settings, 'Settings'], user ? ['/account', UserRound, 'Account'] : ['/login', LogIn, 'Log in']];
  return (
    <nav className="tabbar" aria-label="Main">
      {items.map(([to, Icon, label]) => (
        <NavLink key={to} to={to} end={to !== '/compete'} aria-current={loc.pathname === to || (to === '/compete' && loc.pathname.startsWith('/compete/')) ? 'page' : undefined}><Icon size="1em" />{label}</NavLink>
      ))}
    </nav>
  );
}
