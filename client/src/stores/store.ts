import { configureStore } from '@reduxjs/toolkit';
import errorReducer from './error.slice';
import authReducer from './auth.slice';
import productReducer from './product.slice';
import customerReducer from './customer.slice';
import supplierReducer from './supplier.slice';
import categoryReducer from './category.slice';
import { invoiceApi } from './invoice.api';
import { customerApi } from './customer.api';
import { purchaseApi } from './purchase.api';
import { dashboardApi } from './dashboard.api';
import { reportsApi } from './reports.api';
import { companyApi } from './company.api';
import { rolesApi } from './roles.api';
import { usersApi } from './users.api';
import { hrApi } from './hr.api';
import { organizationApi } from './organization.api';
import { branchApi } from './branch.api';
import { membershipApi } from './membership.api';
import { subscriptionApi } from './subscription.api';
import { userPreferencesApi } from './user-preferences.api';
import { mobileShopApi } from './mobile-shop.api';
import { returnsApi } from './returns.api';

export const store = configureStore({
  reducer: {
    handleErrors: errorReducer,
    auth: authReducer,
    product: productReducer,
    customer: customerReducer,
    supplier: supplierReducer,
    category: categoryReducer,
    [invoiceApi.reducerPath]: invoiceApi.reducer,
    [customerApi.reducerPath]: customerApi.reducer,
    [purchaseApi.reducerPath]: purchaseApi.reducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
    [reportsApi.reducerPath]: reportsApi.reducer,
    [companyApi.reducerPath]: companyApi.reducer,
    [rolesApi.reducerPath]: rolesApi.reducer,
    [usersApi.reducerPath]: usersApi.reducer,
    [hrApi.reducerPath]: hrApi.reducer,
    [organizationApi.reducerPath]: organizationApi.reducer,
    [branchApi.reducerPath]: branchApi.reducer,
    [membershipApi.reducerPath]: membershipApi.reducer,
    [subscriptionApi.reducerPath]: subscriptionApi.reducer,
    [userPreferencesApi.reducerPath]: userPreferencesApi.reducer,
    [mobileShopApi.reducerPath]: mobileShopApi.reducer,
    [returnsApi.reducerPath]: returnsApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      invoiceApi.middleware,
      customerApi.middleware,
      purchaseApi.middleware,
      dashboardApi.middleware,
      reportsApi.middleware,
      companyApi.middleware,
      rolesApi.middleware,
      usersApi.middleware,
      hrApi.middleware,
      organizationApi.middleware,
      branchApi.middleware,
      membershipApi.middleware,
      subscriptionApi.middleware,
      userPreferencesApi.middleware,
      mobileShopApi.middleware,
      returnsApi.middleware,
    ),
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;


export default store;