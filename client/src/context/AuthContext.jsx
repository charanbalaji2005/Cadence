import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { importGuest } from '../lib/store.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, session: null, serverSettings: null, googleClientId: null, githubClientId: null, ready: false, offline: false });

  const refresh = useCallback(async () => {
    try {
      const d = await api('/auth/me');
      setState({ user: d.user, session: d.session, serverSettings: d.settings, googleClientId: d.googleClientId, githubClientId: d.githubClientId, ready: true, offline: false });
    } catch {
      setState(s => ({ ...s, ready: true, offline: true }));
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const afterAuth = useCallback(async d => {
    let imported = 0;
    try { imported = await importGuest(); } catch { /* guest results stay local and can be imported next time */ }
    setState(s => ({ ...s, user: d.user, session: d.session, serverSettings: d.settings, offline: false }));
    return { ...d, imported };
  }, []);

  const value = useMemo(() => ({
    ...state,
    refresh,
    login: async ({ email, password, remember }) => afterAuth(await api('/auth/login', { method: 'POST', body: { email, password, remember } })),
    register: async ({ username, email, password, remember }) => afterAuth(await api('/auth/register', { method: 'POST', body: { username, email, password, remember } })),
    google: async (credential, remember) => afterAuth(await api('/auth/google', { method: 'POST', body: { credential, remember } })),
    logout: async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { setState(s => ({ ...s, user: null, session: null, serverSettings: null })); } },
    logoutAll: async () => { await api('/auth/logout-all', { method: 'POST' }); setState(s => ({ ...s, user: null, session: null, serverSettings: null })); },
    usernameAvailable: async username => api(`/auth/username-available?username=${encodeURIComponent(username)}`),
    updateUsername: async username => { const d = await api('/me', { method: 'PATCH', body: { username } }); setState(s => ({ ...s, user: d.user })); return d.user; },
    deleteAccount: async () => { await api('/me', { method: 'DELETE' }); setState(s => ({ ...s, user: null, session: null, serverSettings: null })); }
  }), [state, refresh, afterAuth]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
