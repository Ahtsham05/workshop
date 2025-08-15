import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from "../utils/errorHandler";
import Axios from "../utils/Axios";
import summery from "../utils/summery";

// Define the initial state type
interface CustomerState {
  data: any; // A list of customers, adjust type based on your needs
}

const initialState: CustomerState = {
  data: null,
};

// Define the actions for fetching customers
export const fetchCustomers = createAsyncThunk(
  'customer/fetchCustomers',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.fetchCustomers, // Assuming your API for fetching customers is stored in summery
      url: `${summery.fetchCustomers.url}?${query}`, // Append query parameters to the URL
    });
    return response.data;
  })
);

export const addCustomer = createAsyncThunk(
  'customer/addCustomer',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.addCustomer, // Assuming your API for adding a customer
      data,
    });
    return response.data;
  })
);

export const updateCustomer = createAsyncThunk(
  'customer/updateCustomer',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.updateCustomer, // Assuming your API for updating a customer
      url: `${summery.updateCustomer.url}/${data._id}`, // Assuming the customer ID is part of the URL
      data,
    });
    return response.data;
  })
);

export const deleteCustomer = createAsyncThunk(
  'customer/deleteCustomer',
  catchAsync(async (customerId: string) => {
    const response = await Axios({
      ...summery.deleteCustomer, // Assuming your API for deleting a customer
      url: `${summery.deleteCustomer.url}/${customerId}`,
    });
    return response.data;
  })
);

export const fetchAllCutomers = createAsyncThunk(
  'supplier/fetchAllCutomers',
  catchAsync(async () => {
    const response = await Axios({
      ...summery.fetchAllCutomers, // Assuming your API for fetching Cutomers is stored in summery
    })
    return response.data
  })
)


export const getCustomerSalesAndTransactions = createAsyncThunk(
  'customer/getCustomerSalesAndTransactions',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.getCustomerSalesAndTransactions, // Assuming your API for fetching Cutomers is stored in summery
      url: `${summery.getCustomerSalesAndTransactions.url}?${query}`,
    })

    return response.data
  }))

const customerSlice = createSlice({
  name: "customer",
  initialState,
  reducers: {
    setCustomers(state, action: PayloadAction<any[]>) {
      state.data = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.data = action.payload; // Assuming payload contains the list of customers
      })
      .addCase(addCustomer.fulfilled, (state, action) => {
        if (state.data?.length > 0) {
          state.data = [...state.data, { label: action.payload.name, value: action.payload._id, ...action.payload }];
        } else {
          state.data = [{ label: action.payload.name, value: action.payload.id, ...action.payload }];
        }
      })
      .addCase(updateCustomer.fulfilled, (state, action) => {
        const updatedCustomer = action.payload;

        // Ensure state.data is an array before using map
        if (Array.isArray(state.data)) {
          state.data = state.data.map((customer) =>
            customer.id === updatedCustomer.id ? updatedCustomer : customer
          );
        }
      })
      .addCase(deleteCustomer.fulfilled, (state, action) => {
        // Ensure state.data is an array before using filter
        if (Array.isArray(state.data)) {
          state.data = state.data.filter((customer: any) => customer.id !== action.payload.id);
        } else {
          state.data = []; // Optionally reset to an empty array
        }
      })
      .addCase(fetchAllCutomers.fulfilled, (state, action) => {
        state.data = action.payload.map((customer: any) => ({ value: customer.id, label: customer.name, ...customer }));
      })
      .addMatcher(
        isAnyOf(
          ...reduxToolKitCaseBuilder([
            fetchCustomers,
            addCustomer,
            updateCustomer,
            deleteCustomer,
            fetchAllCutomers,
            getCustomerSalesAndTransactions
          ])
        ),
        handleLoadingErrorParamsForAsycThunk
      );
  },
});

export const { setCustomers } = customerSlice.actions;

export default customerSlice.reducer;
