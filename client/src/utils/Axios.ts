import axios, { AxiosInstance, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import summery from './summery';
// Create the Axios instance
const baseUrl = import.meta.env.VITE_BACKEND_URL;

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

// Refresh token logic
const refreshTokens = async (navigate: Function): Promise<string> => {
  try {
    const refreshtoken = getRefreshToken();
    if (!refreshtoken) {
      throw new Error("No refresh token available");
    }

    const response: AxiosResponse = await Axios({
      ...summery.loginRefresh,
      headers: {
        Authorization: `Bearer ${refreshtoken}`,
      },
    });

    const { accessToken, refreshToken } = response.data.data;
    saveTokens(accessToken, refreshToken);
    return accessToken;
  } catch (error) {
    console.error("Error refreshing tokens", error);
    removeTokens();
    navigate({to:'/sign-in', replace: true});
    throw error;
  }
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
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Axios response interceptor to handle 401 errors and refresh tokens
Axios.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originRequest = error.config as CustomAxiosRequestConfig;

    if (originRequest && error.response?.status === 401 && !originRequest._retry) {
      originRequest._retry = true;
      try {
        // Here we pass the navigate function to refreshTokens
        const newAccessToken = await refreshTokens((navigate:any) => {
          // You can define navigation logic here or handle redirect
          navigate({to:'/sign-in', replace: true});
        });
        originRequest.headers!.Authorization = `Bearer ${newAccessToken}`;
        return Axios(originRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default Axios;
