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
import { purchaseOrderApi } from './purchaseOrder.api';
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
import { schoolApi } from './school.api';
import { expenseCategoryApi } from './expenseCategory.api';
import { customerAccountTypeApi } from './customerAccountType.api';
import { restaurantApi } from './restaurant.api';
import { whatsappApi } from './whatsapp.api';
import { whatsappCloudApi } from './whatsappCloud.api';
import { smsGatewayApi } from './smsGateway.api';
import { cashRegisterApi } from './cashRegister.api';
import { imeiApi } from './imei.api';
import { insightApi } from './insight.api';
import { purchaseSuggestionsApi } from './purchaseSuggestions.api';
import { productAttributeApi } from './productAttribute.api';
import { productVariantApi } from './productVariant.api';
import { productApi } from './product.api';
import { inventoryApi } from './inventory.api';
import { batchApi } from './batch.api';
import { brandApi } from './brand.api';
import { purchaseCatalogApi } from './purchaseCatalog.api';
import { inventoryTransferApi } from './inventoryTransfer.api';
import { auditLogApi } from './auditLog.api';
import { aiAssistantApi } from './aiAssistant.api';
import { recurringExpenseApi } from './recurringExpense.api';
import { expenseApi } from './expense.api';

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
    [purchaseOrderApi.reducerPath]: purchaseOrderApi.reducer,
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
    [schoolApi.reducerPath]: schoolApi.reducer,
    [expenseCategoryApi.reducerPath]: expenseCategoryApi.reducer,
    [customerAccountTypeApi.reducerPath]: customerAccountTypeApi.reducer,
    [restaurantApi.reducerPath]: restaurantApi.reducer,
    [whatsappApi.reducerPath]: whatsappApi.reducer,
    [whatsappCloudApi.reducerPath]: whatsappCloudApi.reducer,
    [smsGatewayApi.reducerPath]: smsGatewayApi.reducer,
    [cashRegisterApi.reducerPath]: cashRegisterApi.reducer,
    [imeiApi.reducerPath]: imeiApi.reducer,
    [insightApi.reducerPath]: insightApi.reducer,
    [purchaseSuggestionsApi.reducerPath]: purchaseSuggestionsApi.reducer,
    [productAttributeApi.reducerPath]: productAttributeApi.reducer,
    [productVariantApi.reducerPath]: productVariantApi.reducer,
    [productApi.reducerPath]: productApi.reducer,
    [inventoryApi.reducerPath]: inventoryApi.reducer,
    [batchApi.reducerPath]: batchApi.reducer,
    [brandApi.reducerPath]: brandApi.reducer,
    [purchaseCatalogApi.reducerPath]: purchaseCatalogApi.reducer,
    [inventoryTransferApi.reducerPath]: inventoryTransferApi.reducer,
    [auditLogApi.reducerPath]: auditLogApi.reducer,
    [aiAssistantApi.reducerPath]: aiAssistantApi.reducer,
    [recurringExpenseApi.reducerPath]: recurringExpenseApi.reducer,
    [expenseApi.reducerPath]: expenseApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      invoiceApi.middleware,
      customerApi.middleware,
      purchaseApi.middleware,
      purchaseOrderApi.middleware,
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
      schoolApi.middleware,
      expenseCategoryApi.middleware,
      customerAccountTypeApi.middleware,
      restaurantApi.middleware,
      whatsappApi.middleware,
      whatsappCloudApi.middleware,
      smsGatewayApi.middleware,
      cashRegisterApi.middleware,
      imeiApi.middleware,
      insightApi.middleware,
      purchaseSuggestionsApi.middleware,
      productAttributeApi.middleware,
      productVariantApi.middleware,
      productApi.middleware,
      inventoryApi.middleware,
      batchApi.middleware,
      brandApi.middleware,
      purchaseCatalogApi.middleware,
      inventoryTransferApi.middleware,
      auditLogApi.middleware,
      aiAssistantApi.middleware,
      recurringExpenseApi.middleware,
      expenseApi.middleware,
    ),
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;


export default store;