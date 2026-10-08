import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import CadenceLogo from './CadenceLogo.jsx';

/**
 * Centered Framer Motion authentication animation overlay.
 * Displays during Login, Register, Google Sign-in, and GitHub Sign-in.
 */
export default function AuthLoadingModal({
  isOpen,
  mode = 'login', // 'login' | 'register' | 'google' | 'github'
  isSuccess = false,
  username = ''
}) {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      return;
    }
    // Progression of status messages for smooth psychological pacing
    const t1 = setTimeout(() => setStep(2), 700);
    return () => clearTimeout(t1);
  }, [isOpen]);

  const getStatus = () => {
    if (isSuccess) {
      if (mode === 'register') {
        return {
          title: username ? `Welcome, ${username}!` : 'Account Created!',
          sub: 'Your Cadence profile is ready. Launching...',
          badge: 'Account Activated'
        };
      }
      return {
        title: username ? `Welcome back, ${username}!` : 'Session Activated!',
        sub: 'Loading your preferences and stats...',
        badge: 'Session Ready'
      };
    }

    if (mode === 'register') {
      if (step === 1) {
        return {
          title: 'Creating your account...',
          sub: 'Setting up your unique typing profile and stats',
          badge: 'Step 1 of 2'
        };
      }
      return {
        title: 'Activating your profile...',
        sub: 'Configuring leaderboards, themes and personal bests',
        badge: 'Activating'
      };
    }

    if (mode === 'google') {
      if (step === 1) {
        return {
          title: 'Connecting with Google...',
          sub: 'Verifying Google Identity credential',
          badge: 'Authenticating'
        };
      }
      return {
        title: 'Activating session...',
        sub: 'Preparing your synced settings',
        badge: 'Activating'
      };
    }

    if (mode === 'github') {
      if (step === 1) {
        return {
          title: 'Connecting with GitHub...',
          sub: 'Redirecting to GitHub OAuth authorization',
          badge: 'Redirecting'
        };
      }
      return {
        title: 'Activating your account...',
        sub: 'Securing your 7-day session',
        badge: 'Activating'
      };
    }

    // Default: 'login'
    if (step === 1) {
      return {
        title: 'Verifying credentials...',
        sub: 'Checking your email and password securely',
        badge: 'Authenticating'
      };
    }
    return {
      title: 'Activating session...',
      sub: 'Syncing your test history and Weak Keys',
      badge: 'Activating'
    };
  };

  const status = getStatus();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="auth-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'grid',
            placeItems: 'center',
            backgroundColor: 'rgba(10, 16, 28, 0.75)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            padding: '1.5rem'
          }}
        >
          <motion.div
            className="auth-modal-card"
            initial={{ scale: 0.82, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: -16 }}
            transition={{
              type: 'spring',
              stiffness: 340,
              damping: 26
            }}
            style={{
              position: 'relative',
              width: 'min(420px, 92vw)',
              borderRadius: '24px',
              padding: '2.5rem 2rem 2rem',
              background: 'var(--glass-strong)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35), 0 0 40px var(--accent-soft)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              overflow: 'hidden'
            }}
          >
            {/* Ambient background glow */}
            <motion.div
              aria-hidden="true"
              animate={{
                scale: [1, 1.25, 1],
                opacity: [0.35, 0.65, 0.35]
              }}
              transition={{
                repeat: Infinity,
                duration: 2.4,
                ease: 'easeInOut'
              }}
              style={{
                position: 'absolute',
                top: '15%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '180px',
                height: '180px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
                filter: 'blur(32px)',
                pointerEvents: 'none',
                zIndex: 0
              }}
            />

            {/* Badge pill */}
            <motion.div
              key={status.badge}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                position: 'relative',
                zIndex: 1,
                fontSize: '0.72rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                padding: '0.3rem 0.8rem',
                borderRadius: '999px',
                background: 'var(--accent-soft)',
                border: '1px solid var(--hairline)',
                marginBottom: '1.4rem'
              }}
            >
              {status.badge}
            </motion.div>

            {/* Animated Cadence Logo in the center */}
            <div style={{ position: 'relative', zIndex: 1, margin: '0.5rem 0 1.6rem' }}>
              <AnimatePresence mode="wait">
                {isSuccess ? (
                  <motion.div
                    key="success"
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    style={{
                      width: '74px',
                      height: '74px',
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--accent-ink)',
                      boxShadow: '0 0 28px var(--caret-glow)'
                    }}
                  >
                    <Check size={40} strokeWidth={3} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="logo"
                    initial={{ scale: 0.85 }}
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                  >
                    <CadenceLogo size={76} spinRing={true} showGlow={true} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Title & subtitle */}
            <div style={{ position: 'relative', zIndex: 1, minHeight: '68px' }}>
              <motion.h3
                key={status.title}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--text)'
                }}
              >
                {status.title}
              </motion.h3>

              <motion.p
                key={status.sub}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                style={{
                  margin: '0.45rem 0 0',
                  fontSize: '0.86rem',
                  color: 'var(--sub)',
                  lineHeight: 1.45
                }}
              >
                {status.sub}
              </motion.p>
            </div>

            {/* Glowing progress line */}
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                width: '100%',
                maxWidth: '220px',
                height: '4px',
                borderRadius: '999px',
                background: 'var(--field)',
                overflow: 'hidden',
                marginTop: '1.6rem'
              }}
            >
              <motion.div
                animate={
                  isSuccess
                    ? { width: '100%', x: '0%' }
                    : {
                        x: ['-100%', '100%']
                      }
                }
                transition={
                  isSuccess
                    ? { duration: 0.3 }
                    : {
                        repeat: Infinity,
                        duration: 1.3,
                        ease: 'easeInOut'
                      }
                }
                style={{
                  width: '50%',
                  height: '100%',
                  borderRadius: '999px',
                  background: 'var(--accent)',
                  boxShadow: '0 0 10px var(--accent)'
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
