import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosRequestHeaders,
  InternalAxiosRequestConfig,
} from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

type AuthTokenGetter = () => Promise<string | null>;
let authTokenGetter: AuthTokenGetter | null = null;
export function setAuthTokenGetter(getter: AuthTokenGetter | null) {
  authTokenGetter = getter;
}

async function attachBearerToken(config: InternalAxiosRequestConfig) {
  if (!authTokenGetter) {
    return;
  }

  if (config.headers?.Authorization) {
    return;
  }

  const token = await authTokenGetter();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
}

api.interceptors.request.use(
  async (config) => {
    config.headers = config.headers ?? ({} as AxiosRequestHeaders);

    await attachBearerToken(config);

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
