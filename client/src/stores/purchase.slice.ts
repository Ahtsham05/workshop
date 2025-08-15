import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from "../utils/errorHandler";
import Axios from "../utils/Axios";
import summery from "../utils/summery";

// Define the initial state type
interface PurchaseState {
  data: any; // A list of purchases, adjust type based on your needs
}

const initialState: PurchaseState = {
  data: null,
};

// Define the actions for fetching purchases
export const fetchPurchases = createAsyncThunk(
  'purchase/fetchPurchases',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.fetchPurchases, // Assuming your API for fetching purchases is stored in summery
      url: `${summery.fetchPurchases.url}?${query}`, // Append query parameters to the URL
    });
    return response.data;
  })
);

export const addPurchase = createAsyncThunk(
  'purchase/addPurchase',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.addPurchase, // Assuming your API for adding a purchase
      data,
    });
    return response.data;
  })
);

export const updatePurchase = createAsyncThunk(
  'purchase/updatePurchase',
  catchAsync(async (data: any) => {
    const newData = {
      supplier : data?.supplier,
      purchaseDate : data?.purchaseDate,
      items : data?.items,
      totalAmount : data?.totalAmount
    }
    const response = await Axios({
      ...summery.updatePurchase, // Assuming your API for updating a purchase
      url: `${summery.updatePurchase.url}/${data?.id}`, // Assuming the purchase ID is part of the URL
      data:newData,
    });
    return response.data;
  })
);

export const deletePurchase = createAsyncThunk(
  'purchase/deletePurchase',
  catchAsync(async (purchaseId: string) => {
    const response = await Axios({
      ...summery.deletePurchase, // Assuming your API for deleting a purchase
      url: `${summery.deletePurchase.url}/${purchaseId}`,
    });
    return response.data;
  })
);

export const fetchPurchaseById = createAsyncThunk(
  'purchase/fetchPurchaseById',
  catchAsync(async (purchaseId: string) => {
    const response = await Axios({
      ...summery.fetchPurchaseById, // Assuming your API for fetching a purchase by ID
      url: `${summery.fetchPurchaseById.url}/${purchaseId}`,
    });
    return response.data;
  })
)

export const getPurchaseByDate = createAsyncThunk(
  'purchase/getPurchaseByDate',
  catchAsync(async (filter: any) => {
    const response = await Axios({
      ...summery.getPurchaseByDate, // Assuming your API for fetching purchases by date
      url: `${summery.getPurchaseByDate.url}?startDate=${filter.startDate}&endDate=${filter.endDate}`,
    });
    return response.data;
  })
)

const purchaseSlice = createSlice({
  name: "purchase",
  initialState,
  reducers: {
    setPurchases(state, action: PayloadAction<any[]>) {
      state.data = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPurchases.fulfilled, (state, action) => {
        state.data = action.payload; // Assuming payload contains the list of purchases
      })
      .addCase(addPurchase.fulfilled, (state, action) => {
        if (state.data?.length > 0) {
          state.data = [...state.data, action.payload];
        }
        // Assuming payload contains the new purchase
      })
      .addCase(updatePurchase.fulfilled, (state, action) => {
        const updatedPurchase = action.payload;

        // Ensure state.data is an array before using map
        if (Array.isArray(state.data)) {
          state.data = state.data.map((purchase) =>
            purchase.id === updatedPurchase.id ? updatedPurchase : purchase
          );
        }
      })
      .addCase(deletePurchase.fulfilled, (state, action) => {
        // Ensure state.data is an array before using filter
        if (Array.isArray(state.data)) {
          state.data = state.data.filter((purchase: any) => purchase.id !== action.payload.id);
        } else {
          state.data = []; // Optionally reset to an empty array
        }
      })
      .addMatcher(
        isAnyOf(
          ...reduxToolKitCaseBuilder([
            fetchPurchases,
            addPurchase,
            updatePurchase,
            deletePurchase,
            fetchPurchaseById,
            getPurchaseByDate
          ])
        ),
        handleLoadingErrorParamsForAsycThunk
      );
  },
});

export const { setPurchases } = purchaseSlice.actions;

export default purchaseSlice.reducer;