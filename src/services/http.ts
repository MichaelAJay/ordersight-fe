import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosRequestHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import { requireAuthRecovery } from './authRecovery';

// const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1';
// Same-origin by default (works for localhost:8081 AND ngrok)
// If you ever want a separate API host, set VITE_API_ORIGIN to e.g. "https://api.example.com"
const API_ORIGIN = (import.meta.env?.['VITE_API_ORIGIN'] || '').replace(/\/+$/, '');
const API_BASE_URL = `${API_ORIGIN}/api/v1`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

type AuthTokenGetter = (options?: { skipCache?: boolean }) => Promise<string | null>;
let authTokenGetter: AuthTokenGetter | null = null;
export function setAuthTokenGetter(getter: AuthTokenGetter | null) {
  authTokenGetter = getter;
}

type AuthAwareConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
  _authHadToken?: boolean;
};

async function attachBearerToken(config: AuthAwareConfig, options?: { forceRefresh?: boolean }) {
  if (config.headers?.Authorization) {
    config._authHadToken = true;
    return;
  }

  if (!authTokenGetter) {
    return;
  }

  const token = await authTokenGetter(options?.forceRefresh ? { skipCache: true } : undefined);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config._authHadToken = true;
  }
}

api.interceptors.request.use(
  async (config) => {
    config.headers = config.headers ?? ({} as AxiosRequestHeaders);

    await attachBearerToken(config as AuthAwareConfig);

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
    const config = err.config as AuthAwareConfig | undefined;

    if (status === 401 && authTokenGetter && config && !config._authRetry) {
      let token: string | null = null;
      try {
        token = await authTokenGetter({ skipCache: true });
      } catch {
        token = null;
      }
      if (token) {
        config._authRetry = true;
        config.headers = config.headers ?? ({} as AxiosRequestHeaders);
        config.headers.Authorization = `Bearer ${token}`;
        config._authHadToken = true;
        return api.request(config);
      }
    }

    if (status === 401 && config?._authHadToken) {
      requireAuthRecovery();
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
