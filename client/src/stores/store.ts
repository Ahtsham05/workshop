import { configureStore } from '@reduxjs/toolkit';
import errorReducer from './error.slice'; // Import your error slice reducer
import authReducer from './auth.slice';
import productReducer from './product.slice'; // Import your product slice reducer
import customerReducer from './customer.slice';
import supplierReducer from './supplier.slice';
import accountReducer from './account.slice';
import mobileRepairReducer from './mobileRepair.slice'
import categoryReducer from './category.slice';
import { invoiceApi } from './invoice.api';
import { returnApi } from './return.api';
import { customerApi } from './customer.api';

export const store = configureStore({
  reducer: {
    // Add your reducers here, specifying their types if necessary
    handleErrors: errorReducer,
    auth: authReducer,
    product: productReducer,
    customer: customerReducer,
    supplier: supplierReducer,
    account: accountReducer,
    mobileRepair: mobileRepairReducer,
    category: categoryReducer,
    // Add RTK Query API reducers
    [invoiceApi.reducerPath]: invoiceApi.reducer,
    [returnApi.reducerPath]: returnApi.reducer,
    [customerApi.reducerPath]: customerApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      invoiceApi.middleware,
      returnApi.middleware,
      customerApi.middleware
    ),
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;


export default store;