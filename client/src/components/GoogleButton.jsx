import { useEffect, useRef } from 'react';

const GOOGLE_G = (
  <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
);

let gsiPromise = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = () => { gsiPromise = null; reject(new Error('load')); };
      document.head.appendChild(s);
    });
  }
  return gsiPromise;
}

/**
 * Google Identity Services button. Google returns an ID token ("credential")
 * which the server verifies before signing the person in.
 */
export default function GoogleButton({ clientId, onCredential, onError, text = 'continue_with' }) {
  const ref = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    loadGsi().then(() => {
      if (cancelled || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: res => cb.current(res.credential), ux_mode: 'popup', auto_select: false });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text, width: Math.min(400, ref.current.clientWidth || 360) });
    }).catch(() => onError?.('Google sign-in could not load. Check your connection or ad blocker.'));
    return () => { cancelled = true; };
  }, [clientId, text]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!clientId) {
    return (
      <button type="button" className="btn block google" onClick={() => onError?.('Google sign-in is not set up yet. Add GOOGLE_CLIENT_ID to the server .env file to switch it on.')}>
        {GOOGLE_G}<span>Continue with Google</span>
      </button>
    );
  }
  return <div className="gsi-wrap" ref={ref} />;
}
