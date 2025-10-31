import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosRequestHeaders,
  InternalAxiosRequestConfig,
} from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1';
const CSRF_HEADER = (import.meta.env.VITE_CSRF_HEADER as string) || 'X-CSRF-Token';
const CSRF_ENDPOINT = import.meta.env.VITE_CSRF_ENDPOINT ?? '/auth/csrf';

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

let csrfTokenInMemory: string | null = null;
let pendingCsrfPromise: Promise<string> | null = null;

// App hook for 401 handling (e.g., redirect/login modal)
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(handler: () => void) {
  onUnauthorized = handler;
}

// Allow manual prefetch/clear if you want to control lifecycle explicitly
export async function prefetchCsrf(): Promise<string> {
  csrfTokenInMemory = await fetchCsrfFromEndpoint(api);
  return csrfTokenInMemory;
}
export function clearCsrf(): void {
  csrfTokenInMemory = null;
}

/** Fetch CSRF token from endpoint and keep only in memory */
async function fetchCsrfFromEndpoint(client: AxiosInstance) {
  if (!pendingCsrfPromise) {
    pendingCsrfPromise = client
      .get(CSRF_ENDPOINT, { withCredentials: true })
      .then((res) => String(res.data?.token || ''))
      .finally(() => {
        pendingCsrfPromise = null;
      });
  }
  return pendingCsrfPromise;
}

/** Ensure CSRF header for mutating requests */
async function ensureCsrfHeader(config: InternalAxiosRequestConfig, client: AxiosInstance) {
  const method = (config.method || 'get').toLowerCase();
  if (!MUTATING_METHODS.has(method)) {
    return;
  }

  // If header present, trust caller
  if (config.headers?.[CSRF_HEADER] != null) {
    return;
  }

  // Fetch token from endpoint if not in memory
  if (!csrfTokenInMemory) {
    csrfTokenInMemory = await fetchCsrfFromEndpoint(client);
  }

  if (csrfTokenInMemory) {
    config.headers[CSRF_HEADER] = csrfTokenInMemory;
  }
}

api.interceptors.request.use(
  async (config) => {
    config.headers = config.headers ?? ({} as AxiosRequestHeaders);

    // Add CSRF to unsafe methods
    await ensureCsrfHeader(config, api);

    // Optional: add a client-side request id to help correlate logs
    return config;
  },
  (error) => Promise.reject(error),
);

export interface HttpError {
  status?: number;
  url?: string;
  method?: string;
  message: string;
  details?: unknown;
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const status = err.response?.status;

    // Expired/invalid session -> let app react (e.g. navigate to /login)
    if (status === 401) {
      clearCsrf();
      if (onUnauthorized) {
        onUnauthorized();
      }
    }

    // Potential CSRF mismatch. Attempt a one-time refresh+retry
    const canRetryCsrf =
      (status === 419 || status === 403) &&
      !!CSRF_ENDPOINT &&
      !!err.config &&
      !(err.config as { _retried?: boolean })._retried;
    if (canRetryCsrf) {
      try {
        await fetchCsrfFromEndpoint(api);
        const retryCfg = {
          ...(err.config as AxiosRequestConfig),
          _retried: true,
        } as AxiosRequestConfig & { _retried?: boolean };

        // Ensure header for the retried request
        if (!retryCfg.headers) {
          retryCfg.headers = {};
        }
        retryCfg.headers[CSRF_HEADER] = csrfTokenInMemory;

        return api.request(retryCfg);
      } catch {
        /** no op */
      }
    }

    const normalized: HttpError = {
      status,
      url: err.config?.url,
      method: err.config?.method?.toUpperCase(),
      message:
        (err.response?.data as { message?: string })?.message ||
        err.message ||
        'Network or server error',
      details: err.response?.data,
    };

    return Promise.reject(normalized);
  },
);

/** --- Small typed helpers --- */
type Config = Omit<AxiosRequestConfig, 'url' | 'method' | 'data'>;

export async function getJSON<T>(url: string, config?: Config): Promise<T> {
  const res = await api.get<T>(url, config);
  return res.data;
}

export async function postJSON<TReq, TRes>(
  url: string,
  data?: TReq,
  config?: Config,
): Promise<TRes> {
  const res = await api.post<TRes>(url, data, config);
  return res.data;
}

export async function putJSON<TReq, TRes>(
  url: string,
  data?: TReq,
  config?: Config,
): Promise<TRes> {
  const res = await api.put<TRes>(url, data, config);
  return res.data;
}

export async function patchJSON<TReq, TRes>(
  url: string,
  data?: TReq,
  config?: Config,
): Promise<TRes> {
  const res = await api.patch<TRes>(url, data, config);
  return res.data;
}

export async function delJSON<TRes>(url: string, config?: Config): Promise<TRes> {
  const res = await api.delete<TRes>(url, config);
  return res.data;
}

export default api;
