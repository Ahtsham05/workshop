import { createAsyncThunk, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";
import { catchAsync, handleLoadingErrorParamsForAsycThunk, reduxToolKitCaseBuilder } from "../utils/errorHandler";
import Axios from "../utils/Axios";
import summery from "../utils/summery";

// Define the initial state type
interface ProductState {
    data: any; // A list of products, adjust type based on your needs
    products: any[];
}

const initialState: ProductState = {
    data: null,
    products: [],
};

// Define the actions for fetching products
export const fetchProducts = createAsyncThunk(
    'product/fetchProducts',
    catchAsync(async (params: any) => {
        const query = new URLSearchParams(params).toString();
        const response = await Axios({
            ...summery.fetchProducts, // Assuming your API for fetching products is stored in summery
            url: `${summery.fetchProducts.url}?${query}`, // Append query parameters to the URL
        });
        return response.data;
    })
);

export const addProduct = createAsyncThunk(
    'product/addProduct',
    catchAsync(async (data: any) => {
        console.log("data", data)
        const response = await Axios({
            ...summery.addProduct, // Assuming your API for adding a product
            data,
        });
        return response.data;
    })
);

export const updateProduct = createAsyncThunk(
    'product/updateProduct',
    catchAsync(async (data: any) => {
        // console.log("update data", data)
        const response = await Axios({
            ...summery.updateProduct, // Assuming your API for updating a product
            url: `${summery.updateProduct.url}/${data._id}`, // Assuming the product ID is part of the URL
            data,
        });
        return response.data;
    })
);

export const deleteProduct = createAsyncThunk(
    'product/deleteProduct',
    catchAsync(async (productId: string) => {
        const response = await Axios({
            ...summery.deleteProduct, // Assuming your API for deleting a product
            url: `${summery.deleteProduct.url}/${productId}`,
        });
        return response.data;
    })
);

export const fetchAllProducts = createAsyncThunk(
    'product/fetchAllProducts',
    catchAsync(async (_) => {
        const response = await Axios({
            ...summery.fetchAllProducts, // Assuming your API for fetching products is stored in summery
        })
        return response.data
    })
)

const productSlice = createSlice({
    name: "product",
    initialState,
    reducers: {
        setProducts(state, action: PayloadAction<any[]>) {
            state.data = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchProducts.fulfilled, () => {
                // state.data = action.payload; // Assuming payload contains the list of products
            })
            .addCase(addProduct.fulfilled, (state, action) => {
                if (state.data?.length > 0) {
                    state.data = [...state.data, action.payload];
                } // Assuming payload contains the new product
            })
            .addCase(updateProduct.fulfilled, (state, action) => {
                const updatedProduct = action.payload;

                // Ensure state.data is an array before using map
                if (Array.isArray(state.data)) {
                    state.data = state.data.map((product) =>
                        product.id === updatedProduct.id ? updatedProduct : product
                    );
                }
            })
            .addCase(deleteProduct.fulfilled, (state, action) => {
                // Ensure state.data is an array before using filter
                if (Array.isArray(state.data)) {
                    state.data = state.data.filter((product: any) => product.id !== action.payload.id);
                } else {
                    state.data = []; // Optionally reset to an empty array
                }
            })
            .addCase(fetchAllProducts.fulfilled, (state, action) => {
                state.data = action.payload; // Assuming payload contains the list of products
                //products array extract id and name and set into state products with value and label
                state.products = action.payload.map((product: any) => ({ value: product.id, label: product.name, ...product }));
            })
            .addMatcher(
                isAnyOf(
                    ...reduxToolKitCaseBuilder([
                        fetchProducts,
                        addProduct,
                        updateProduct,
                        deleteProduct,
                        fetchAllProducts
                    ])
                ),
                handleLoadingErrorParamsForAsycThunk
            );
    },
});

export const { setProducts } = productSlice.actions;

export default productSlice.reducer;
