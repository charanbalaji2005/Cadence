const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/** JSON fetch wrapper: sends the session cookie and the CSRF header, and turns errors into readable messages. */
export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  const trafficPass = typeof window !== 'undefined' ? sessionStorage.getItem('tf_traffic_pass') : null;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method, signal, credentials: 'include',
      headers: {
        'X-Requested-With': 'TypeFlow',
        ...(trafficPass ? { 'X-Cadence-Traffic-Pass': 'active' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError("Can't reach the TypeFlow server. Check your connection and try again.", 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    if (res.status === 429 && data?.queued && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cadence:traffic-queued', { detail: data }));
    }
    throw new ApiError(data?.error || data?.message || (res.status >= 500 ? 'The server had a problem. Try again.' : 'That request did not work.'), res.status);
  }
  return data;
}
