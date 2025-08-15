import { toast } from "react-hot-toast";
import { setError, setErrorForReload } from "../stores/error.slice";
import { Dispatch, AnyAction } from "@reduxjs/toolkit";

// Define types for error handling
interface ErrorResponse {
  code?: string;
  response?: {
    status?: number;
    data?: {
      errors?: Record<string, string>;
      message?: string;
      status?: number;
    };
  };
  reason?: string;
}

interface ThunkAPI {
  dispatch: Dispatch<AnyAction>;
  rejectWithValue: (value: any) => any;
}

// Define the function types for detectError
export const detectError = (
  error: ErrorResponse,
  dispatch: Dispatch<AnyAction>,
  rejectWithValue: ThunkAPI['rejectWithValue']
) => {
  if (error.code === "ERR_NETWORK" && error.response?.status === 0) {
    dispatch(
      setErrorForReload({
        errorCode: 0,
        errorMessage: "Server is unavailable",
      })
    );
    return rejectWithValue(error);
  }
  if (typeof error === "object" && error['reason']) return toast.error(error['reason']);
  if (error?.response) {
    if (error.response?.status === 422) {
      if (error.response?.data?.errors) {

        Object.keys(error.response?.data?.errors).map((item) =>
          dispatch(
            setError({
              errorCode: error?.response?.status ?? error?.response?.data?.status,
              errorMessage: error?.response?.data?.errors?.[item] ?? "Unknown error",
            })
          )
        );
      }
    } else
      dispatch(
        setError({
          errorCode: error.response.status ?? error?.response?.data?.status,
          errorMessage: error?.response?.data?.message ?? "Unknown error",
        })
      );
  }
  if (rejectWithValue) {
    return rejectWithValue(error);
  }
};

// Define type for spreadObjValuesNotNull function
export const spreadObjValuesNotNull = (ob: Record<string, any>) => {
  if (typeof ob === "object" && ob) {
    const tempObj: Record<string, string> = {};
    Object.keys(ob).forEach((key) => {
      tempObj[key] = ob[key] ?? "";
    });
    return tempObj;
  } else {
    return ob;
  }
};

// Define type for paramsToObject function
export function paramsToObject(entries: [string, string][]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result;
}

// Define type for mapAlterString function
export const mapAlterString = (_array: any[], string: string): any[] | string => {
  if (Array.isArray(_array) && _array.length > 0) {
    return _array.map((item) => item[string]);
  } else {
    return string;
  }
};

// Define type for subStringNumber function
export const subStringNumber = (stirng: string, numbers: number): string => {
  if (typeof stirng === "string" && stirng.length > numbers) {
    return stirng.substring(0, numbers) + "...";
  } else {
    return stirng;
  }
};


export function handleLoadingErrorParamsForAsycThunk(
  state: any,
  action: AnyAction
) {
  const { meta, payload, type } = action;
  const actionParts = type.split('/');
  const actionName = actionParts[1];

  // ✅ Ensure required sub-objects are initialized
  state.paramsForThunk = state.paramsForThunk || {};
  state.errorMessages = state.errorMessages || {};
  state.errorCodes = state.errorCodes || {};
  state.errors = state.errors || {};
  state.loadings = state.loadings || {};

  // ✅ Handle params when pending
  if (meta?.arg && type.endsWith('/pending')) {
    state.paramsForThunk[actionName] = meta.arg;
  }

  // ✅ Handle errors and codes when rejected
  if (type.endsWith('/rejected') && payload?.response) {
    state.errorMessages[actionName] =
      payload?.response?.data?.message ??
      payload?.response?.message ??
      'Something went wrong';

    state.errorCodes[actionName] = payload?.response?.status ?? 500;
  }

  // ✅ Set loading/error states
  state.errors[actionName] = type.endsWith('/rejected');
  state.loadings[actionName] = type.endsWith('/pending');
}

// Define type for catchAsync function
export const catchAsync = (fn: (arg: any, api: ThunkAPI) => Promise<any>) => (
  _: any,
  api: ThunkAPI
) => {
  return Promise.resolve(fn(_, api)).catch((error) => {
    if (_?.callBackOnError && typeof _?.callBackOnError === "function") {
      _?.callBackOnError(error);
    }
    return detectError(error, api?.dispatch, api?.rejectWithValue);
  });
};

// Define type for reduxToolKitCaseBuilder function
export const reduxToolKitCaseBuilder = (
  cases: { pending: any; fulfilled: any; rejected: any }[]
): any[] => {
  return cases.flatMap((el) => [el.pending, el.fulfilled, el.rejected]);
};
