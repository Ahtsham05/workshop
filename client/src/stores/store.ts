import { configureStore } from '@reduxjs/toolkit';
import errorReducer from './error.slice'; // Import your error slice reducer
import authReducer from './auth.slice';
import productReducer from './product.slice'; // Import your product slice reducer
import customerReducer from './customer.slice';
import supplierReducer from './supplier.slice';
import categoryReducer from './category.slice';
import { invoiceApi } from './invoice.api';
import { customerApi } from './customer.api';
import { purchaseApi } from './purchase.api';

export const store = configureStore({
  reducer: {
    // Add your reducers here, specifying their types if necessary
    handleErrors: errorReducer,
    auth: authReducer,
    product: productReducer,
    customer: customerReducer,
    supplier: supplierReducer,
    category: categoryReducer,
    // Add RTK Query API reducers
    [invoiceApi.reducerPath]: invoiceApi.reducer,
    [customerApi.reducerPath]: customerApi.reducer,
    [purchaseApi.reducerPath]: purchaseApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      invoiceApi.middleware,
      customerApi.middleware,
      purchaseApi.middleware
    ),
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;


export default store;