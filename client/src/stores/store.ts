import { configureStore } from '@reduxjs/toolkit';
import errorReducer from './error.slice'; // Import your error slice reducer
import authReducer from './auth.slice';
import productReducer from './product.slice'; // Import your product slice reducer
import customerReducer from './customer.slice';
import supplierReducer from './supplier.slice';
import accountReducer from './account.slice';
import mobileRepairReducer from './mobileRepair.slice'

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
  },
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;


export default store;