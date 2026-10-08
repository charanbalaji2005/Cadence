import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, ChartLine, LogOut, Award, Save, MonitorSmartphone, Trash2 } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import Badge from '../components/Badge.jsx';
import { ACHIEVEMENTS, aggregate, unlockedIds } from '../lib/achievements.js';
import { fmtDate, fmtTime } from '../lib/format.js';
import { useData } from '../lib/store.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import CompetitionHistory from '../components/compete/CompetitionHistory.jsx';

export default function AccountPage() {
  const auth = useAuth();
  const ui = useUI();
  const data = useData();
  const nav = useNavigate();
  const [name, setName] = useState(auth.user?.username || '');
  const [nameMsg, setNameMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  if (auth.ready && !auth.user) return <Navigate to="/login" replace />;
  if (!auth.user) return null;

  const u = auth.user, hist = data.results, a = aggregate(hist), unlocked = unlockedIds(hist);
  const last10 = hist.slice(-10), avg = last10.length ? last10.reduce((s, h) => s + h.wpm, 0) / last10.length : 0;
  const session = auth.session ? (auth.session.remember ? `Signed in on this device until ${fmtDate(auth.session.expiresAt, true)}` : 'Signed in until you close the browser') : 'Signed in';

  const rename = async e => {
    e.preventDefault();
    if (name.trim() === u.username) return;
    setSaving(true); setNameMsg(null);
    try { await auth.updateUsername(name.trim()); setNameMsg({ ok: true, text: 'Username updated.' }); }
    catch (err) { setNameMsg({ ok: false, text: err.message }); }
    finally { setSaving(false); }
  };
  const signOut = async () => {
    try {
      await auth.logout();
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    ui.toast('See you soon! 👋');
    nav('/');
  };
  const signOutAll = () => ui.openPrompt({ title: 'Sign out everywhere?', desc: 'This ends your sessions on every device, including this one.', kind: null, okLabel: 'Sign out everywhere',
    onOk: async () => { try { await auth.logoutAll(); ui.toast('See you soon! Signed out on every device 👋'); nav('/'); } catch (err) { return err.message; } } });
  const remove = () => ui.openPrompt({ title: 'Delete your account?', desc: 'Your account, every result and your leaderboard scores will be deleted for good. Type DELETE to confirm.', kind: 'textarea', value: '', okLabel: 'Delete account', danger: true,
    onOk: async v => { if (v.trim() !== 'DELETE') return 'Type DELETE in capital letters to confirm.'; try { await auth.deleteAccount(); ui.toast('Your account was deleted'); nav('/'); } catch (err) { return err.message; } } });

  return (
    <div className="page">
      <div className="profile-head">
        <Avatar name={u.username} url={u.avatar} size="lg" />
        <div>
          <h1>{u.username}</h1>
          <p>{u.email}{u.createdAt ? `, joined ${fmtDate(u.createdAt)}` : ''}{u.provider === 'google' ? ', Google account' : u.provider === 'github' ? ', GitHub account' : ''}</p>
          <p><ShieldCheck size="1em" style={{ verticalAlign: '-2px' }} /> {session}</p>
        </div>
        <div className="actions">
          <Link className="btn outline" to="/stats"><ChartLine size="1em" />Stats</Link>
          <button type="button" className="btn ghost" onClick={signOut}><LogOut size="1em" />Sign out</button>
        </div>
      </div>
      <div className="panel glass">
        <div className="stats">
          <div><span>Tests</span><strong>{hist.length}</strong></div>
          <div><span>Best wpm</span><strong>{Math.round(a.best)}</strong></div>
          <div><span>Average, last 10</span><strong>{Math.round(avg)}</strong></div>
          <div><span>Time typing</span><strong>{fmtTime(a.time)}</strong></div>
          <div><span>Day streak</span><strong>{a.current}</strong></div>
        </div>
      </div>
      <CompetitionHistory limit={5} />
      <div className="panel glass">
        <h2><Award size="1em" />Achievements<span className="aside">{unlocked.length} of {ACHIEVEMENTS.length} unlocked</span></h2>
        <div className="goal-bar" style={{ margin: '0 0 1.25rem' }}><span style={{ width: `${unlocked.length / ACHIEVEMENTS.length * 100}%` }} /></div>
        <div className="ach-grid">{ACHIEVEMENTS.map(x => <Badge key={x.id} a={x} locked={!unlocked.includes(x.id)} />)}</div>
      </div>
      <div className="panel glass">
        <h2>Profile</h2>
        <form className="inline-form" onSubmit={rename} noValidate>
          <div className="field">
            <label htmlFor="uName">Username</label>
            <input id="uName" value={name} maxLength={16} onChange={e => setName(e.target.value)} />
            {nameMsg && <span className="hint" style={{ color: nameMsg.ok ? 'var(--accent)' : 'var(--error)' }}>{nameMsg.text}</span>}
          </div>
          <button className="btn primary" style={{ marginTop: '1.6rem' }} disabled={saving || name.trim() === u.username}><Save size="1em" />Save</button>
        </form>
      </div>
      <div className="panel glass">
        <h2>Security</h2>
        <div className="set-row"><div><h3>Sign out everywhere</h3><p>End your sessions on every device.</p></div><div className="ctrl"><button className="btn ghost" onClick={signOutAll}><MonitorSmartphone size="1em" />Sign out everywhere</button></div></div>
        <div className="set-row"><div><h3>Delete account</h3><p>Remove your account, results and leaderboard scores for good.</p></div><div className="ctrl"><button className="btn danger" onClick={remove}><Trash2 size="1em" />Delete account</button></div></div>
      </div>
    </div>
  );
}
