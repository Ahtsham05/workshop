import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from "../utils/errorHandler";
import Axios from "../utils/Axios";
import summery from "../utils/summery";

// Define the initial state type
interface AuthState {
  data:any | null; // More specific user type instead of any
}

const initialState: AuthState = {
  data: null,
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
    setUser(state,action: PayloadAction<any>){
      state.data = action.payload
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(signupWithEmailPassword.fulfilled, (state, action) => {
        state.data = action.payload; // Assuming payload has the user data
      })
      .addCase(signinWithEmailPassword.fulfilled, (state, action) => {
        state.data = action.payload; // Assuming payload has the user data
      })
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.data = { ...state?.data, tokens: action.payload}; // Assuming payload has the user data
      })
      .addCase(logout.fulfilled, (state, action) => {
        console.log("logout",action.payload);
        state.data = null; // Assuming payload has the user data
        localStorage.removeItem("user");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
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

export const { setUser } = authSlice.actions;

export default authSlice.reducer;
