// Thin client for the HRZ backend. Same-origin by default (Vite proxies /api in development);
// set VITE_API_BASE at build time if the API is hosted on another origin.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export interface ApiError { ok: false; error: string; fields?: Record<string, string> }

export async function postJSON<T>(path: string, body: unknown, timeoutMs = 30000): Promise<T | ApiError> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    let data: any = null;
    try { data = await r.json(); } catch { /* non-JSON (e.g. proxy error page) */ }
    if (!r.ok || !data || data.ok !== true) {
      return { ok: false, error: data?.error ?? (r.status === 404 || r.status >= 500 ? 'The service is not reachable right now.' : `Request failed (${r.status}).`), fields: data?.fields };
    }
    return data as T;
  } catch (e) {
    return { ok: false, error: (e as Error).name === 'AbortError' ? 'The request timed out. Please try again.' : 'Network error — the service is not reachable.' };
  } finally {
    clearTimeout(t);
  }
}
