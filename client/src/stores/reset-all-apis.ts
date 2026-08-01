import type { AppDispatch } from './store'
import { invoiceApi } from './invoice.api'
import { customerApi } from './customer.api'
import { purchaseApi } from './purchase.api'
import { purchaseOrderApi } from './purchaseOrder.api'
import { dashboardApi } from './dashboard.api'
import { reportsApi } from './reports.api'
import { companyApi } from './company.api'
import { rolesApi } from './roles.api'
import { usersApi } from './users.api'
import { hrApi } from './hr.api'
import { organizationApi } from './organization.api'
import { branchApi } from './branch.api'
import { membershipApi } from './membership.api'
import { subscriptionApi } from './subscription.api'
import { userPreferencesApi } from './user-preferences.api'
import { mobileShopApi } from './mobile-shop.api'
import { returnsApi } from './returns.api'
import { schoolApi } from './school.api'
import { expenseCategoryApi } from './expenseCategory.api'
import { customerAccountTypeApi } from './customerAccountType.api'
import { restaurantApi } from './restaurant.api'
import { whatsappApi } from './whatsapp.api'
import { whatsappCloudApi } from './whatsappCloud.api'
import { smsGatewayApi } from './smsGateway.api'
import { cashRegisterApi } from './cashRegister.api'
import { imeiApi } from './imei.api'
import { usedPhoneBuybackApi } from './usedPhoneBuyback.api'
import { insightApi } from './insight.api'
import { purchaseSuggestionsApi } from './purchaseSuggestions.api'
import { productAttributeApi } from './productAttribute.api'
import { productVariantApi } from './productVariant.api'
import { productApi } from './product.api'
import { inventoryApi } from './inventory.api'
import { batchApi } from './batch.api'
import { brandApi } from './brand.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { inventoryTransferApi } from './inventoryTransfer.api'
import { stockAdjustmentApi } from './stockAdjustment.api'
import { auditLogApi } from './auditLog.api'
import { aiAssistantApi } from './aiAssistant.api'
import { recurringExpenseApi } from './recurringExpense.api'
import { expenseApi } from './expense.api'

// Every RTK Query slice registered in store.ts — kept as a flat list so this stays a
// plain, dependency-free array of `.util.resetApiState` action creators, safely
// importable from both the login and logout code paths. Keep in sync with the
// `reducer`/`middleware` lists in store.ts when a new api slice is added.
const ALL_APIS = [
  invoiceApi, customerApi, purchaseApi, purchaseOrderApi, dashboardApi, reportsApi,
  companyApi, rolesApi, usersApi, hrApi, organizationApi, branchApi, membershipApi,
  subscriptionApi, userPreferencesApi, mobileShopApi, returnsApi, schoolApi,
  expenseCategoryApi, customerAccountTypeApi, restaurantApi, whatsappApi,
  whatsappCloudApi, smsGatewayApi, cashRegisterApi, imeiApi, usedPhoneBuybackApi,
  insightApi, purchaseSuggestionsApi, productAttributeApi, productVariantApi,
  productApi, inventoryApi, batchApi, brandApi, purchaseCatalogApi,
  inventoryTransferApi, stockAdjustmentApi, auditLogApi, aiAssistantApi,
  recurringExpenseApi, expenseApi,
]

/**
 * Clears every RTK Query cache: cached data, tags, and in-flight subscriptions.
 *
 * Call this whenever the authenticated identity changes (login or logout) in the
 * same browser tab. Login here is a client-side route transition, not a full page
 * reload, so the Redux store — and every RTK Query cache in it — survives across
 * accounts. A query keyed on `void` (no args), like getPurchasableCatalog, has no
 * argument change to trigger a refetch, so without this it keeps serving whatever
 * it cached under the *previous* session — a different user's branch-scoped data,
 * including data that user's own permissions shouldn't even show them again.
 */
export function resetAllApiCaches(dispatch: AppDispatch) {
  ALL_APIS.forEach((api) => dispatch(api.util.resetApiState()))
}
