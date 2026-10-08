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
          <a
            href="https://github.com/charanbalaji2005/Cadence/tree/main"
            target="_blank"
            rel="noopener noreferrer"
            title="View Cadence on GitHub"
            className="foot-link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', color: 'inherit', textDecoration: 'none' }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>github</span>
          </a>
          <button type="button" onClick={ui.openThemePicker} title="Change theme"><Palette size="1em" />{settings.theme}</button>
          <span><GitBranch size="1em" /> v2.0.0</span>
        </div>
      </div>
    </footer>
  );
}
