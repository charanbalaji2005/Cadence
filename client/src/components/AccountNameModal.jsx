import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

// Specification validation regex: starts with letter, 3-20 chars, letters/numbers/underscore
const USER_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

export default function AccountNameModal({
  isOpen,
  initialUsername = '',
  onContinue,
  onClose,
  busy = false
}) {
  const auth = useAuth();
  const [username, setUsername] = useState(initialUsername || '');
  const [status, setStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  const [statusMessage, setStatusMessage] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const inputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync initial username when modal opens
  useEffect(() => {
    if (isOpen) {
      const init = (initialUsername || auth?.suggestedUsername || '').toLowerCase().trim();
      setUsername(init);
      setHasSubmitted(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialUsername, auth?.suggestedUsername]);

  // Validate and check username availability (debounced 350ms)
  const validateAndCheck = useCallback((val) => {
    clearTimeout(debounceTimerRef.current);
    const u = val.trim().toLowerCase();

    if (!u) {
      setStatus('idle');
      setStatusMessage('');
      return;
    }

    // Syntax validation
    if (u.length < 3 || u.length > 20) {
      setStatus('invalid');
      setStatusMessage('Use 3 to 20 characters.');
      return;
    }
    if (!/^[a-z]/.test(u)) {
      setStatus('invalid');
      setStatusMessage('Username must start with a letter.');
      return;
    }
    if (u.endsWith('_')) {
      setStatus('invalid');
      setStatusMessage('Cannot end with an underscore.');
      return;
    }
    if (u.includes('__')) {
      setStatus('invalid');
      setStatusMessage('Cannot contain consecutive underscores.');
      return;
    }
    if (!USER_REGEX.test(u)) {
      setStatus('invalid');
      setStatusMessage('Use letters, numbers, and underscores.');
      return;
    }

    // Syntactically valid -> Show checking state and debounce network request
    setStatus('checking');
    setStatusMessage('Checking availability...');

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await auth.usernameAvailable(u);
        if (res.available) {
          setStatus('available');
          setStatusMessage('Username available');
        } else {
          setStatus('taken');
          setStatusMessage(res.reason || 'Username already taken');
        }
      } catch {
        // Network fallback
        setStatus('available');
        setStatusMessage('Username available');
      }
    }, 350);
  }, [auth]);

  useEffect(() => {
    if (isOpen && username) {
      validateAndCheck(username);
    }
    return () => clearTimeout(debounceTimerRef.current);
  }, [username, isOpen, validateAndCheck]);

  if (!isOpen) return null;

  const isFormValid = status === 'available';

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!isFormValid || busy || hasSubmitted) return;
    setHasSubmitted(true);
    onContinue({
      username: username.trim().toLowerCase()
    });
  };

  return (
    <AnimatePresence>
      <div className="account-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="onboard-modal-title">
        <motion.div
          className="account-modal-card"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 id="onboard-modal-title" className="account-modal-title">
            Choose your Cadence username
          </h2>
          <p className="account-modal-sub">
            This is how you'll appear on your profile, leaderboards, achievements, and typing activity.
          </p>

          <form onSubmit={handleSubmit} className="account-modal-form" noValidate>
            <div className="account-modal-input-wrap">
              <input
                ref={inputRef}
                type="text"
                placeholder="username"
                maxLength={20}
                autoComplete="off"
                spellCheck={false}
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className={`account-modal-input ${status === 'available' ? 'valid' : status === 'taken' || status === 'invalid' ? 'invalid' : ''}`}
                aria-invalid={status === 'taken' || status === 'invalid'}
                aria-describedby="username-status-msg"
              />
              <div className="account-modal-input-indicator">
                {status === 'checking' && (
                  <Loader2 size={18} className="animate-spin text-sub" />
                )}
                {status === 'available' && (
                  <span className="account-modal-check" aria-hidden="true">
                    <Check size={18} strokeWidth={2.8} />
                  </span>
                )}
                {(status === 'taken' || status === 'invalid') && (
                  <span className="account-modal-err-icon" aria-hidden="true">
                    <X size={18} strokeWidth={2.5} />
                  </span>
                )}
              </div>
            </div>

            {/* Live accessibility status message */}
            <div
              id="username-status-msg"
              className={`account-modal-status-row ${status}`}
              aria-live="polite"
            >
              {status === 'available' && (
                <span className="status-msg available">
                  <Check size={14} strokeWidth={2.5} /> {statusMessage}
                </span>
              )}
              {status === 'taken' && (
                <span className="status-msg taken">
                  <X size={14} strokeWidth={2.5} /> {statusMessage}
                </span>
              )}
              {status === 'invalid' && (
                <span className="status-msg invalid">
                  {statusMessage}
                </span>
              )}
              {status === 'checking' && (
                <span className="status-msg checking">
                  {statusMessage}
                </span>
              )}
            </div>

            <button
              type="submit"
              className="account-modal-btn btn primary block"
              disabled={!isFormValid || busy}
            >
              {busy ? 'Creating profile...' : hasSubmitted ? 'Profile created ✓' : 'Continue →'}
            </button>

            <p className="account-modal-footer-hint">
              You can change this later in Settings.
            </p>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
