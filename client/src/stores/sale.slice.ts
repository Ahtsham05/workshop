import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from "../utils/errorHandler";
import Axios from "../utils/Axios";
import summery from "../utils/summery";

// Define the initial state type
interface SaleState {
  data: any; // A list of sales, adjust type based on your needs
}

const initialState: SaleState = {
  data: null,
};

// Define the actions for fetching sales
export const fetchSales = createAsyncThunk(
  'sale/fetchSales',
  catchAsync(async (params: any) => {
    const query = new URLSearchParams(params).toString();
    const response = await Axios({
      ...summery.fetchSales, // Assuming your API for fetching sales is stored in summery
      url: `${summery.fetchSales.url}?${query}`, // Append query parameters to the URL
    });
    return response.data;
  })
);

export const addSale = createAsyncThunk(
  'sale/addSale',
  catchAsync(async (data: any) => {
    const response = await Axios({
      ...summery.addSale, // Assuming your API for adding a sale
      data,
    });
    return response.data;
  })
);

export const updateSale = createAsyncThunk(
  'sale/updateSale',
  catchAsync(async (data: any) => {
    const newData = {
      customer: data?.customer,
      saleDate: data?.saleDate,
      items: data?.items,
      totalAmount: data?.totalAmount,
      totalProfit: data?.totalProfit,
    }
    const response = await Axios({
      ...summery.updateSale, // Assuming your API for updating a sale
      url: `${summery.updateSale.url}/${data?.id}`, // Assuming the sale ID is part of the URL
      data: newData,
    });
    return response.data;
  })
);

export const deleteSale = createAsyncThunk(
  'sale/deleteSale',
  catchAsync(async (saleId: string) => {
    const response = await Axios({
      ...summery.deleteSale, // Assuming your API for deleting a sale
      url: `${summery.deleteSale.url}/${saleId}`,
    });
    return response.data;
  })
);

export const fetchSaleById = createAsyncThunk(
  'sale/fetchSaleById',
  catchAsync(async (saleId: string) => {
    const response = await Axios({
      ...summery.fetchSaleById, // Assuming your API for fetching a sale by ID
      url: `${summery.fetchSaleById.url}/${saleId}`,
    });
    return response.data;
  })
)

export const getSaleByDate = createAsyncThunk(
  'sale/getSaleByDate',
  catchAsync(async (filter: any) => {
    const response = await Axios({
      ...summery.getSaleByDate, // Assuming your API for fetching sales by date
      url: `${summery.getSaleByDate.url}?startDate=${filter.startDate}&endDate=${filter.endDate}`,
    });
    return response.data;
  })
)

export const getInvoiceNumber = createAsyncThunk(
  'sale/getInvoiceNumber',
  catchAsync(async () => {
    const response = await Axios({
      ...summery.getInvoiceNumber, // Assuming your API for fetching the next invoice number
    });
    return response.data;
  })
);

const saleSlice = createSlice({
  name: "sale",
  initialState,
  reducers: {
    setSales(state, action: PayloadAction<any[]>) {
      state.data = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSales.fulfilled, (state, action) => {
        state.data = action.payload; // Assuming payload contains the list of sales
      })
      .addCase(addSale.fulfilled, (state, action) => {
        if (state.data?.length > 0) {
          state.data = [...state.data, action.payload];
        }
        // Assuming payload contains the new sale
      })
      .addCase(updateSale.fulfilled, (state, action) => {
        const updatedSale = action.payload;

        // Ensure state.data is an array before using map
        if (Array.isArray(state.data)) {
          state.data = state.data.map((sale) =>
            sale.id === updatedSale.id ? updatedSale : sale
          );
        }
      })
      .addCase(deleteSale.fulfilled, (state, action) => {
        // Ensure state.data is an array before using filter
        if (Array.isArray(state.data)) {
          state.data = state.data.filter((sale: any) => sale.id !== action.payload.id);
        } else {
          state.data = []; // Optionally reset to an empty array
        }
      })
      .addMatcher(
        isAnyOf(
          ...reduxToolKitCaseBuilder([
            fetchSales,
            addSale,
            updateSale,
            deleteSale,
            fetchSaleById,
            getInvoiceNumber
          ])
        ),
        handleLoadingErrorParamsForAsycThunk
      );
  },
});

export const { setSales } = saleSlice.actions;

export default saleSlice.reducer;
