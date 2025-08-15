// ** Redux Imports
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import toast from "react-hot-toast";

// Define the initial state type
interface ErrorState {
  errorMessage: string | null;
  errorCode: string | null;
  models: Record<string, boolean>;
}

// Initial state with correct types
const initialState: ErrorState = {
  errorMessage: null,
  errorCode: null,
  models: {},
};

export const handleErrorSlice = createSlice({
  name: "handleErrors",
  initialState,
  reducers: {
    // globally dynamic action to set error
    setError: (state, action: PayloadAction<{ errorMessage: string; errorCode: any }>) => {
      state.errorMessage = action.payload.errorMessage;
      state.errorCode = action.payload.errorCode;
      // console.log("errorCode", action.payload.errorCode);
      // console.log("errorMessage", action.payload.errorMessage);
      // set whole project error message/ when API is unavailable/invalid/not ok /not supported
      toast.error(action.payload.errorMessage || "Something went wrong");
    },
    resetError: (state) => {
      state.errorMessage = null;
      state.errorCode = null;
    },
    // dispatch reload site if server is unavailable
    setErrorForReload: (state, action: PayloadAction<{ errorMessage: string; errorCode: number }>) => {
      state.models["reload"] = true;
      state.errorMessage = action.payload.errorMessage;
      state.errorCode = action.payload.errorCode.toString();
    },
  },
});

export const { setError, resetError, setErrorForReload } = handleErrorSlice.actions;

export default handleErrorSlice.reducer;
