import axios, { AxiosInstance, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
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
    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers!.Authorization = `Bearer ${accessToken}`;
    }
    const activeBranchId = localStorage.getItem('activeBranchId');
    if (activeBranchId) {
      config.headers!['x-branch-id'] = activeBranchId;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Axios response interceptor to handle 401 errors and refresh tokens
Axios.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originRequest = error.config as CustomAxiosRequestConfig;

    // Never retry the refresh endpoint itself — prevents infinite loop
    const isRefreshUrl = originRequest?.url?.includes('/auth/login-refresh');

    if (originRequest && error.response?.status === 401 && !originRequest._retry && !isRefreshUrl) {
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
        removeTokens();
        window.location.href = '/sign-in';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default Axios;
