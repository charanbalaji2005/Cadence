import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function AboutPage() {
  const loc = useLocation();
  useEffect(() => { if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }); }, [loc.hash]);
  return (
    <div className="page">
      <h1>About TypeFlow</h1>
      <p className="lede">A typing test built for focus. Pick a mode, start typing, and see how fast and how accurately you type.</p>
      <div className="panel glass">
        <h2>How results are measured</h2>
        <p><strong>wpm</strong> counts the characters in words you typed correctly, spaces included, divided by five, per minute.</p>
        <p><strong>raw</strong> counts every key you pressed the same way, mistakes included.</p>
        <p><strong>accuracy</strong> is the share of keystrokes that matched the text.</p>
        <p><strong>consistency</strong> shows how steady your raw speed stayed from one second to the next.</p>
      </div>
      <div className="panel glass">
        <h2>Keyboard shortcuts</h2>
        <dl className="kbd-list">
          <dt><kbd>tab</kbd></dt><dd>Restart the test</dd>
          <dt><kbd>esc</kbd> or <kbd>ctrl</kbd> + <kbd>k</kbd></dt><dd>Open the command palette</dd>
          <dt><kbd>ctrl</kbd> + <kbd>shift</kbd> + <kbd>t</kbd></dt><dd>Open the theme picker</dd>
          <dt><kbd>ctrl</kbd> + <kbd>backspace</kbd></dt><dd>Delete the current word</dd>
          <dt><kbd>shift</kbd> + <kbd>enter</kbd></dt><dd>Finish a zen session</dd>
        </dl>
      </div>
      <div className="panel glass" id="privacy">
        <h2>Privacy and sessions</h2>
        <p>When you log in, TypeFlow sets a secure, HTTP-only session cookie. With "Keep me signed in" it lasts 7 days; otherwise it ends when you close the browser. Signing out ends the session on the server straight away.</p>
        <p>Your results, key stats and settings are stored with your account. Only your username and your best 15 and 60 second scores are shown publicly on the leaderboard. Google sign-in asks only for your name, email address and profile picture.</p>
        <p>As a guest, results stay in this browser. When you create an account or log in, they move into your account.</p>
      </div>
    </div>
  );
}
