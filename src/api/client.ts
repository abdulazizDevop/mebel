/* Centralised HTTP client for the Mebel backend.
 *
 * - Reads base URL from VITE_API_URL (.env.local)
 * - Manages two token slots: admin (`mebel_admin_jwt`) and customer (`mebel_customer_jwt`)
 * - `tokenSlot` lets a call pick which one to send (or `null` for guest calls)
 * - Throws `ApiError` on non-2xx so callers can branch on status / message
 */

const RAW_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export const API_BASE_URL = RAW_BASE;

export type TokenSlot = 'admin' | 'customer' | null;

const STORAGE_KEYS = {
  admin: 'mebel_admin_jwt',
  customer: 'mebel_customer_jwt',
} as const;

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export const tokenStore = {
  get(slot: 'admin' | 'customer'): string | null {
    try { return localStorage.getItem(STORAGE_KEYS[slot]); } catch { return null; }
  },
  set(slot: 'admin' | 'customer', token: string): void {
    try { localStorage.setItem(STORAGE_KEYS[slot], token); } catch {}
  },
  clear(slot: 'admin' | 'customer'): void {
    try { localStorage.removeItem(STORAGE_KEYS[slot]); } catch {}
  },
  clearAll(): void {
    this.clear('admin');
    this.clear('customer');
  },
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** form-encoded body for OAuth2 password endpoints */
  form?: Record<string, string>;
  tokenSlot?: TokenSlot;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, tokenSlot = null, signal } = opts;

  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;

  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  if (tokenSlot) {
    const token = tokenStore.get(tokenSlot);
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: payload, signal });
  } catch (e) {
    throw new ApiError('Network error — is the API running?', 0, e);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') || '';
  const data: unknown = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail;
    const msg = typeof detail === 'string' ? detail : `Request failed with ${res.status}`;
    if (res.status === 401 && tokenSlot) tokenStore.clear(tokenSlot);
    throw new ApiError(msg, res.status, data);
  }

  return data as T;
}

export const api = {
  get<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body' | 'form'>) {
    return request<T>(path, { ...opts, method: 'GET' });
  },
  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(path, { ...opts, method: 'POST', body });
  },
  postForm<T>(path: string, form: Record<string, string>, opts?: Omit<RequestOptions, 'method' | 'body' | 'form'>) {
    return request<T>(path, { ...opts, method: 'POST', form });
  },
  patch<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(path, { ...opts, method: 'PATCH', body });
  },
  delete<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'form'>) {
    // DELETE accepts an optional body — used by `/push/subscriptions` to pass
    // the endpoint string when the JWT may already be gone (logout flow).
    return request<T>(path, { ...opts, method: 'DELETE' });
  },
};
