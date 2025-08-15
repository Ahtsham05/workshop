import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from '@reduxjs/toolkit';
import Axios from '../utils/Axios';
import summery from '../utils/summery';
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from '../utils/errorHandler';

// Types
export interface Transaction {
  _id: string;
  account: string;
  amount: number;
  transactionType: 'cashReceived' | 'expenseVoucher';
  transactionDate?: string;
  description?: string;
  status?: 'pending' | 'completed';
}

interface TransactionState {
  data: Transaction[] | null;
}

const initialState: TransactionState = { data: null };

// Async thunks
export const fetchTransactions = createAsyncThunk(
  'transaction/fetchTransactions',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.fetchTransactions,
      url: `${summery.fetchTransactions.url}?${query}`,
    });
    return response.data;
  }),
);

export const addTransaction = createAsyncThunk(
  'transaction/addTransaction',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.addTransaction,
      data,
    });
    return response.data;
  }),
);

export const updateTransaction = createAsyncThunk(
  'transaction/updateTransaction',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.updateTransaction,
      url: `${summery.updateTransaction.url}/${data._id}`,
      data,
    });
    return response.data;
  }),
);

export const deleteTransaction = createAsyncThunk(
  'transaction/deleteTransaction',
  catchAsync(async (id: string) => {
    const response = await Axios({
      ...summery.deleteTransaction,
      url: `${summery.deleteTransaction.url}/${id}`,
    });
    return response.data;
  }),
);

export const getTransactionsByDate = createAsyncThunk(
  'transaction/getTransactionsByDate',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.fetchTransactionsByDate,
      url: `${summery.fetchTransactionsByDate.url}?${query}`,
    });
    return response.data;
  }),
)

const transactionSlice = createSlice({
  name: 'transaction',
  initialState,
  reducers: {
    setTransactions(state, action: PayloadAction<Transaction[]>) {
      state.data = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.data = action.payload;
      })
      .addCase(addTransaction.fulfilled, (state, action) => {
        if (state.data?.length) {
          state.data.push(action.payload);
        } else {
          state.data = [action.payload];
        }
      })
      .addCase(updateTransaction.fulfilled, (state, action) => {
        if (Array.isArray(state.data)) {
          state.data = state.data.map((txn) =>
            txn._id === action.payload._id ? action.payload : txn,
          );
        }
      })
      .addCase(deleteTransaction.fulfilled, (state, action) => {
        if (Array.isArray(state.data)) {
          state.data = state.data.filter((txn) => txn._id !== action.payload._id);
        }
      })
      .addMatcher(
        isAnyOf(...reduxToolKitCaseBuilder([fetchTransactions, addTransaction, updateTransaction, deleteTransaction,getTransactionsByDate])),
        handleLoadingErrorParamsForAsycThunk,
      );
  },
});

export const { setTransactions } = transactionSlice.actions;
export default transactionSlice.reducer;
