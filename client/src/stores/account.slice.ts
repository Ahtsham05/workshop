import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from '@reduxjs/toolkit';
import Axios from '../utils/Axios';
import summery from '../utils/summery';
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from '../utils/errorHandler';

// Types
interface Account {
  _id: string;
  name: string;
  type: 'receivable' | 'payable';
  balance: number;
  customer?: string;
  supplier?: string;
  transactionType: 'cashReceived' | 'expenseVoucher' | 'generalLedger';
}

interface AccountState {
  data: Account[] | null;
}

const initialState: AccountState = { data: null };

// Async thunks
export const fetchAccounts = createAsyncThunk(
  'account/fetchAccounts',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.fetchAccounts,
      url: `${summery.fetchAccounts.url}?${query}`,
    });
    return response.data;
  }),
);

export const fetchAllAccounts = createAsyncThunk(
  'account/fetchAllAccounts',
  catchAsync(async () => {
    const response = await Axios({
      ...summery.fetchAllAccounts,
    });
    return response.data;
  }),
)

export const addAccount = createAsyncThunk(
  'account/addAccount',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.addAccount,
      data,
    });
    return response.data;
  }),
);

export const updateAccount = createAsyncThunk(
  'account/updateAccount',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.updateAccount,
      url: `${summery.updateAccount.url}/${data._id}`,
      data,
    });
    return response.data;
  }),
);

export const deleteAccount = createAsyncThunk(
  'account/deleteAccount',
  catchAsync(async (id: string) => {
    const response = await Axios({
      ...summery.deleteAccount,
      url: `${summery.deleteAccount.url}/${id}`,
    });
    return response.data;
  }),
);

export const getAccountDetailsById = createAsyncThunk(
  'account/getAccountDetailsById',
  catchAsync(async (params: any) => {
     const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.getAccountDetailsById,
      url: `${summery.getAccountDetailsById.url}?${query}`,
    });
    return response.data;
  }),
)

const accountSlice = createSlice({
  name: 'account',
  initialState,
  reducers: {
    setAccounts(state, action: PayloadAction<Account[]>) {
      state.data = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAllAccounts.fulfilled, (state, action) => {
        state.data = action.payload?.map((account: any) => ({ value: account.id, label: account.name, ...account }));
      })
      .addCase(addAccount.fulfilled, (state, action) => {
        if (state.data?.length) {
          state.data.push(action.payload);
        } else {
          state.data = [action.payload];
        }
      })
      .addCase(updateAccount.fulfilled, (state, action) => {
        if (Array.isArray(state.data)) {
          state.data = state.data.map((acc) =>
            acc._id === action.payload._id ? action.payload : acc,
          );
        }
      })
      .addCase(deleteAccount.fulfilled, (state, action) => {
        if (Array.isArray(state.data)) {
          state.data = state.data.filter((acc) => acc._id !== action.payload._id);
        }
      })
      .addMatcher(
        isAnyOf(...reduxToolKitCaseBuilder([fetchAccounts, 
          addAccount, updateAccount, deleteAccount, fetchAllAccounts])),
        handleLoadingErrorParamsForAsycThunk,
      );
  },
});

export const { setAccounts } = accountSlice.actions;
export default accountSlice.reducer;
