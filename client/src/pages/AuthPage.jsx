import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, History, Crown, Target, ShieldCheck, ArrowBigUpDash } from 'lucide-react';
import GoogleButton from '../components/GoogleButton.jsx';
import TypingDemo from '../components/TypingDemo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { isTouch } from '../lib/format.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
const PW_LABELS = ['', 'Too short or weak', 'Fair', 'Good', 'Strong'];
function pwScore(p) {
  if (!p) return 0;
  if (p.length < 8) return 1;
  let s = 1;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  else if (/\d|[^A-Za-z0-9]/.test(p) && s < 4) s += 0.5;
  return Math.min(4, Math.floor(s));
}

function PasswordField({ id, label, value, onChange, autoComplete, placeholder, invalid, capsOn }) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder}
          className={invalid ? 'invalid' : ''} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
        <button type="button" className="icon-btn reveal" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(s => !s)}>{show ? <EyeOff size="1em" /> : <Eye size="1em" />}</button>
      </div>
      {focused && capsOn && <p className="caps-hint"><ArrowBigUpDash size="1em" />Caps Lock is on</p>}
    </div>
  );
}

export default function AuthPage({ mode }) {
  const reg = mode === 'register';
  const auth = useAuth();
  const ui = useUI();
  const { settings } = useSettings();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', email: '', password: '', password2: '' });
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState(null);
  const [invalid, setInvalid] = useState(null);
  const [busy, setBusy] = useState(false);
  const [userHint, setUserHint] = useState(null);
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  const firstRef = useRef(null);
  const capsOn = ui.caps && settings.capsWarning;

  useEffect(() => { setMsg(null); setInvalid(null); if (!isTouch()) setTimeout(() => firstRef.current?.focus(), 50); }, [mode]);
  useEffect(() => {
    if (!reg) return undefined;
    const v = f.username.trim();
    if (!v) { setUserHint(null); return undefined; }
    if (!USER_RE.test(v)) { setUserHint({ ok: false, text: 'Use 3 to 16 letters, numbers or underscores.' }); return undefined; }
    const t = setTimeout(async () => {
      try { const d = await auth.usernameAvailable(v); setUserHint({ ok: d.available, text: d.available ? 'That username is available.' : d.reason || 'That username is taken.' }); }
      catch { setUserHint(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [f.username, reg]); // eslint-disable-line react-hooks/exhaustive-deps

  if (auth.ready && auth.user) return <Navigate to="/" replace />;

  const set = k => v => setF(s => ({ ...s, [k]: v }));
  const fail = (text, field) => { setMsg({ text }); setInvalid(field || null); };
  const done = d => {
    const moved = d.imported ? ` ${d.imported} guest result${d.imported === 1 ? ' was' : 's were'} moved to your account.` : '';
    ui.toast((reg || d.created ? `Account created. Welcome, ${d.user.username}.` : `Signed in as ${d.user.username}.`) + moved);
    nav('/', { replace: true });
  };
  const submit = async e => {
    e.preventDefault();
    setInvalid(null);
    const email = f.email.trim();
    if (reg) {
      if (!USER_RE.test(f.username.trim())) return fail('Usernames use 3 to 16 letters, numbers or underscores.', 'username');
      if (!EMAIL_RE.test(email)) return fail('Enter a valid email address, like you@example.com.', 'email');
      if (f.password.length < 8) return fail('Passwords need at least 8 characters.', 'password');
      if (f.password !== f.password2) return fail("The two passwords don't match.", 'password2');
    } else {
      if (!EMAIL_RE.test(email)) return fail('Enter a valid email address, like you@example.com.', 'email');
      if (!f.password) return fail('Enter your password.', 'password');
    }
    setBusy(true); setMsg(null);
    try {
      const d = reg ? await auth.register({ username: f.username.trim(), email, password: f.password, remember }) : await auth.login({ email, password: f.password, remember });
      done(d);
    } catch (err) { fail(err.message); }
    finally { setBusy(false); }
  };
  const onGoogle = async credential => {
    setBusy(true); setMsg(null);
    try { done(await auth.google(credential, rememberRef.current)); }
    catch (err) { fail(err.message); }
    finally { setBusy(false); }
  };
  const score = pwScore(f.password);

  return (
    <div className="auth-page">
      <div className="auth-card glass">
        <aside className="auth-show" aria-hidden="true">
          <h2>{reg ? 'Every keystroke counts. Start keeping score.' : 'Pick up right where your fingers left off.'}</h2>
          <TypingDemo />
          <ul className="perks">
            <li><History size="1em" />Every result saved to your account</li>
            <li><Crown size="1em" />Your best 15 and 60 second runs on the leaderboard</li>
            <li><Target size="1em" />Weak keys found and turned into practice</li>
            <li><ShieldCheck size="1em" />Stay signed in for 7 days</li>
          </ul>
        </aside>
        <div className="auth-main">
          <h1>{reg ? 'Create your account' : 'Welcome back'}</h1>
          <p className="sub">{reg ? 'Free, and takes less than a minute.' : 'Log in to save results and climb the leaderboard.'}</p>
          <GoogleButton clientId={auth.googleClientId} text={reg ? 'signup_with' : 'continue_with'} onCredential={onGoogle} onError={t => fail(t)} />
          <div className="divider">or use email</div>
          <form onSubmit={submit} noValidate>
            {msg && <p className={`form-msg${msg.info ? ' info' : ''}`} role="alert">{msg.text}</p>}
            {reg && (
              <div className="field">
                <label htmlFor="rUser">Username</label>
                <input id="rUser" ref={firstRef} autoComplete="username" maxLength={16} placeholder="swiftkeys" value={f.username} onChange={e => set('username')(e.target.value)} className={invalid === 'username' ? 'invalid' : ''} />
                <span className="hint" style={userHint ? { color: userHint.ok ? 'var(--accent)' : 'var(--error)' } : undefined}>{userHint ? userHint.text : '3 to 16 letters, numbers or underscores. Shown on the leaderboard.'}</span>
              </div>
            )}
            <div className="field">
              <label htmlFor="aEmail">Email</label>
              <input id="aEmail" ref={reg ? undefined : firstRef} type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={e => set('email')(e.target.value)} className={invalid === 'email' ? 'invalid' : ''} />
            </div>
            <PasswordField id="aPass" label="Password" value={f.password} onChange={set('password')} autoComplete={reg ? 'new-password' : 'current-password'} placeholder={reg ? 'At least 8 characters' : 'Your password'} invalid={invalid === 'password'} capsOn={capsOn} />
            {reg && (
              <>
                <div className="strength" data-s={score}><i /><i /><i /><i /></div>
                <p className="hint" style={{ fontSize: '.78rem', color: 'var(--sub)', margin: '.3rem 0 .9rem' }}>{f.password ? PW_LABELS[score] : 'Use 12 or more characters with a mix of letters, numbers and symbols.'}</p>
                <PasswordField id="aPass2" label="Confirm password" value={f.password2} onChange={set('password2')} autoComplete="new-password" placeholder="Type it again" invalid={invalid === 'password2'} capsOn={capsOn} />
              </>
            )}
            <div className="row-between">
              <label className="check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>Keep me signed in for 7 days</span></label>
            </div>
            <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Please wait...' : reg ? 'Create account' : 'Log in'}</button>
          </form>
          <p className="switch">{reg ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New to TypeFlow? <Link to="/register">Create an account</Link></>}</p>
        </div>
      </div>
    </div>
  );
}
