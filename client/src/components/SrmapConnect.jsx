import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, X, Check, Loader2, RefreshCw, ShieldCheck, ShieldAlert, BadgeCheck, GraduationCap } from 'lucide-react';
import CadenceLogo from './CadenceLogo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useOverlay } from '../context/UIContext.jsx';
import { checkIdentifier, batchLabel, SRMAP_LOGO_SM, SRMAP_LOGO_LG } from '../lib/srmap.js';

const USER_RE = /^[a-z][a-z0-9_]{2,19}$/;
function usernameProblem(u) {
  if (!u) return '';
  if (u.length < 3 || u.length > 20) return 'Use 3 to 20 characters.';
  if (!/^[a-z]/.test(u)) return 'Start with a letter.';
  if (u.endsWith('_')) return 'Cannot end with an underscore.';
  if (u.includes('__')) return 'No double underscores.';
  if (!USER_RE.test(u)) return 'Use lowercase letters, numbers and underscores.';
  return '';
}

/** The "Connect SRM AP" button used on the sign-in page and in account settings. */
export function SrmapButton({ onClick, children = 'Connect SRM AP', className = '' }) {
  return (
    <button type="button" className={`btn block srmap-btn ${className}`} onClick={onClick}>
      <img src={SRMAP_LOGO_SM} alt="" width="22" height="22" aria-hidden="true" />
      <span>{children}</span>
    </button>
  );
}

function Lockup() {
  return (
    <div className="srm-lockup" aria-hidden="true">
      <CadenceLogo size={40} animated={false} />
      <span className="srm-lockup-x">×</span>
      <img src={SRMAP_LOGO_LG} alt="" width="52" height="52" />
    </div>
  );
}

/**
 * Connect SRM AP flow. intent="login" signs in or starts sign-up; intent="link" connects the
 * signed-in account. Credentials go to the Cadence server only, which asks SRM AP to verify them.
 */
export default function SrmapModal({ open, intent = 'login', remember = true, onClose, onDone }) {
  const auth = useAuth();
  const reduce = useReducedMotion();
  const id = useId();
  const [cfg, setCfg] = useState(null);
  const [cfgError, setCfgError] = useState('');
  const [step, setStep] = useState('credentials');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [fieldErr, setFieldErr] = useState(null);
  const [onb, setOnb] = useState(null);
  const [round, setRound] = useState(0);
  const [username, setUsername] = useState('');
  const [avail, setAvail] = useState({ state: 'idle', text: '' });
  const [consent, setConsent] = useState(false);
  const firstRef = useRef(null);
  const userRef = useRef(null);

  const close = useCallback(() => {
    if (busy) return;
    if (step === 'username') auth.srmapCancel();
    onClose();
  }, [busy, step, auth, onClose]);
  useOverlay(`srmap-${id}`, open, close);

  // Fresh state each time it opens; the password never outlives the modal.
  useEffect(() => {
    if (!open) return undefined;
    setStep('credentials'); setPassword(''); setShow(false); setMsg(null); setFieldErr(null); setOnb(null); setUsername(''); setConsent(false); setRound(0);
    setCfg(null); setCfgError('');
    let live = true;
    auth.srmapConfig().then(c => { if (live) setCfg(c); }).catch(err => { if (live) setCfgError(err.message || "Couldn't reach Cadence. Check your connection."); });
    const t = setTimeout(() => firstRef.current?.focus(), 80);
    return () => { live = false; clearTimeout(t); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (step === 'username') setTimeout(() => userRef.current?.focus(), 80); }, [step]);

  // Username availability, debounced. The server checks again (and the unique index decides) on submit.
  useEffect(() => {
    if (step !== 'username') return undefined;
    const u = username.trim().toLowerCase();
    if (!u) { setAvail({ state: 'idle', text: '' }); return undefined; }
    const problem = usernameProblem(u);
    if (problem) { setAvail({ state: 'invalid', text: problem }); return undefined; }
    setAvail({ state: 'checking', text: 'Checking availability…' });
    const t = setTimeout(async () => {
      try {
        const r = await auth.usernameAvailable(u);
        setAvail(r.available ? { state: 'available', text: 'Available' } : { state: 'taken', text: r.reason || 'Already taken' });
      } catch { setAvail({ state: 'unknown', text: "Couldn't check right now. We'll check when you confirm." }); }
    }, 350);
    return () => clearTimeout(t);
  }, [username, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = cfg?.enabled && cfg?.ready;
  const domains = cfg?.emailDomains || ['srmap.edu.in'];
  const idCheck = identifier.trim() ? checkIdentifier(identifier, domains) : null;

  const submitCredentials = async e => {
    e.preventDefault();
    if (!ready || busy) return;
    setMsg(null); setFieldErr(null);
    const c = checkIdentifier(identifier, domains);
    if (!c.ok) { setMsg({ text: c.error }); setFieldErr('identifier'); return; }
    if (!password) { setMsg({ text: 'Enter your SRM AP password.' }); setFieldErr('password'); return; }
    setBusy(true);
    try {
      if (intent === 'link' && !consent) { setMsg({ text: 'Tick the box to let Cadence keep your verified SRM AP details.' }); return; }
      const d = await auth.srmapVerify({ identifier: c.value, password, remember, intent, consent: intent === 'link' ? consent : undefined });
      setPassword('');
      if (d.pending) {
        setOnb({ profile: d.profile, suggestions: d.suggestions || [] });
        setUsername(d.suggestions?.[0] || '');
        setStep('username');
      } else {
        onDone(d);
      }
    } catch (err) {
      setMsg({ text: err.message });
      if (err.status === 400) setFieldErr('identifier');
      if (err.status === 401) setFieldErr('password');
    } finally { setBusy(false); }
  };

  const regenerate = async () => {
    const next = round + 1;
    setRound(next);
    try {
      const d = await auth.srmapOnboarding(next);
      setOnb(o => ({ ...o, suggestions: d.suggestions || [] }));
    } catch (err) {
      if (err.status === 410) { setStep('credentials'); setMsg({ text: err.message }); } else setMsg({ text: err.message });
    }
  };

  const submitUsername = async e => {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    if (busy || usernameProblem(u) || !u || avail.state === 'taken') return;
    if (!consent) { setMsg({ text: 'Tick the box to let Cadence keep your verified SRM AP details.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const d = await auth.srmapComplete({ username: u });
      onDone({ ...d, created: true });
    } catch (err) {
      if (err.status === 410) { setStep('credentials'); setMsg({ text: err.message }); }
      else { setMsg({ text: err.message }); if (err.status === 409) setAvail({ state: 'taken', text: err.message }); }
    } finally { setBusy(false); }
  };

  const p = onb?.profile;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="srm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <motion.div className="srm-card" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            <button type="button" className="icon-btn srm-close" aria-label="Close" onClick={close} disabled={busy}><X size="1em" /></button>
            <Lockup />

            {step === 'credentials' ? (
              <>
                <h2 id={`${id}-t`} className="srm-title">{intent === 'link' ? 'Connect your SRM AP identity' : 'Continue with Connect SRM AP'}</h2>
                <p id={`${id}-d`} className="srm-sub">
                  {intent === 'link'
                    ? 'Verify with SRM AP to add the Connect SRM AP badge and branding to this account.'
                    : 'Sign in or register with your SRM AP student identity. Your password is checked by SRM AP and never stored by Cadence.'}
                </p>

                {cfgError && <p className="form-msg" role="alert">{cfgError}</p>}
                {cfg && !ready && (
                  <div className="srm-config-error" role="alert">
                    <ShieldAlert size="1.1em" aria-hidden="true" />
                    <div><strong>Not available yet</strong><p>{cfg.message}</p></div>
                  </div>
                )}
                {!cfg && !cfgError && <div className="srm-loading" role="status"><Loader2 size="1em" className="srm-spin" />Checking SRM AP availability…</div>}

                <form onSubmit={submitCredentials} noValidate aria-busy={busy}>
                  {msg && <p className="form-msg" role="alert">{msg.text}</p>}
                  <fieldset disabled={!ready || busy} className="srm-fields">
                    <div className="field">
                      <label htmlFor={`${id}-id`}>Register number or institutional email</label>
                      <input id={`${id}-id`} ref={firstRef} autoComplete="username" spellCheck={false} autoCapitalize="characters" inputMode="email"
                        placeholder={`APXXXXXXXXXXX or you@${domains[0]}`} value={identifier} maxLength={254}
                        onChange={e => setIdentifier(e.target.value)} className={fieldErr === 'identifier' ? 'invalid' : ''}
                        aria-invalid={fieldErr === 'identifier'} aria-describedby={`${id}-idh`} />
                      <span id={`${id}-idh`} className={`hint${idCheck && !idCheck.ok ? ' srm-hint-err' : ''}`}>
                        {idCheck ? (idCheck.ok ? (idCheck.kind === 'email' ? 'Institutional email' : 'Register number') : idCheck.error) : 'Your batch is confirmed by SRM AP after verification.'}
                      </span>
                    </div>
                    {cfg?.passwordRequired !== false && (
                      <div className="field">
                        <label htmlFor={`${id}-pw`}>SRM AP password</label>
                        <div className="input-wrap">
                          <input id={`${id}-pw`} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} maxLength={256}
                            onChange={e => setPassword(e.target.value)} className={fieldErr === 'password' ? 'invalid' : ''} aria-invalid={fieldErr === 'password'} />
                          <button type="button" className="icon-btn reveal" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(s => !s)}>{show ? <EyeOff size="1em" /> : <Eye size="1em" />}</button>
                        </div>
                      </div>
                    )}
                  </fieldset>
                  <button type="submit" className="btn primary block srm-submit" disabled={!ready || busy}>
                    {busy ? <><Loader2 size="1em" className="srm-spin" />Verifying with SRM AP…</> : intent === 'link' ? 'Verify and connect' : 'Verify and continue'}
                  </button>
                  {intent === 'link' && (
                    <label className="check srm-consent">
                      <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={!ready || busy} />
                      <span>Connect my SRM AP identity and keep my verified name, institutional email, batch, class, section, gender and photo with this account.</span>
                    </label>
                  )}
                  <p className="srm-fine"><ShieldCheck size="1em" aria-hidden="true" />Your SRM AP password is checked by SRM AP and never stored. Cadence keeps only your verified name, institutional email, batch, class, section, gender and photo.</p>
                </form>
              </>
            ) : (
              <>
                <h2 id={`${id}-t`} className="srm-title">Choose your Cadence username</h2>
                <p id={`${id}-d`} className="srm-sub">You're verified. Pick how you'll appear on leaderboards and in races.</p>

                <div className="srm-verified">
                  {p?.profilePhoto
                    ? <img src={p.profilePhoto} alt="" width="42" height="42" referrerPolicy="no-referrer" style={{ borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                    : <BadgeCheck size="1.4em" aria-hidden="true" />}
                  <div>
                    <strong>{p?.displayName || 'SRM AP student'}</strong>
                    <small>{[p?.registerNumberMasked, p?.email].filter(Boolean).join(' · ')}</small>
                  </div>
                  {p?.batchYear
                    ? <span className="srm-batch"><GraduationCap size="1em" aria-hidden="true" />{batchLabel(p.batchYear)}</span>
                    : <span className="srm-batch muted">Batch not confirmed</span>}
                </div>

                <form onSubmit={submitUsername} noValidate aria-busy={busy}>
                  {msg && <p className="form-msg" role="alert">{msg.text}</p>}
                  <div className="field">
                    <label htmlFor={`${id}-u`}>Username</label>
                    <div className="input-wrap">
                      <input id={`${id}-u`} ref={userRef} autoComplete="off" spellCheck={false} maxLength={20} value={username}
                        onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        className={avail.state === 'taken' || avail.state === 'invalid' ? 'invalid' : ''} aria-describedby={`${id}-uh`}
                        aria-invalid={avail.state === 'taken' || avail.state === 'invalid'} />
                      <span className="srm-avail-icon" aria-hidden="true">
                        {avail.state === 'checking' && <Loader2 size="1em" className="srm-spin" />}
                        {avail.state === 'available' && <Check size="1em" className="ok" />}
                        {(avail.state === 'taken' || avail.state === 'invalid') && <X size="1em" className="bad" />}
                      </span>
                    </div>
                    <span id={`${id}-uh`} className={`hint srm-avail ${avail.state}`} aria-live="polite">{avail.text || '3 to 20 lowercase letters, numbers or underscores.'}</span>
                  </div>

                  <div className="srm-suggest">
                    <div className="srm-suggest-head">
                      <span>Suggestions</span>
                      <button type="button" className="btn ghost sm" onClick={regenerate} disabled={busy}><RefreshCw size="1em" />New ideas</button>
                    </div>
                    <div className="srm-chips" role="group" aria-label="Suggested usernames">
                      {(onb?.suggestions || []).map(s => (
                        <button type="button" key={s} className="chip" aria-pressed={username === s} onClick={() => setUsername(s)}>{s}</button>
                      ))}
                      {!onb?.suggestions?.length && <span className="hint">No suggestions right now. Type your own.</span>}
                    </div>
                  </div>

                  <label className="check srm-consent">
                    <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                    <span>Create my Cadence account and keep my verified name, institutional email, batch, class, section, gender and photo from SRM AP with it.</span>
                  </label>

                  <button type="submit" className="btn primary block srm-submit" disabled={busy || !username || !!usernameProblem(username) || avail.state === 'taken' || !consent}>
                    {busy ? <><Loader2 size="1em" className="srm-spin" />Creating your account…</> : 'Confirm username'}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
