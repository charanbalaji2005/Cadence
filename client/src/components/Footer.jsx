import { Link, useLocation } from 'react-router-dom';
import { Info, Command, Lock, History, Palette, GitBranch } from 'lucide-react';
import { useUI } from '../context/UIContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function Footer() {
  const ui = useUI();
  const { settings } = useSettings();
  const loc = useLocation();
  return (
    <footer>
      {loc.pathname === '/' && (
        <div className="hints">
          <span><kbd>tab</kbd> restart test</span>
          <span><kbd>esc</kbd> or <kbd>ctrl</kbd> + <kbd>k</kbd> command palette</span>
        </div>
      )}
      <div className="foot">
        <nav aria-label="Footer">
          <Link to="/about"><Info size="1em" />about</Link>
          <button type="button" onClick={ui.openPalette}><Command size="1em" />commands</button>
          <Link to="/about#privacy"><Lock size="1em" />privacy</Link>
          <Link to="/stats"><History size="1em" />history</Link>
        </nav>
        <div className="foot-right">
          <button type="button" onClick={ui.openThemePicker} title="Change theme"><Palette size="1em" />{settings.theme}</button>
          <span><GitBranch size="1em" /> v2.0.0</span>
        </div>
      </div>
    </footer>
  );
}
