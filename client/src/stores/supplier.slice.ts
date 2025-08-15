import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from "../utils/errorHandler";
import Axios from "../utils/Axios";
import summery from "../utils/summery";

// Define the initial state type
interface SupplierState {
  data: any; // A list of suppliers, adjust type based on your needs
}

const initialState: SupplierState = {
  data: null,
};

// Define the actions for fetching suppliers
export const fetchSuppliers = createAsyncThunk(
  'supplier/fetchSuppliers',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.fetchSuppliers, // Assuming your API for fetching suppliers is stored in summery
      url: `${summery.fetchSuppliers.url}?${query}`, // Append query parameters to the URL
    });
    return response.data;
  })
);

export const addSupplier = createAsyncThunk(
  'supplier/addSupplier',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.addSupplier, // Assuming your API for adding a supplier
      data,
    });
    return response.data;
  })
);

export const updateSupplier = createAsyncThunk(
  'supplier/updateSupplier',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.updateSupplier, // Assuming your API for updating a supplier
      url: `${summery.updateSupplier.url}/${data._id}`, // Assuming the supplier ID is part of the URL
      data,
    });
    return response.data;
  })
);

export const deleteSupplier = createAsyncThunk(
  'supplier/deleteSupplier',
  catchAsync(async (supplierId: string) => {
    const response = await Axios({
      ...summery.deleteSupplier, // Assuming your API for deleting a supplier
      url: `${summery.deleteSupplier.url}/${supplierId}`,
    });
    return response.data;
  })
);

export const fetchAllSuppliers = createAsyncThunk(
  'supplier/fetchAllSuppliers',
  catchAsync(async () => {
    const response = await Axios({
      ...summery.fetchAllSuppliers, // Assuming your API for fetching suppliers is stored in summery
    })
    return response.data
  })
)

export const getSupplierPurchaseAndTransactions = createAsyncThunk(
  'supplier/getSupplierPurchaseAndTransactions',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.getSupplierPurchaseAndTransactions, // Assuming your API for fetching Cutomers is stored in summery
      url: `${summery.getSupplierPurchaseAndTransactions.url}?${query}`,
    })
    return response.data
  })
)

const supplierSlice = createSlice({
  name: "supplier",
  initialState,
  reducers: {
    setSuppliers(state, action: PayloadAction<any[]>) {
      state.data = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSuppliers.fulfilled, (state, action) => {
        state.data = action.payload; // Assuming payload contains the list of suppliers
      })
      .addCase(addSupplier.fulfilled, (state, action) => {
          if(state.data?.length > 0){
            state.data = [...state.data, { label: action.payload.name, value: action.payload._id, ...action.payload }];
          }else{
            state.data = [{ label: action.payload.name, value: action.payload.id, ...action.payload }];
          }
      })
      .addCase(updateSupplier.fulfilled, (state, action) => {
        const updatedSupplier = action.payload;

        // Ensure state.data is an array before using map
        if (Array.isArray(state.data)) {
          state.data = state.data.map((supplier) =>
            supplier.id === updatedSupplier.id ? updatedSupplier : supplier
          );
        }
      })
      .addCase(deleteSupplier.fulfilled, (state, action) => {
        // Ensure state.data is an array before using filter
        if (Array.isArray(state.data)) {
          state.data = state.data.filter((supplier: any) => supplier.id !== action.payload.id);
        } else {
          state.data = []; // Optionally reset to an empty array
        }
      })
      .addCase(fetchAllSuppliers.fulfilled, (state, action) => {
        state.data = action.payload.map((supplier: any) => ({ value: supplier.id, label: supplier.name, ...supplier }));
      })
      .addMatcher(
        isAnyOf(
          ...reduxToolKitCaseBuilder([
            fetchSuppliers,
            addSupplier,
            updateSupplier,
            deleteSupplier,
            fetchAllSuppliers,
            getSupplierPurchaseAndTransactions
          ])
        ),
        handleLoadingErrorParamsForAsycThunk
      );
  },
});

export const { setSuppliers } = supplierSlice.actions;

export default supplierSlice.reducer;
