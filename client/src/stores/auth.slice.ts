import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from "../utils/errorHandler";
import Axios from "../utils/Axios";
import summery from "../utils/summery";
import { looksLikeJwt } from "@/lib/auth-token";
import { clearAllAuthStorage } from "@/lib/auth-cache";

interface AuthState {
  data: any | null;
  activeBranchId: string | null;
  activeBranchName: string | null;
}

/**
 * Synchronously reads the persisted user from localStorage so the Redux store
 * is fully populated on the VERY FIRST render.  This eliminates the race
 * condition where the sidebar (or any other component) renders with user=null
 * before the useEffect in auth-context fires.
 */
function loadInitialAuthData(): any | null {
  try {
    let token = localStorage.getItem('accessToken')
    let userStr = localStorage.getItem('user')
    const refreshToken = localStorage.getItem('refreshToken')

    // Only restore plaintext cached credentials synchronously. Encrypted offline
    // cache tokens are restored asynchronously by AuthProvider / route guards.
    if ((!token || !userStr) && !looksLikeJwt(token)) {
      const cachedUser = localStorage.getItem('cached_user')
      const cachedToken = localStorage.getItem('cached_token')
      if (cachedUser && cachedToken && looksLikeJwt(cachedToken)) {
        localStorage.setItem('accessToken', cachedToken)
        localStorage.setItem('user', cachedUser)
        token = cachedToken
        userStr = cachedUser
      }
    }

    if (token && userStr && looksLikeJwt(token)) {
      const user = JSON.parse(userStr)
      if (user?.id) {
        return {
          user,
          tokens: {
            access: { token },
            refresh: { token: refreshToken },
          },
        }
      }
    }
  } catch (_e) {}
  return null
}

const initialState: AuthState = {
  data: loadInitialAuthData(),
  activeBranchId: localStorage.getItem('activeBranchId') || null,
  activeBranchName: localStorage.getItem('activeBranchName') || null,
};

// Define the data type expected in the signupWithEmailPassword action

// Define the action using createAsyncThunk
export const signupWithEmailPassword = createAsyncThunk(
  'auth/signupWithEmailPassword',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.signup,
      data,
    });
    return response.data;
  })
);

export const signinWithEmailPassword = createAsyncThunk(
  'auth/signinWithEmailPassword',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.login,
      data,
    });
    return response.data;
  })
);

export const refreshToken = createAsyncThunk(
  'auth/refreshToken',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.refreshToken,
      data,
    });
    return response.data;
  })
)

export const logout = createAsyncThunk(
  'auth/logout',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.logout,
      data,
    });
    return response.data;
  })
)

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<any>) {
      state.data = action.payload
    },
    setPreferredLanguage(state, action: PayloadAction<'en' | 'ur'>) {
      if (state.data?.user) {
        state.data.user.preferredLanguage = action.payload;
        const existingUser = localStorage.getItem('user')
        if (existingUser) {
          try {
            const parsedUser = JSON.parse(existingUser)
            parsedUser.preferredLanguage = action.payload
            localStorage.setItem('user', JSON.stringify(parsedUser))
          } catch (error) {
            console.warn('Failed to persist preferredLanguage in localStorage', error)
          }
        }
      }
    },
    setActiveBranch(state, action: PayloadAction<{ id: string; name: string } | null>) {
      if (action.payload) {
        state.activeBranchId = action.payload.id;
        state.activeBranchName = action.payload.name;
        localStorage.setItem('activeBranchId', action.payload.id);
        localStorage.setItem('activeBranchName', action.payload.name);
      } else {
        state.activeBranchId = null;
        state.activeBranchName = null;
        localStorage.removeItem('activeBranchId');
        localStorage.removeItem('activeBranchName');
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signupWithEmailPassword.fulfilled, (state, action) => {
        state.data = action.payload; // Assuming payload has the user data
      })
      .addCase(signinWithEmailPassword.fulfilled, (state, action) => {
        state.data = action.payload; // Assuming payload has the user data
        // Clear stale branch from previous user on new login
        state.activeBranchId = null;
        state.activeBranchName = null;
        localStorage.removeItem('activeBranchId');
        localStorage.removeItem('activeBranchName');
      })
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.data = { ...state?.data, tokens: action.payload}; // Assuming payload has the user data
      })
      .addCase(logout.fulfilled, (state) => {
        state.data = null;
        state.activeBranchId = null;
        state.activeBranchName = null;
        clearAllAuthStorage();
      })
      .addMatcher(
        isAnyOf(
          ...reduxToolKitCaseBuilder([
            signupWithEmailPassword,
            signinWithEmailPassword,
            refreshToken,
            logout
          ])
        ),
        handleLoadingErrorParamsForAsycThunk
      );
  },
});

export const { setUser, setPreferredLanguage, setActiveBranch } = authSlice.actions;

export default authSlice.reducer;
