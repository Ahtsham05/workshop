import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from "../utils/errorHandler";
import Axios from "../utils/Axios";
import summery from "../utils/summery";

interface AuthState {
  data: any | null;
  activeBranchId: string | null;
  activeBranchName: string | null;
}

const initialState: AuthState = {
  data: null,
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
      .addCase(logout.fulfilled, (state, action) => {
        console.log("logout",action.payload);
        state.data = null;
        state.activeBranchId = null;
        state.activeBranchName = null;
        localStorage.removeItem("user");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("activeBranchId");
        localStorage.removeItem("activeBranchName");
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
