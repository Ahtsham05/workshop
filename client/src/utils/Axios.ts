import axios, { AxiosInstance, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { createTimeoutSignal } from '@/lib/api-timeout';
import { cacheAxiosGetResponse, shouldUseOfflineFallback, tryOfflineAxiosFallback } from '@/lib/sync/offline-http';
import { getElectronAPI, isElectronApp } from '@/lib/sync/electron';
import summery from './summery';
// Create the Axios instance
const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1';

const Axios: AxiosInstance = axios.create({
  baseURL: baseUrl,
  withCredentials: true,
});

// Function to get tokens
const getAccessToken = (): string | null => localStorage.getItem("accessToken");
const getRefreshToken = (): string | null => localStorage.getItem("refreshToken");

// Save tokens in localStorage
const saveTokens = (accessToken: string, refreshToken: string): void => {
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
};

// Remove tokens
const removeTokens = (): void => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
};

// Serialise concurrent refresh calls so only one runs at a time
let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (error: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  refreshQueue = [];
};

// Refresh token logic — uses raw axios (NOT the intercepted Axios instance)
// so the request interceptor cannot overwrite the Authorization header
const refreshTokens = async (): Promise<string> => {
  const refreshtoken = getRefreshToken();
  if (!refreshtoken) {
    removeTokens();
    window.location.href = '/sign-in';
    throw new Error("No refresh token available");
  }

  const response: AxiosResponse = await axios({
    ...summery.loginRefresh,
    baseURL: baseUrl,
    signal: createTimeoutSignal(),
    headers: {
      Authorization: `Bearer ${refreshtoken}`,
    },
  });

  const { accessToken, refreshToken } = response.data.data;
  saveTokens(accessToken, refreshToken);
  return accessToken;
};

// Custom AxiosRequestConfig interface
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Axios request interceptor to add Authorization token
Axios.interceptors.request.use(
  (config: CustomAxiosRequestConfig) => {
    config.signal = createTimeoutSignal(config.signal as AbortSignal | undefined);

    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers!.Authorization = `Bearer ${accessToken}`;
    }

    // Only send x-branch-id for users who have a branch selected AND are not
    // school-role users (teachers, parents, students).  School module users
    // are scoped to the organisation itself — they don't belong to a branch
    // and the backend will 403 if a stale branch ID from a previous admin
    // session is forwarded on their requests.
    const activeBranchId = localStorage.getItem('activeBranchId');
    if (activeBranchId) {
      try {
        const raw = localStorage.getItem('user');
        const user = raw ? JSON.parse(raw) : null;
        const schoolRole: string | null =
          user?.schoolRole || (user?.linkedTeacherId ? 'teacher' : null);
        // schoolAdmin has full access and may legitimately use a branch header;
        // all other school roles (teacher, parent, student) must not.
        const isRestrictedSchoolRole =
          schoolRole && schoolRole !== 'schoolAdmin';
        if (!isRestrictedSchoolRole) {
          config.headers!['x-branch-id'] = activeBranchId;
        }
      } catch {
        // If user JSON is corrupt, just skip the header — the request will
        // still go through and the backend will figure out the auth context.
      }
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Auth endpoints that may legitimately return 401 — never trigger token refresh
const AUTH_NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/logout',
  '/auth/refresh-tokens',
  '/auth/forgotpassword',
  '/auth/reset-password',
];

const isAuthNoRefreshRequest = (url?: string): boolean =>
  !!url && AUTH_NO_REFRESH_PATHS.some((path) => url.includes(path));

function buildAxiosRelativePath(config: { url?: string; baseURL?: string }): string {
  const base = config.baseURL || import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3000/v1';
  const path = config.url || '/';
  const full = path.startsWith('http') ? path : `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  try {
    const parsed = new URL(full);
    return `${parsed.pathname.replace(/^\/v1/, '')}${parsed.search}`;
  } catch {
    return path;
  }
}

// Axios response interceptor to handle 401 errors and refresh tokens
Axios.interceptors.response.use(
  async (response: AxiosResponse) => {
    if (isElectronApp()) {
      await cacheAxiosGetResponse({
        url: response.config.url,
        method: response.config.method,
        baseURL: response.config.baseURL,
        status: response.status,
        data: response.data,
      });

      const method = (response.config.method || 'get').toUpperCase();
      if (method === 'GET') {
        const electron = getElectronAPI();
        if (electron?.http?.mergeResponse) {
          try {
            response.data = await electron.http.mergeResponse({
              method,
              path: buildAxiosRelativePath(response.config),
              data: response.data,
            });
          } catch {
            // keep original payload
          }
        }
      }
    }
    return response;
  },
  async (error: AxiosError) => {
    const originRequest = error.config as CustomAxiosRequestConfig;

    // Never retry the refresh endpoint itself — prevents infinite loop
    const isRefreshUrl = originRequest?.url?.includes('/auth/login-refresh');
    const skipRefresh = isRefreshUrl || isAuthNoRefreshRequest(originRequest?.url);

    if (originRequest && error.response?.status === 401 && !originRequest._retry && !skipRefresh) {
      originRequest._retry = true;

      if (isRefreshing) {
        // Another refresh is already in flight — queue this request
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token) => {
              originRequest.headers!.Authorization = `Bearer ${token}`;
              resolve(Axios(originRequest));
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      try {
        const newAccessToken = await refreshTokens();
        processQueue(null, newAccessToken);
        originRequest.headers!.Authorization = `Bearer ${newAccessToken}`;
        return Axios(originRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return Promise.reject(refreshError);
        }
        removeTokens();
        window.location.href = '/sign-in';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (isElectronApp() && originRequest && shouldUseOfflineFallback(error)) {
      try {
        const offline = await tryOfflineAxiosFallback(originRequest);
        if (offline) {
          return {
            data: offline.data,
            status: offline.status,
            statusText: 'OK',
            headers: {},
            config: originRequest,
          } as AxiosResponse;
        }
      } catch {
        // fall through to original error
      }
    }

    return Promise.reject(error);
  }
);

export default Axios;
