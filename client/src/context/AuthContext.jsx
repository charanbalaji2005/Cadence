import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { importGuest } from '../lib/store.js';

const AuthCtx = createContext(null);

const isLocalhostEnv = () => {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname || '';
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '') return true;
  const apiUrl = (import.meta.env.VITE_API_URL || '').toLowerCase();
  if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) return true;
  return false;
};

export function AuthProvider({ children }) {

  const [state, setState] = useState({
    user: null,
    session: null,
    serverSettings: null,
    googleClientId: null,
    githubClientId: null,
    ready: false,
    offline: false,
    needsOnboarding: false,
    suggestedUsername: ''
  });

  const [maintenance, setMaintenance] = useState({
    maintenanceMode: false,
    maintenanceStart: '',
    maintenanceEnd: '',
    maintenanceMessage: ''
  });

  const checkMaintenance = useCallback(async () => {
    try {
      const m = await api('/maintenance');
      if (m) setMaintenance(m);
    } catch {
      // offline or silent error
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const d = await api('/auth/me');
      if (d?.maintenance) {
        setMaintenance(d.maintenance);
      }
      const params = new URLSearchParams(window.location.search);
      const urlOnboard = params.get('onboard') === 'true';
      const urlSuggested = params.get('suggested') || '';

      const userNeedsOnboard = urlOnboard || d.needsOnboarding || (d.user && d.user.profileCompleted === false);

      setState({
        user: d.user,
        session: d.session,
        serverSettings: d.settings,
        googleClientId: d.googleClientId,
        githubClientId: d.githubClientId,
        ready: true,
        offline: false,
        needsOnboarding: !!userNeedsOnboard,
        suggestedUsername: urlSuggested || (d.user ? d.user.username : '')
      });
    } catch {
      setState(s => ({ ...s, ready: true, offline: true }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) checkMaintenance();
    }, 30000);
    return () => clearInterval(timer);
  }, [checkMaintenance]);

  const afterAuth = useCallback(async d => {
    let imported = 0;
    try { imported = await importGuest(); } catch { /* guest results stay local and can be imported next time */ }
    const needsOnboard = !!(d.needsOnboarding || (d.user && d.user.profileCompleted === false));
    setState(s => ({
      ...s,
      user: d.user,
      session: d.session,
      serverSettings: d.settings,
      offline: false,
      needsOnboarding: needsOnboard,
      suggestedUsername: d.suggestedUsername || (d.user ? d.user.username : '')
    }));
    return { ...d, imported };
  }, []);

  const completeProfile = useCallback(async ({ username }) => {
    const res = await api('/users/me/profile', {
      method: 'PATCH',
      body: { username }
    });
    if (res?.user) {
      setState(s => ({
        ...s,
        user: res.user,
        needsOnboarding: false,
        suggestedUsername: ''
      }));
      // Remove onboard query param from URL if present
      const url = new URL(window.location.href);
      if (url.searchParams.has('onboard') || url.searchParams.has('suggested')) {
        url.searchParams.delete('onboard');
        url.searchParams.delete('suggested');
        window.history.replaceState({}, '', url.pathname + (url.search || ''));
      }
    }
    return res;
  }, []);

  const value = useMemo(() => ({
    ...state,
    maintenance,
    checkMaintenance,
    refresh,
    wake: async (from = 'client') => {
      // Use wake-up engine only when deployed (e.g. on Render), not on localhost
      if (isLocalhostEnv()) return null;
      try {
        return await api(`/wake?from=${encodeURIComponent(from)}`);
      } catch {
        return null;
      }
    },
    login: async ({ email, password, remember }) => afterAuth(await api('/auth/login', { method: 'POST', body: { email, password, remember } })),
    register: async ({ username, email, password, remember }) => afterAuth(await api('/auth/register', { method: 'POST', body: { username, email, password, remember } })),
    google: async (credential, remember) => afterAuth(await api('/auth/google', { method: 'POST', body: { credential, remember } })),
    logout: async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch (err) {
        console.warn('Logout endpoint notice (proceeding with local signout):', err);
      } finally {
        setState(s => ({ ...s, user: null, session: null, serverSettings: null, needsOnboarding: false }));
      }
    },
    logoutAll: async () => {
      try {
        await api('/auth/logout-all', { method: 'POST' });
      } catch (err) {
        console.warn('Logout-all endpoint notice (proceeding with local signout):', err);
      } finally {
        setState(s => ({ ...s, user: null, session: null, serverSettings: null, needsOnboarding: false }));
      }
    },
    usernameAvailable: async username => api(`/users/username/check?username=${encodeURIComponent(username)}`),
    completeProfile,
    closeOnboarding: () => setState(s => ({ ...s, needsOnboarding: false })),
    openOnboarding: (suggested = '') => setState(s => ({ ...s, needsOnboarding: true, suggestedUsername: suggested })),
    updateUsername: async username => {
      const d = await api('/me', { method: 'PATCH', body: { username } });
      setState(s => ({ ...s, user: d.user }));
      return d.user;
    },
    deleteAccount: async () => {
      await api('/me', { method: 'DELETE' });
      setState(s => ({ ...s, user: null, session: null, serverSettings: null, needsOnboarding: false }));
    }
  }), [state, maintenance, checkMaintenance, refresh, afterAuth, completeProfile]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
