import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from "../utils/errorHandler";
import Axios from "../utils/Axios";
import summery from "../utils/summery";
import {
  getAllLocalSuppliers,
  getLocalSuppliersPage,
  withOfflineCatalogFallback,
} from "@/lib/sync/offline-catalog";
import {
  createSupplierOffline,
  getOfflineMutationContext,
  updateSupplierOffline,
  withOfflineMutationFallback,
} from "@/lib/sync/offline-mutations";

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
    return withOfflineCatalogFallback(
      async () => {
        const query = new URLSearchParams(params).toString();
        const response = await Axios({
          ...summery.fetchSuppliers,
          url: `${summery.fetchSuppliers.url}?${query}`,
        });
        return response.data;
      },
      () => getLocalSuppliersPage(params),
    );
  })
);

export const addSupplier = createAsyncThunk(
  'supplier/addSupplier',
  catchAsync(async (data: any) => {
    return withOfflineMutationFallback(
      async () => {
        const response = await Axios({
          ...summery.addSupplier,
          data,
        });
        return response.data;
      },
      () => createSupplierOffline(data, getOfflineMutationContext()),
    );
  })
);

export const updateSupplier = createAsyncThunk(
  'supplier/updateSupplier',
  catchAsync(async (data: any) => {
    return withOfflineMutationFallback(
      async () => {
        const response = await Axios({
          ...summery.updateSupplier,
          url: `${summery.updateSupplier.url}/${data._id}`,
          data,
        });
        return response.data;
      },
      () => updateSupplierOffline(data, getOfflineMutationContext()),
    );
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
    return withOfflineCatalogFallback(
      async () => {
        const response = await Axios({
          ...summery.fetchAllSuppliers,
        })
        return response.data
      },
      async () => {
        const rows = await getAllLocalSuppliers()
        return rows.map((supplier) => ({
          value: supplier.id || supplier._id,
          label: supplier.name,
          ...supplier,
        }))
      },
    )
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

export const bulkAddSuppliers = createAsyncThunk(
  'supplier/bulkAddSuppliers',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.bulkAddSuppliers,
      data,
    });
    return response.data;
  })
);

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
      .addCase(bulkAddSuppliers.fulfilled, (_, __) => {
        // Handle bulk add success - could refresh the list or append new suppliers
        // For simplicity, we'll let the component refetch after import
      })
      .addMatcher(
        isAnyOf(
          ...reduxToolKitCaseBuilder([
            fetchSuppliers,
            addSupplier,
            updateSupplier,
            deleteSupplier,
            fetchAllSuppliers,
            getSupplierPurchaseAndTransactions,
            bulkAddSuppliers,
          ])
        ),
        handleLoadingErrorParamsForAsycThunk
      );
  },
});

export const { setSuppliers } = supplierSlice.actions;

export default supplierSlice.reducer;
