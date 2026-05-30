import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'
import { store } from '@/stores/store'
import {
  resolveWalletId,
  normalizeWalletResults,
  findWalletForNavigation,
  readWalletNavFromUrl,
  mergeWalletNavSearch,
  filterLoadWallets,
  filterCashWallets,
  isLoadWalletName,
  type WalletLike,
} from '@/features/mobile-shop/utils/wallet-utils'
import {
  WalletSelectionGrid,
  type WalletSelectionAction,
} from '@/features/mobile-shop/components/wallet-selection-grid'
import { MobilePageShell } from '../components/mobile-page-shell'
import {
  CustomerAccountTypePicker,
  resolveAccountTypeLabel,
} from '../components/customer-account-type-picker'
import { useGetCustomerAccountTypesQuery } from '@/stores/customerAccountType.api'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Checkbox } from '@/components/ui/checkbox'
import {
  mobileShopApi,
  useCreateLoadTransactionMutation,
  useGetLoadTransactionsQuery,
  useGetWalletsQuery,
  useCreateLoadPurchaseMutation,
  useGetLoadPurchasesQuery,
  useCreateCashWithdrawalMutation,
  useCreateCashWithdrawalsBatchMutation,
  useGetCashWithdrawalsQuery,
  useUpdateLoadPurchaseMutation,
  useDeleteLoadPurchaseMutation,
  useUpdateLoadTransactionMutation,
  useDeleteLoadTransactionMutation,
  useUpdateCashWithdrawalMutation,
  useDeleteCashWithdrawalMutation,
  useDeleteCashWithdrawalsBatchMutation,
} from '@/stores/mobile-shop.api'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { fetchAllSuppliers } from '@/stores/supplier.slice'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { ListPrintButton } from '@/features/mobile-shop/components/list-print-button'
import { MobileReceiptPreviewDialog } from '@/features/mobile-shop/components/mobile-receipt-preview-dialog'
import {
  buildBulkCashReceipt,
  buildCashWithdrawalReceipt,
  buildLoadPurchaseReceipt,
  buildLoadSaleReceipt,
} from '@/features/mobile-shop/utils/mobile-shop-receipt-builders'
import {
  MobileReceiptOffer,
  type MobileReceiptData,
} from '@/features/mobile-shop/components/mobile-shop-receipt'
import { printMobileShopReceipt } from '@/features/mobile-shop/utils/mobile-shop-print-utils'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import {
  CASH_MANAGEMENT_PAGE_HINT,
  cashTxLabel,
  cashTxLabelLower,
} from '@/features/mobile-shop/utils/cash-transaction-labels'
import {
  makeEnterChain,
  MOBILE_FORM_KEYBOARD_HINT,
  preventEnterSubmit,
  useCtrlEnterSubmit,
} from '@/lib/mobile-form-keyboard'

type PurchaseFormState = {
  walletId: string
  walletType: string
  savedSupplierId: string
  amount: string
  paidAmount: string
  supplierName: string
  paymentMethod: 'cash' | 'bank' | 'wallet'
  paymentWalletType: string
  commissionRate: string
  extraCharge: string
  date: string
}

/** Rupee fields: avoid float artifacts from wallet math; keep 2 decimal places. */
const roundMoney2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100

type LoadSaleFormState = {
  walletId: string
  walletType: string
  customerId: string
  customerName: string
  amount: string
  receivedAmount: string
  currentBalance: string
  commissionRate: string
  extraCharge: string
  paymentMethod: 'cash' | 'bank' | 'wallet'
  paymentWalletType: string
  mobileNumber: string
  date: string
}

type WithdrawalFormState = {
  walletId: string
  walletType: string
  amount: string
  cashAmount: string
  transactionType: 'withdrawal' | 'deposit'
  customerId: string
  customerName: string
  customerNumber: string
  customerAccountType: string
  commissionRate: string
  extraCharge: string
  notes: string
  date: string
}

type BulkWithdrawalEntry = {
  amount: string
  customerName: string
  customerNumber: string
  customerAccountType: string
  extraCharge: string
  notes: string
}

type BulkWithdrawalFormState = {
  walletId: string
  walletType: string
  transactionType: 'withdrawal' | 'deposit'
  commissionRate: string
  date: string
  entries: BulkWithdrawalEntry[]
}

const makeEmptyBulkEntry = (): BulkWithdrawalEntry => ({
  amount: '',
  customerName: '',
  customerNumber: '',
  customerAccountType: 'other',
  extraCharge: '0',
  notes: '',
})

const makeInitialBulkWithdrawalForm = (): BulkWithdrawalFormState => ({
  walletId: '',
  walletType: '',
  transactionType: 'withdrawal',
  commissionRate: '0',
  date: format(new Date(), 'yyyy-MM-dd'),
  entries: [makeEmptyBulkEntry()],
})

const initialPurchaseForm: PurchaseFormState = {
  walletId: '',
  walletType: '',
  savedSupplierId: '',
  amount: '0',
  paidAmount: '0',
  supplierName: '',
  paymentMethod: 'cash',
  paymentWalletType: '',
  commissionRate: '0',
  extraCharge: '0',
  date: format(new Date(), 'yyyy-MM-dd'),
}

const initialSaleForm: LoadSaleFormState = {
  walletId: '',
  walletType: '',
  customerId: '',
  customerName: '',
  amount: '0',
  receivedAmount: '0',
  currentBalance: '',
  commissionRate: '0',
  extraCharge: '0',
  paymentMethod: 'cash',
  paymentWalletType: '',
  mobileNumber: '',
  date: format(new Date(), 'yyyy-MM-dd'),
}

const initialWithdrawalForm: WithdrawalFormState = {
  walletId: '',
  walletType: '',
  amount: '0',
  cashAmount: '0',
  transactionType: 'withdrawal',
  customerId: '',
  customerName: '',
  customerNumber: '',
  customerAccountType: 'other',
  commissionRate: '0',
  extraCharge: '0',
  notes: '',
  date: format(new Date(), 'yyyy-MM-dd'),
}

function getCachedWalletsFromStore() {
  return normalizeWalletResults(
    mobileShopApi.endpoints.getWallets.select()(store.getState())?.data?.results,
  )
}

function buildPurchaseFormWithWallet(wallet: WalletLike): PurchaseFormState {
  return {
    ...initialPurchaseForm,
    walletId: resolveWalletId(wallet),
    walletType: wallet.type || '',
    commissionRate: String(wallet.commissionRate ?? 0),
  }
}

function buildSaleFormWithWallet(wallet: WalletLike): LoadSaleFormState {
  return {
    ...initialSaleForm,
    walletId: resolveWalletId(wallet),
    walletType: wallet.type || '',
    commissionRate: String(wallet.commissionRate ?? 0),
  }
}

function buildWithdrawalFormWithWallet(
  wallet: WalletLike,
  action?: 'withdrawal' | 'deposit',
): WithdrawalFormState {
  const txType = action === 'deposit' ? 'deposit' : 'withdrawal'
  const rate =
    txType === 'withdrawal'
      ? String(wallet.withdrawalCommissionRate ?? 0)
      : String(wallet.depositCommissionRate ?? 0)
  return {
    ...initialWithdrawalForm,
    walletId: resolveWalletId(wallet),
    walletType: wallet.type || '',
    transactionType: txType,
    commissionRate: rate,
  }
}

type LoadManagementPageProps = {
  mode?: 'load' | 'cash-management'
  initialWalletId?: string
  initialWalletType?: string
  initialTab?: 'purchase' | 'sell'
  initialAction?: 'withdrawal' | 'deposit'
}

export default function LoadManagementPage({
  mode = 'load',
  initialWalletId,
  initialWalletType,
  initialTab,
  initialAction,
}: LoadManagementPageProps) {
  const isCashManagementMode = mode === 'cash-management'
  const navigate = useNavigate()
  const dispatch = useDispatch<any>()
  const { data: customerAccountTypes = [] } = useGetCustomerAccountTypesQuery()

  const routerSearch = useRouterState({
    select: (state) => state.location.search,
  }) as {
    walletId?: string
    walletType?: string
    tab?: 'purchase' | 'sell'
    action?: 'withdrawal' | 'deposit'
  }

  const mergedNav = mergeWalletNavSearch(readWalletNavFromUrl(), {
    walletId: routerSearch?.walletId ?? initialWalletId,
    walletType: routerSearch?.walletType ?? initialWalletType,
    tab: routerSearch?.tab ?? initialTab,
    action: routerSearch?.action ?? initialAction,
  })

  const navWalletId = mergedNav.walletId
  const navWalletType = mergedNav.walletType
  const navAction = mergedNav.action
  const navTab = mergedNav.tab
  const hasNavWalletTarget = Boolean(navWalletId?.trim() || navWalletType?.trim())

  const { data: walletsData, isLoading: walletsLoading } = useGetWalletsQuery(undefined, {
    refetchOnMountOrArgChange: false,
  })

  const wallets = useMemo(
    () => normalizeWalletResults(walletsData?.results),
    [walletsData?.results],
  )

  const pageWallets = useMemo(
    () => (isCashManagementMode ? filterCashWallets(wallets) : filterLoadWallets(wallets)),
    [wallets, isCashManagementMode],
  )

  const resolveNavWallet = (list: WalletLike[]) =>
    findWalletForNavigation(list, navWalletId, navWalletType)

  const navWallet = useMemo(
    () => (hasNavWalletTarget ? resolveNavWallet(wallets) : undefined),
    [hasNavWalletTarget, navWalletId, navWalletType, wallets],
  )

  const navWalletMatchesPage = useMemo(() => {
    if (!navWallet) return false
    const load = isLoadWalletName(navWallet.type || '')
    return isCashManagementMode ? !load : load
  }, [navWallet, isCashManagementMode])

  const showWalletPicker = !hasNavWalletTarget || !navWalletMatchesPage

  const managementPath = isCashManagementMode
    ? '/mobile-shop/cash-management'
    : '/mobile-shop/load'

  const applyWalletToForms = (
    wallet: WalletLike,
    opts?: { tab?: 'purchase' | 'sell'; action?: 'withdrawal' | 'deposit' },
  ) => {
    const walletId = resolveWalletId(wallet) || navWalletId?.trim() || ''
    const walletType = wallet.type?.trim() || navWalletType || ''

    if (isCashManagementMode) {
      const txAction = opts?.action ?? navAction ?? 'withdrawal'
      const next = buildWithdrawalFormWithWallet(wallet, txAction)
      setWithdrawalForm(next)
      setBulkWithdrawalForm((prev) => ({
        ...prev,
        walletId: next.walletId || walletId,
        walletType: next.walletType || walletType,
        transactionType: next.transactionType,
        commissionRate: next.commissionRate,
      }))
      setActiveTab('withdrawal')
      return
    }

    const tab = opts?.tab ?? (navTab === 'purchase' ? 'purchase' : 'sell')
    setActiveTab(tab)
    const commission = String(wallet.commissionRate ?? 0)
    setPurchaseForm((prev) => {
      if (prev.walletId === walletId && prev.walletType === walletType && prev.commissionRate === commission) {
        return prev
      }
      return { ...prev, walletId, walletType, commissionRate: commission }
    })
    setSaleForm((prev) => {
      if (prev.walletId === walletId && prev.walletType === walletType && prev.commissionRate === commission) {
        return prev
      }
      return { ...prev, walletId, walletType, commissionRate: commission }
    })
  }

  const selectWallet = (wallet: WalletLike, action?: WalletSelectionAction) => {
    const walletId = resolveWalletId(wallet)
    const walletType = wallet.type?.trim()
    if (!walletId && !walletType) return

    const tab = action && 'tab' in action ? action.tab : undefined
    const txAction = action && 'action' in action ? action.action : undefined

    applyWalletToForms(wallet, { tab, action: txAction })

    navigate({
      to: managementPath,
      search: {
        walletId: walletId || undefined,
        walletType: walletType || undefined,
        ...(isCashManagementMode
          ? { action: txAction ?? 'withdrawal' }
          : { tab: tab ?? 'sell' }),
      },
    })
  }

  const handleLoadTabChange = (value: string) => {
    setActiveTab(value)
    if (!navWallet || isCashManagementMode) return
    const tab = value === 'purchase' ? 'purchase' : 'sell'
    applyWalletToForms(navWallet, { tab })
    navigate({
      to: managementPath,
      search: {
        walletId: resolveWalletId(navWallet) || navWalletId || undefined,
        walletType: navWallet.type?.trim() || navWalletType || undefined,
        tab,
      },
    })
  }

  const clearWalletSelection = () => {
    navigate({ to: managementPath, search: {} })
  }

  const navWalletAtInit =
    resolveNavWallet(getCachedWalletsFromStore()) ?? resolveNavWallet(wallets)

  const initialActiveTab = isCashManagementMode
    ? 'withdrawal'
    : navTab === 'purchase'
      ? 'purchase'
      : 'sell'

  const [activeTab, setActiveTab] = useState(initialActiveTab)

  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(() => {
    if (isCashManagementMode || navTab === 'sell' || !navWalletAtInit) return initialPurchaseForm
    return buildPurchaseFormWithWallet(navWalletAtInit)
  })
  const [saleForm, setSaleForm] = useState<LoadSaleFormState>(() => {
    if (isCashManagementMode || navTab === 'purchase' || !navWalletAtInit) return initialSaleForm
    return buildSaleFormWithWallet(navWalletAtInit)
  })
  const [isPurchasePaidAmountManual, setIsPurchasePaidAmountManual] = useState(false)
  const [isSaleReceivedAmountManual, setIsSaleReceivedAmountManual] = useState(false)
  const [withdrawalForm, setWithdrawalForm] = useState<WithdrawalFormState>(() => {
    if (!isCashManagementMode || !navWalletAtInit) return initialWithdrawalForm
    return buildWithdrawalFormWithWallet(navWalletAtInit, navAction)
  })
  const [isWithdrawalCashAmountManual, setIsWithdrawalCashAmountManual] = useState(false)
  const [withdrawalEntryMode, setWithdrawalEntryMode] = useState<'single' | 'bulk'>('single')
  const [bulkWithdrawalForm, setBulkWithdrawalForm] = useState<BulkWithdrawalFormState>(() => {
    if (!isCashManagementMode || !navWalletAtInit) return makeInitialBulkWithdrawalForm()
    const base = buildWithdrawalFormWithWallet(navWalletAtInit, navAction)
    return {
      ...makeInitialBulkWithdrawalForm(),
      walletId: base.walletId,
      walletType: base.walletType,
      transactionType: base.transactionType,
      commissionRate: base.commissionRate,
    }
  })

  const selectedPurchaseWalletId =
    purchaseForm.walletId || (navWallet ? resolveWalletId(navWallet) : '')
  const selectedSaleWalletId =
    saleForm.walletId || (navWallet ? resolveWalletId(navWallet) : '')
  const selectedWithdrawalWalletId =
    withdrawalForm.walletId || (navWallet ? resolveWalletId(navWallet) : '')
  const selectedBulkWalletId =
    bulkWithdrawalForm.walletId || (navWallet ? resolveWalletId(navWallet) : '')

  // Pagination state for each history table
  const [purchasePage, setPurchasePage] = useState(1)
  const [purchaseLimit, setPurchaseLimit] = useState(10)
  const [transactionPage, setTransactionPage] = useState(1)
  const [transactionLimit, setTransactionLimit] = useState(10)
  const [withdrawalPage, setWithdrawalPage] = useState(1)
  const [withdrawalLimit, setWithdrawalLimit] = useState(10)

  const [createLoadPurchase, { isLoading: isSavingPurchase }] = useCreateLoadPurchaseMutation()
  const [createLoadTransaction, { isLoading: isSavingSale }] = useCreateLoadTransactionMutation()
  const [createCashWithdrawal, { isLoading: isSavingWithdrawal }] = useCreateCashWithdrawalMutation()
  const [createCashWithdrawalsBatch, { isLoading: isSavingBulk }] = useCreateCashWithdrawalsBatchMutation()
  const [updateLoadPurchase] = useUpdateLoadPurchaseMutation()
  const [deleteLoadPurchase] = useDeleteLoadPurchaseMutation()
  const [updateLoadTransaction] = useUpdateLoadTransactionMutation()
  const [deleteLoadTransaction] = useDeleteLoadTransactionMutation()
  const [updateCashWithdrawal] = useUpdateCashWithdrawalMutation()
  const [deleteCashWithdrawal] = useDeleteCashWithdrawalMutation()
  const [deleteCashWithdrawalsBatch, { isLoading: isDeletingBatch }] = useDeleteCashWithdrawalsBatchMutation()

  // Bulk selection state
  const [selectedWithdrawalIds, setSelectedWithdrawalIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)

  // Edit state
  const [editingPurchase, setEditingPurchase] = useState<any>(null)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
  const [editingWithdrawal, setEditingWithdrawal] = useState<any>(null)

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'purchase' | 'transaction' | 'withdrawal'; id: string } | null>(null)

  const [savedReceipt, setSavedReceipt] = useState<MobileReceiptData | null>(null)
  const [previewReceipt, setPreviewReceipt] = useState<MobileReceiptData | null>(null)
  const { data: org } = useGetMyOrganizationQuery()
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })

  const { data: customersData } = useGetAllCustomersQuery(undefined)
  const suppliersRedux = useSelector((state: RootState) => state.supplier.data)
  const { data: purchasesData } = useGetLoadPurchasesQuery({ page: purchasePage, limit: purchaseLimit })
  const { data: transactionsData } = useGetLoadTransactionsQuery({ page: transactionPage, limit: transactionLimit })
  const { data: withdrawalsData } = useGetCashWithdrawalsQuery({ page: withdrawalPage, limit: withdrawalLimit })

  const customers = Array.isArray(customersData) ? customersData : []
  const suppliers = Array.isArray(suppliersRedux) ? suppliersRedux : []
  const purchases = purchasesData?.results ?? []
  const transactions = transactionsData?.results ?? []
  const withdrawals = withdrawalsData?.results ?? []

  useEffect(() => {
    if (!suppliers.length) {
      dispatch(fetchAllSuppliers({}))
    }
  }, [dispatch, suppliers.length])

  useLayoutEffect(() => {
    if (showWalletPicker || !navWallet) return
    applyWalletToForms(navWallet, {
      tab: navTab === 'purchase' ? 'purchase' : 'sell',
      action: navAction,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync forms when URL wallet changes
  }, [
    showWalletPicker,
    navWalletId,
    navWalletType,
    navTab,
    navAction,
    isCashManagementMode,
    wallets.length,
  ])

  const formatWalletSelectLabel = (walletId: string, fallbackType?: string) => {
    const wallet = wallets.find((w) => resolveWalletId(w) === walletId)
    if (wallet) {
      return `${wallet.type} (Rs ${Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})`
    }
    return fallbackType || ''
  }

  const purchaseProfit = useMemo(() => {
    const amount = Number(purchaseForm.amount) || 0
    const commissionRate = Number(purchaseForm.commissionRate) || 0
    const extraCharge = Number(purchaseForm.extraCharge) || 0
    const commissionProfit = (amount * commissionRate) / 100
    return { commissionProfit, total: commissionProfit + extraCharge }
  }, [purchaseForm.amount, purchaseForm.commissionRate, purchaseForm.extraCharge])

  const purchaseLedgerSummary = useMemo(() => {
    const amount = Number(purchaseForm.amount) || 0
    const paidAmount = Number(purchaseForm.paidAmount) || 0
    const normalizedPaidAmount = Math.max(0, Math.min(paidAmount, amount))
    return {
      paidAmount: normalizedPaidAmount,
      remainingAmount: Math.max(0, amount - normalizedPaidAmount),
    }
  }, [purchaseForm.amount, purchaseForm.paidAmount])

  const saleLedgerSummary = useMemo(() => {
    const amount = Number(saleForm.amount) || 0
    const receivedAmount = Number(saleForm.receivedAmount) || 0
    const normalizedReceivedAmount = Math.max(0, Math.min(receivedAmount, amount))
    return {
      receivedAmount: normalizedReceivedAmount,
      remainingAmount: Math.max(0, amount - normalizedReceivedAmount),
    }
  }, [saleForm.amount, saleForm.receivedAmount])

  const canEditPurchasePaidAmount = Boolean(purchaseForm.savedSupplierId)
  const canEditSaleReceivedAmount = Boolean(saleForm.customerId)
  const selectedSalePaymentWallet = wallets.find((w) => w.type === saleForm.paymentWalletType)

  const withdrawalProfit = useMemo(() => {
    const amount = Number(withdrawalForm.amount) || 0
    const cashAmount = Number(withdrawalForm.cashAmount) || 0
    const commissionRate = Number(withdrawalForm.commissionRate) || 0
    const extraCharge = Number(withdrawalForm.extraCharge) || 0
    const commissionProfit = (amount * commissionRate) / 100
    const normalizedCashAmount = Math.max(0, cashAmount)
    const remainingAmount = Math.max(0, amount - normalizedCashAmount)
    const settlementProfit = withdrawalForm.transactionType === 'withdrawal'
      ? Math.max(0, amount - normalizedCashAmount)
      : Math.max(0, normalizedCashAmount - amount)
    return {
      commissionProfit,
      remainingAmount,
      normalizedCashAmount,
      settlementProfit,
      totalProfit: commissionProfit + extraCharge + settlementProfit,
    }
  }, [withdrawalForm.amount, withdrawalForm.cashAmount, withdrawalForm.commissionRate, withdrawalForm.extraCharge, withdrawalForm.transactionType])
  // const requiresFullCashSettlement = !withdrawalForm.customerId

  const bulkWithdrawalTotals = useMemo(() => {
    const commissionRate = Number(bulkWithdrawalForm.commissionRate) || 0
    let totalAmount = 0
    let totalProfit = 0
    let validCount = 0
    for (const e of bulkWithdrawalForm.entries) {
      const amount = Number(e.amount) || 0
      const extraCharge = Number(e.extraCharge) || 0
      if (amount > 0) {
        totalAmount += amount
        totalProfit += (amount * commissionRate) / 100 + extraCharge
        validCount++
      }
    }
    return { totalAmount, totalProfit, validCount }
  }, [bulkWithdrawalForm.entries, bulkWithdrawalForm.commissionRate])

  const handlePurchaseChange = (field: keyof PurchaseFormState, value: string) => {
    if (field === 'savedSupplierId') {
      const normalizedValue = value === '__none__' ? '' : value
      const selectedSupplier = suppliers.find((s: any) => s.id === normalizedValue || s._id === normalizedValue || s.value === normalizedValue)
      setPurchaseForm(prev => ({
        ...prev,
        savedSupplierId: normalizedValue,
        supplierName: selectedSupplier?.name || '',
        paidAmount: normalizedValue ? prev.paidAmount : prev.amount,
      }))
      setIsPurchasePaidAmountManual(false)
      return
    }
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => resolveWalletId(w) === value)
      setPurchaseForm(prev => ({
        ...prev,
        walletId: value,
        walletType: selectedWallet?.type || '',
        commissionRate: selectedWallet ? String(selectedWallet.commissionRate ?? 0) : prev.commissionRate,
      }))
    } else {
      setPurchaseForm(prev => {
        const next = { ...prev, [field]: value }
        if (field === 'paymentMethod' && value !== 'wallet') {
          next.paymentWalletType = ''
        }
        if (field === 'amount') {
          const amount = Number(value) || 0
          if (!isPurchasePaidAmountManual) {
            next.paidAmount = String(amount)
          } else {
            const currentPaid = Number(prev.paidAmount) || 0
            next.paidAmount = String(Math.max(0, Math.min(currentPaid, amount)))
          }
        }
        return next
      })
    }
  }

  const handleSaleChange = (field: keyof LoadSaleFormState, value: string) => {
    if (field === 'customerId') {
      const normalizedValue = value === '__none__' ? '' : value
      const selectedCustomer = customers.find((c: any) => c.id === normalizedValue || c._id === normalizedValue)
      setSaleForm(prev => ({
        ...prev,
        customerId: normalizedValue,
        customerName: selectedCustomer?.name || '',
        receivedAmount: normalizedValue ? prev.receivedAmount : prev.amount,
      }))
      setIsSaleReceivedAmountManual(false)
      return
    }
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => resolveWalletId(w) === value)
      setSaleForm(prev => ({
        ...prev,
        walletId: value,
        walletType: selectedWallet?.type || '',
        commissionRate: selectedWallet ? String(selectedWallet.commissionRate ?? 0) : prev.commissionRate,
        currentBalance: '',
      }))
      return
    }
    if (field === 'paymentMethod') {
      setSaleForm((prev) => ({
        ...prev,
        paymentMethod: value as LoadSaleFormState['paymentMethod'],
        paymentWalletType: value === 'wallet' ? prev.paymentWalletType : '',
      }))
      return
    }
    if (field === 'paymentWalletType') {
      const normalizedValue = value === '__none__' ? '' : value
      setSaleForm((prev) => ({ ...prev, paymentWalletType: normalizedValue }))
      return
    }
    if (field === 'currentBalance') {
      setSaleForm(prev => {
        const selectedWallet = wallets.find(w => resolveWalletId(w) === prev.walletId)
        const walletBalance = Number(selectedWallet?.balance ?? 0)
        const currentBal = Number(value) || 0
        const calculatedAmount = walletBalance - currentBal
        const amountRounded = calculatedAmount > 0 ? roundMoney2(calculatedAmount) : 0
        const amountStr = amountRounded > 0 ? String(amountRounded) : '0'
        let nextReceived = prev.receivedAmount
        if (!prev.customerId || !isSaleReceivedAmountManual) {
          nextReceived = amountStr
        } else {
          const currentReceived = roundMoney2(Number(prev.receivedAmount) || 0)
          nextReceived = String(Math.max(0, Math.min(currentReceived, amountRounded)))
        }
        return {
          ...prev,
          currentBalance: value,
          amount: amountStr,
          receivedAmount: nextReceived,
        }
      })
      return
    }
    setSaleForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'amount') {
        const amount = roundMoney2(Number(value) || 0)
        if (!isSaleReceivedAmountManual) {
          next.receivedAmount = String(amount)
        } else {
          const currentReceived = roundMoney2(Number(prev.receivedAmount) || 0)
          next.receivedAmount = String(Math.max(0, Math.min(currentReceived, amount)))
        }
      }
      return next
    })
  }

  const handleWithdrawalChange = (field: keyof WithdrawalFormState, value: string) => {
    if (field === 'customerId') {
      const normalizedValue = value === '__none__' ? '' : value
      const selectedCustomer = customers.find((c: any) => c.id === normalizedValue || c._id === normalizedValue)
      setWithdrawalForm(prev => ({
        ...prev,
        customerId: normalizedValue,
        customerName: selectedCustomer?.name || prev.customerName,
      }))
      return
    }
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => resolveWalletId(w) === value)
      setWithdrawalForm(prev => {
        const rate = prev.transactionType === 'withdrawal'
          ? String(selectedWallet?.withdrawalCommissionRate ?? 0)
          : String(selectedWallet?.depositCommissionRate ?? 0)
        return {
          ...prev,
          walletId: value,
          walletType: selectedWallet?.type || '',
          commissionRate: selectedWallet ? rate : prev.commissionRate,
        }
      })
      return
    }
    if (field === 'transactionType') {
      const selectedWallet = wallets.find(w => resolveWalletId(w) === withdrawalForm.walletId)
      const rate = value === 'withdrawal'
        ? String(selectedWallet?.withdrawalCommissionRate ?? 0)
        : String(selectedWallet?.depositCommissionRate ?? 0)
      setWithdrawalForm(prev => ({
        ...prev,
        transactionType: value as 'withdrawal' | 'deposit',
        commissionRate: selectedWallet ? rate : prev.commissionRate,
      }))
      return
    }
    setWithdrawalForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'amount') {
        const amount = Number(value) || 0
        if (!isWithdrawalCashAmountManual) {
          next.cashAmount = String(amount)
        } else {
          const currentCash = Number(prev.cashAmount) || 0
          next.cashAmount = String(Math.max(0, currentCash))
        }
      }
      return next
    })
  }

  const handlePurchaseSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!purchaseForm.walletId) { toast.error('Please select a wallet'); return }
    if (!purchaseForm.amount || Number(purchaseForm.amount) <= 0) { toast.error('Please enter a valid amount'); return }
    if (purchaseForm.paymentMethod === 'wallet' && !purchaseForm.paymentWalletType) { toast.error('Please select payment wallet'); return }
    try {
      const created = await createLoadPurchase({
        walletType: purchaseForm.walletType,
        supplierId: purchaseForm.savedSupplierId || undefined,
        amount: Number(purchaseForm.amount),
        paidAmount: purchaseLedgerSummary.paidAmount,
        supplierName: purchaseForm.supplierName.trim() || undefined,
        paymentMethod: purchaseForm.paymentMethod as 'cash' | 'bank' | 'wallet',
        paymentWalletType: purchaseForm.paymentMethod === 'wallet' ? purchaseForm.paymentWalletType : undefined,
        commissionRate: Number(purchaseForm.commissionRate),
        extraCharge: Number(purchaseForm.extraCharge),
        date: purchaseForm.date ? new Date(purchaseForm.date).toISOString() : new Date().toISOString(),
      }).unwrap()
      toast.success('Load purchase recorded!')
      setSavedReceipt(buildLoadPurchaseReceipt(created))
      setPurchaseForm(initialPurchaseForm)
      setIsPurchasePaidAmountManual(false)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save load purchase')
    }
  }

  const handleSaleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!saleForm.walletId) { toast.error('Please select a wallet'); return }
    if (!saleForm.amount || Number(saleForm.amount) <= 0) { toast.error('Please enter a valid amount'); return }
    if (!saleForm.walletType) { toast.error('Selected wallet is invalid'); return }
    if (saleForm.paymentMethod === 'wallet' && !saleForm.paymentWalletType) { toast.error('Please select payment wallet'); return }
    try {
      const sold = await createLoadTransaction({
        walletId: saleForm.walletId,
        walletType: saleForm.walletType,
        customerId: saleForm.customerId || undefined,
        customerName: saleForm.customerName || undefined,
        amount: Number(saleForm.amount),
        receivedAmount: saleLedgerSummary.receivedAmount,
        commissionRate: Number(saleForm.commissionRate),
        extraCharge: Number(saleForm.extraCharge),
        mobileNumber: saleForm.mobileNumber || 'N/A',
        date: saleForm.date ? new Date(saleForm.date).toISOString() : new Date().toISOString(),
        type: 'normal',
        network: 'none',
        paymentMethod: saleForm.paymentMethod,
        paymentWalletType: saleForm.paymentMethod === 'wallet' ? saleForm.paymentWalletType : undefined,
      }).unwrap()
      toast.success('Load sold successfully!')
      setSavedReceipt(buildLoadSaleReceipt(sold))
      setSaleForm(initialSaleForm)
      setIsSaleReceivedAmountManual(false)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save load transaction')
    }
  }

  const handleWithdrawalSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!withdrawalForm.walletId) { toast.error('Please select a wallet'); return }
    if (!withdrawalForm.amount || Number(withdrawalForm.amount) <= 0) { toast.error('Please enter a valid amount'); return }
    if (!withdrawalForm.walletType) { toast.error('Selected wallet is invalid'); return }
    if (withdrawalProfit.normalizedCashAmount > Number(withdrawalForm.amount || 0)) {
      toast.error('Cash paid/received must be less than or equal to amount')
      return
    }
    try {
      const cw = await createCashWithdrawal({
        walletId: withdrawalForm.walletId,
        walletType: withdrawalForm.walletType,
        amount: Number(withdrawalForm.amount),
        cashAmount: withdrawalProfit.normalizedCashAmount,
        transactionType: withdrawalForm.transactionType,
        customerId: withdrawalForm.customerId || undefined,
        customerName: withdrawalForm.customerName.trim() || undefined,
        customerNumber: withdrawalForm.customerNumber.trim() || undefined,
        customerAccountType: withdrawalForm.customerAccountType || undefined,
        commissionRate: Number(withdrawalForm.commissionRate),
        extraCharge: Number(withdrawalForm.extraCharge),
        notes: withdrawalForm.notes.trim() || undefined,
        date: withdrawalForm.date ? new Date(withdrawalForm.date).toISOString() : new Date().toISOString(),
      }).unwrap()
      toast.success('Cash transaction recorded!')
      setSavedReceipt(buildCashWithdrawalReceipt(cw))
      const prevType = withdrawalForm.transactionType
      const prevWalletId = withdrawalForm.walletId
      const prevWalletType = withdrawalForm.walletType
      const prevCommission = withdrawalForm.commissionRate
      const prevDate = withdrawalForm.date
      setWithdrawalForm({
        walletId: prevWalletId,
        walletType: prevWalletType,
        amount: '0',
        cashAmount: '0',
        transactionType: prevType,
        customerId: '',
        customerName: '',
        customerNumber: '',
        customerAccountType: 'other',
        commissionRate: prevCommission,
        extraCharge: '0',
        notes: '',
        date: prevDate,
      })
      setIsWithdrawalCashAmountManual(false)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save cash transaction')
    }
  }

  const purchaseFormRef = useRef<HTMLFormElement>(null)
  const saleFormRef = useRef<HTMLFormElement>(null)
  const withdrawalFormRef = useRef<HTMLFormElement>(null)

  const purchaseEnter = useMemo(
    () =>
      makeEnterChain(
        [
          'purchase-wallet',
          'supplier',
          'purchase-supplier',
          'purchase-amount',
          'purchase-paid-amount',
          'purchase-payment-method',
          'purchase-commission',
          'purchase-extra',
          'purchase-date',
        ],
        { onSubmit: () => purchaseFormRef.current?.requestSubmit(), scopeRef: purchaseFormRef },
      ),
    [],
  )

  const saleEnter = useMemo(
    () =>
      makeEnterChain(
        [
          'sale-wallet',
          'current-balance',
          'sale-customer',
          'sale-amount',
          'sale-received',
          'commission',
          'extra',
          'sale-payment-method',
          'phone',
          'sale-date',
        ],
        { onSubmit: () => saleFormRef.current?.requestSubmit(), scopeRef: saleFormRef },
      ),
    [],
  )

  const withdrawalEnter = useMemo(
    () =>
      makeEnterChain(
        [
          'withdrawal-wallet',
          'withdrawal-amount',
          'withdrawal-customer',
          'customer-name',
          'customer-number',
          'customer-account-type',
          'withdrawal-cash-amount',
          'withdrawal-commission',
          'withdrawal-extra',
          'withdrawal-notes',
          'withdrawal-date',
        ],
        { onSubmit: () => withdrawalFormRef.current?.requestSubmit(), scopeRef: withdrawalFormRef },
      ),
    [],
  )

  useCtrlEnterSubmit(() => {
    if (isCashManagementMode) {
      withdrawalFormRef.current?.requestSubmit()
      return
    }
    const activePanel = document.querySelector('[role="tabpanel"][data-state="active"] form[data-mobile-form]')
    ;(activePanel as HTMLFormElement | null)?.requestSubmit()
  }, isSavingPurchase || isSavingSale || isSavingWithdrawal)

  useEffect(() => {
    window.setTimeout(() => {
      if (isCashManagementMode) {
        withdrawalEnter.focusFirst()
      } else {
        saleEnter.focusFirst()
      }
    }, 80)
  }, [isCashManagementMode, saleEnter, withdrawalEnter])

  // ─── Bulk Withdrawal Handlers ───
  const handleBulkWithdrawalWalletChange = (walletId: string) => {
    const selectedWallet = wallets.find(w => resolveWalletId(w) === walletId)
    setBulkWithdrawalForm(prev => {
      const rate = prev.transactionType === 'withdrawal'
        ? String(selectedWallet?.withdrawalCommissionRate ?? 0)
        : String(selectedWallet?.depositCommissionRate ?? 0)
      return {
        ...prev,
        walletId,
        walletType: selectedWallet?.type || '',
        commissionRate: selectedWallet ? rate : prev.commissionRate,
      }
    })
  }

  const handleBulkWithdrawalTypeChange = (transactionType: 'withdrawal' | 'deposit') => {
    const selectedWallet = wallets.find(w => resolveWalletId(w) === bulkWithdrawalForm.walletId)
    const rate = transactionType === 'withdrawal'
      ? String(selectedWallet?.withdrawalCommissionRate ?? 0)
      : String(selectedWallet?.depositCommissionRate ?? 0)
    setBulkWithdrawalForm(prev => ({
      ...prev,
      transactionType,
      commissionRate: selectedWallet ? rate : prev.commissionRate,
    }))
  }

  const handleBulkEntryChange = (index: number, field: keyof BulkWithdrawalEntry, value: string) => {
    setBulkWithdrawalForm(prev => {
      const entries = [...prev.entries]
      entries[index] = { ...entries[index], [field]: value }
      return { ...prev, entries }
    })
  }

  const addBulkEntry = (focusIndex?: number) => {
    setBulkWithdrawalForm(prev => ({ ...prev, entries: [...prev.entries, makeEmptyBulkEntry()] }))
    const newIdx = focusIndex ?? -1
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-bulk-amount="${newIdx === -1 ? '' : newIdx}"]`)
      el?.focus()
    }, 30)
  }

  const handleBulkEntryKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const isLastRow = idx === bulkWithdrawalForm.entries.length - 1
      if (isLastRow) {
        setBulkWithdrawalForm(prev => ({ ...prev, entries: [...prev.entries, makeEmptyBulkEntry()] }))
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>(`[data-bulk-amount="${idx + 1}"]`)
          el?.focus()
        }, 30)
      } else {
        const el = document.querySelector<HTMLInputElement>(`[data-bulk-amount="${idx + 1}"]`)
        el?.focus()
      }
    }
  }

  const removeBulkEntry = (index: number) => {
    setBulkWithdrawalForm(prev => ({
      ...prev,
      entries: prev.entries.filter((_, i) => i !== index),
    }))
  }

  const handleBulkWithdrawalSubmit = async () => {
    if (!bulkWithdrawalForm.walletId) { toast.error('Please select a wallet'); return }
    const validEntries = bulkWithdrawalForm.entries.filter(e => parseFloat(e.amount) > 0)
    if (validEntries.length === 0) { toast.error('Enter at least one valid amount'); return }
    if (bulkWithdrawalForm.transactionType === 'deposit') {
      const selectedWallet = wallets.find(w => resolveWalletId(w) === bulkWithdrawalForm.walletId)
      const totalAmount = validEntries.reduce((sum, e) => sum + Number(e.amount), 0)
      const walletBalance = Number(selectedWallet?.balance ?? 0)
      if (totalAmount > walletBalance) {
        toast.error(`${bulkWithdrawalForm.walletType || 'Wallet'} wallet balance is insufficient`)
        return
      }
    }
    try {
      const batchWalletType = bulkWithdrawalForm.walletType
      const batchTxType = bulkWithdrawalForm.transactionType
      const batchDate = bulkWithdrawalForm.date
      const createdRows = await createCashWithdrawalsBatch({
        walletId: bulkWithdrawalForm.walletId,
        walletType: bulkWithdrawalForm.walletType,
        transactionType: bulkWithdrawalForm.transactionType,
        commissionRate: Number(bulkWithdrawalForm.commissionRate) || 0,
        date: new Date(bulkWithdrawalForm.date).toISOString(),
        entries: validEntries.map(e => ({
          amount: Number(e.amount),
          customerName: e.customerName.trim() || undefined,
          customerNumber: e.customerNumber.trim() || undefined,
          customerAccountType: e.customerAccountType || undefined,
          extraCharge: Number(e.extraCharge) || 0,
          notes: e.notes.trim() || undefined,
        })),
      }).unwrap()
      toast.success(`${validEntries.length} ${cashTxLabelLower(bulkWithdrawalForm.transactionType)} entries saved!`)
      setSavedReceipt(
        buildBulkCashReceipt({
          transactionType: batchTxType,
          walletType: batchWalletType,
          date: batchDate,
          rows: createdRows.map((row) => ({
            amount: row.amount,
            customerName: row.customerName,
          })),
        }),
      )
      // Preserve wallet, type, commission and date — only clear entries
      setBulkWithdrawalForm(prev => ({ ...prev, entries: [makeEmptyBulkEntry()] }))
      // Focus first amount field of the fresh row
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>('[data-bulk-amount="0"]')
        el?.focus()
      }, 50)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save entries')
    }
  }

  // ─── Bulk Delete Handlers ───
  const toggleWithdrawalSelection = (id: string) => {
    setSelectedWithdrawalIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllWithdrawals = () => {
    if (selectedWithdrawalIds.size === withdrawals.length) {
      setSelectedWithdrawalIds(new Set())
    } else {
      setSelectedWithdrawalIds(new Set(withdrawals.map(w => w.id)))
    }
  }

  const confirmBulkDelete = async () => {
    if (selectedWithdrawalIds.size === 0) return
    try {
      const result = await deleteCashWithdrawalsBatch({ ids: Array.from(selectedWithdrawalIds) }).unwrap()
      toast.success(`${result.deleted} transaction(s) deleted${result.failed > 0 ? `, ${result.failed} failed` : ''}`)
      setSelectedWithdrawalIds(new Set())
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete transactions')
    } finally {
      setBulkDeleteConfirm(false)
    }
  }

  // ─── Edit / Delete Handlers ───
  const handleEditPurchase = (p: any) => {
    const purchaseSupplierId = p.supplierId?.id || p.supplierId?._id || p.supplierId || ''
    setPurchaseForm({
      walletId: resolveWalletId(wallets.find(w => w.type === p.walletType)) || '',
      walletType: p.walletType,
      savedSupplierId: purchaseSupplierId || suppliers.find((s: any) => s.name === p.supplierName)?.id || suppliers.find((s: any) => s.name === p.supplierName)?._id || '',
      amount: String(p.amount),
      paidAmount: String((p as any).paidAmount ?? p.amount ?? 0),
      supplierName: p.supplierName || '',
      paymentMethod: p.paymentMethod || 'cash',
      paymentWalletType: p.paymentWalletType || '',
      commissionRate: String(p.commissionRate || 0),
      extraCharge: String(p.extraCharge || 0),
      date: format(new Date(p.date), 'yyyy-MM-dd'),
    })
    setIsPurchasePaidAmountManual(true)
    setEditingPurchase(p)
  }

  const handleUpdatePurchase = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingPurchase) return
    try {
      await updateLoadPurchase({
        id: editingPurchase.id,
        body: {
          walletType: purchaseForm.walletType,
          supplierId: purchaseForm.savedSupplierId || undefined,
          amount: Number(purchaseForm.amount),
          paidAmount: purchaseLedgerSummary.paidAmount,
          supplierName: purchaseForm.supplierName.trim() || undefined,
          paymentMethod: purchaseForm.paymentMethod as 'cash' | 'bank' | 'wallet',
          paymentWalletType: purchaseForm.paymentMethod === 'wallet' ? purchaseForm.paymentWalletType : undefined,
          commissionRate: Number(purchaseForm.commissionRate),
          extraCharge: Number(purchaseForm.extraCharge),
          date: purchaseForm.date ? new Date(purchaseForm.date).toISOString() : new Date().toISOString(),
        },
      }).unwrap()
      toast.success('Purchase updated!')
      setPurchaseForm(initialPurchaseForm)
      setIsPurchasePaidAmountManual(false)
      setEditingPurchase(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update purchase')
    }
  }

  const handleDeletePurchase = (id: string) => {
    setDeleteConfirm({ type: 'purchase', id })
  }

  const handleEditTransaction = (t: any) => {
    setSaleForm({
      walletId: resolveWalletId(wallets.find(w => w.type === t.walletType)) || t.walletId || '',
      walletType: t.walletType,
      customerId: t.customerId?.id || t.customerId?._id || t.customerId || '',
      customerName: t.customerName || t.customerId?.name || '',
      amount: String(t.amount),
      receivedAmount: String((t as any).receivedAmount ?? t.amount ?? 0),
      currentBalance: '',
      commissionRate: String(t.commissionRate || 0),
      extraCharge: String(t.extraCharge || 0),
      paymentMethod: t.paymentMethod || 'cash',
      paymentWalletType: t.paymentWalletType || '',
      mobileNumber: t.mobileNumber === 'N/A' ? '' : (t.mobileNumber || ''),
      date: format(new Date(t.date), 'yyyy-MM-dd'),
    })
    setIsSaleReceivedAmountManual(true)
    setEditingTransaction(t)
  }

  const handleUpdateTransaction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTransaction) return
    if (saleForm.paymentMethod === 'wallet' && !saleForm.paymentWalletType) { toast.error('Please select payment wallet'); return }
    try {
      await updateLoadTransaction({
        id: editingTransaction.id,
        body: {
          walletType: saleForm.walletType,
          walletId: saleForm.walletId,
          customerId: saleForm.customerId || undefined,
          customerName: saleForm.customerName || '',
          amount: Number(saleForm.amount),
          receivedAmount: saleLedgerSummary.receivedAmount,
          commissionRate: Number(saleForm.commissionRate),
          extraCharge: Number(saleForm.extraCharge),
          mobileNumber: saleForm.mobileNumber || 'N/A',
          paymentMethod: saleForm.paymentMethod,
          paymentWalletType: saleForm.paymentMethod === 'wallet' ? saleForm.paymentWalletType : undefined,
          date: saleForm.date ? new Date(saleForm.date).toISOString() : new Date().toISOString(),
        },
      }).unwrap()
      toast.success('Transaction updated!')
      setSaleForm(initialSaleForm)
      setIsSaleReceivedAmountManual(false)
      setEditingTransaction(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update transaction')
    }
  }

  const handleDeleteTransaction = (id: string) => {
    setDeleteConfirm({ type: 'transaction', id })
  }

  const handleEditWithdrawal = (w: any) => {
    setWithdrawalForm({
      walletId: resolveWalletId(wallets.find(wl => wl.type === w.walletType)) || w.walletId || '',
      walletType: w.walletType,
      amount: String(w.amount),
      cashAmount: String((w as any).cashAmount ?? w.amount ?? 0),
      transactionType: w.transactionType || 'withdrawal',
      customerId: w.customerId?.id || w.customerId?._id || w.customerId || '',
      customerName: w.customerName || '',
      customerNumber: w.customerNumber || '',
      customerAccountType: w.customerAccountType || 'other',
      commissionRate: String(w.commissionRate || 0),
      extraCharge: String(w.extraCharge || 0),
      notes: w.notes || '',
      date: format(new Date(w.date), 'yyyy-MM-dd'),
    })
    setIsWithdrawalCashAmountManual(true)
    setEditingWithdrawal(w)
  }

  const handleUpdateWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingWithdrawal) return
    if (withdrawalProfit.normalizedCashAmount > Number(withdrawalForm.amount || 0)) {
      toast.error('Cash paid/received must be less than or equal to amount')
      return
    }
    try {
      await updateCashWithdrawal({
        id: editingWithdrawal.id,
        body: {
          walletId: withdrawalForm.walletId,
          walletType: withdrawalForm.walletType,
          amount: Number(withdrawalForm.amount),
          cashAmount: withdrawalProfit.normalizedCashAmount,
          transactionType: withdrawalForm.transactionType,
          customerId: withdrawalForm.customerId || undefined,
          customerName: withdrawalForm.customerName.trim() || undefined,
          customerNumber: withdrawalForm.customerNumber.trim() || undefined,
          customerAccountType: withdrawalForm.customerAccountType || undefined,
          commissionRate: Number(withdrawalForm.commissionRate),
          extraCharge: Number(withdrawalForm.extraCharge),
          notes: withdrawalForm.notes.trim() || undefined,
          date: withdrawalForm.date ? new Date(withdrawalForm.date).toISOString() : new Date().toISOString(),
        },
      }).unwrap()
      toast.success(`${cashTxLabel(withdrawalForm.transactionType)} transaction updated!`)
      setWithdrawalForm(initialWithdrawalForm)
      setIsWithdrawalCashAmountManual(false)
      setEditingWithdrawal(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update transaction')
    }
  }

  const handleDeleteWithdrawal = (id: string) => {
    setDeleteConfirm({ type: 'withdrawal', id })
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'purchase') {
        await deleteLoadPurchase(deleteConfirm.id).unwrap()
        toast.success('Purchase deleted!')
      } else if (deleteConfirm.type === 'transaction') {
        await deleteLoadTransaction(deleteConfirm.id).unwrap()
        toast.success('Transaction deleted!')
      } else {
        await deleteCashWithdrawal(deleteConfirm.id).unwrap()
        toast.success('Transaction deleted!')
      }
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete record')
    } finally {
      setDeleteConfirm(null)
    }
  }

  return (
    <MobilePageShell
      title={isCashManagementMode ? 'Cash Management' : 'Load Management'}
      description={`${isCashManagementMode ? CASH_MANAGEMENT_PAGE_HINT : 'Purchase and sell mobile load'} · ${MOBILE_FORM_KEYBOARD_HINT}`}
    >
      {savedReceipt ? (
        <MobileReceiptOffer
          onPrint={() => {
            if (savedReceipt) printMobileShopReceipt(savedReceipt, org, branchData?.invoiceNote)
          }}
          onDismiss={() => setSavedReceipt(null)}
        />
      ) : null}

      <MobileReceiptPreviewDialog
        receipt={previewReceipt}
        open={!!previewReceipt}
        onOpenChange={(open) => !open && setPreviewReceipt(null)}
        organization={org}
        invoiceNote={branchData?.invoiceNote}
      />

      {showWalletPicker ? (
        <WalletSelectionGrid
          wallets={pageWallets}
          variant={isCashManagementMode ? 'cash' : 'load'}
          isLoading={walletsLoading}
          onWalletAction={selectWallet}
        />
      ) : (
      <>
      {navWallet ? (
        <div className='mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3'>
          <div className='min-w-0'>
            <p className='text-xs text-muted-foreground'>Selected wallet</p>
            <p className='truncate font-semibold'>{navWallet.type}</p>
            <p className='text-sm text-green-600'>
              Rs {Number(navWallet.balance ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <Button type='button' variant='outline' size='sm' onClick={clearWalletSelection}>
            <ArrowLeft className='mr-1.5 h-4 w-4' />
            Change wallet
          </Button>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={isCashManagementMode ? setActiveTab : handleLoadTabChange}>
        {!isCashManagementMode && (
          <TabsList className='mb-4'>
            <TabsTrigger value='purchase'>📥 Purchase Load</TabsTrigger>
            <TabsTrigger value='sell'>📤 Sell Load</TabsTrigger>
          </TabsList>
        )}

        {/* ── PURCHASE LOAD TAB ── */}
        {!isCashManagementMode && (
        <TabsContent value='purchase' className='min-w-0'>
          <div className='grid min-w-0 gap-6'>
            <Card className='border-2 border-blue-200'>
              <CardHeader>
                <CardTitle className='text-blue-700'>📥 {editingPurchase ? 'Edit' : 'Purchase'} Load</CardTitle>
              </CardHeader>
              <CardContent>
                <form ref={purchaseFormRef} data-mobile-form className='space-y-6' onSubmit={editingPurchase ? handleUpdatePurchase : handlePurchaseSubmit} onKeyDown={preventEnterSubmit}>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-wallet'>Select Wallet *</Label>
                      <Select
                        value={selectedPurchaseWalletId || undefined}
                        onValueChange={(v) => handlePurchaseChange('walletId', v)}
                      >
                        <SelectTrigger id='purchase-wallet' {...purchaseEnter.enterProps('purchase-wallet')}>
                          {selectedPurchaseWalletId ? (
                            <span className='truncate'>
                              {formatWalletSelectLabel(selectedPurchaseWalletId, purchaseForm.walletType)}
                            </span>
                          ) : (
                            <SelectValue placeholder='Choose wallet...' />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {pageWallets.length === 0 ? (
                            <div className='p-2 text-sm text-muted-foreground'>No load wallets available. Create one in Wallet Management.</div>
                          ) : pageWallets.filter((w) => resolveWalletId(w)).map((wallet) => (
                            <SelectItem key={resolveWalletId(wallet)} value={resolveWalletId(wallet)}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='supplier'>Supplier Name - Optional</Label>
                      <Input id='supplier' placeholder='e.g., Jazz Supplier, Local Agent' value={purchaseForm.supplierName} onChange={(e) => handlePurchaseChange('supplierName', e.target.value)} {...purchaseEnter.enterProps('supplier')} />
                    </div>
                  </div>

                  <div className='space-y-2 md:max-w-md'>
                    <Label htmlFor='purchase-supplier'>Saved Supplier - Optional</Label>
                    <SearchableSelect
                      options={suppliers.map((s: any) => ({
                        value: s.id || s._id || s.value,
                        label: s.name,
                        sublabel: s.phone || s.mobile || undefined,
                      }))}
                      value={purchaseForm.savedSupplierId}
                      onValueChange={(v) => handlePurchaseChange('savedSupplierId', v)}
                      placeholder='Choose supplier (optional)'
                      searchPlaceholder='Search suppliers...'
                      clearLabel='No supplier'
                      emptyText='No suppliers found.'
                      {...purchaseEnter.enterProps('purchase-supplier')}
                    />
                    <p className='text-xs text-muted-foreground'>Selecting a supplier auto-fills Supplier Name for this purchase.</p>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-amount'>Amount (Rs) *</Label>
                      <Input id='purchase-amount' type='number' min='0' step='0.01' value={purchaseForm.amount} onChange={(e) => handlePurchaseChange('amount', e.target.value)} {...purchaseEnter.enterProps('purchase-amount')} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-paid-amount'>Amount Paid Now (Rs) - Optional</Label>
                      <Input
                        id='purchase-paid-amount'
                        type='number'
                        min='0'
                        max={purchaseForm.amount || undefined}
                        step='0.01'
                        value={purchaseForm.paidAmount}
                        disabled={!canEditPurchasePaidAmount}
                        onChange={(e) => {
                          if (!canEditPurchasePaidAmount) return
                          setIsPurchasePaidAmountManual(true)
                          handlePurchaseChange('paidAmount', e.target.value)
                        }}
                        {...purchaseEnter.enterProps('purchase-paid-amount')}
                      />
                      <p className='text-xs text-muted-foreground'>
                        {canEditPurchasePaidAmount
                          ? 'Remaining amount will be added to supplier ledger automatically.'
                          : 'Select a saved supplier to enable partial payment. Otherwise full amount is treated as paid.'}
                      </p>
                    </div>
                  </div>

                  <div className='space-y-2 md:max-w-xs'>
                    <Label htmlFor='purchase-payment-method'>Payment Method</Label>
                    <Select value={purchaseForm.paymentMethod} onValueChange={(v) => handlePurchaseChange('paymentMethod', v as 'cash' | 'bank' | 'wallet')}>
                      <SelectTrigger id='purchase-payment-method' {...purchaseEnter.enterProps('purchase-payment-method')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value='cash'>Cash</SelectItem>
                        <SelectItem value='bank'>Bank Transfer</SelectItem>
                        <SelectItem value='wallet'>Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {purchaseForm.paymentMethod === 'wallet' && (
                    <div className='space-y-2 md:max-w-xs'>
                      <Label htmlFor='purchase-payment-wallet'>Payment Wallet</Label>
                      <Select value={purchaseForm.paymentWalletType || '__none__'} onValueChange={(v) => handlePurchaseChange('paymentWalletType', v === '__none__' ? '' : v)}>
                        <SelectTrigger id='purchase-payment-wallet'><SelectValue placeholder='Select wallet...' /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value='__none__'>-- None --</SelectItem>
                          {wallets.filter((w) => w.isActive).map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.type}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-commission'>Supplier Commission (%) - Optional</Label>
                      <Input id='purchase-commission' type='number' min='0' max='100' step='0.01' placeholder='e.g., 1, 1.5' value={purchaseForm.commissionRate} onChange={(e) => handlePurchaseChange('commissionRate', e.target.value)} {...purchaseEnter.enterProps('purchase-commission')} />
                      {purchaseProfit.commissionProfit > 0 && (
                        <p className='text-xs text-green-600'>Commission Savings: Rs {purchaseProfit.commissionProfit.toFixed(2)}</p>
                      )}
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-extra'>Extra Discount (Rs) - Optional</Label>
                      <Input id='purchase-extra' type='number' min='0' step='0.01' placeholder='e.g., 10, 20' value={purchaseForm.extraCharge} onChange={(e) => handlePurchaseChange('extraCharge', e.target.value)} {...purchaseEnter.enterProps('purchase-extra')} />
                    </div>
                  </div>

                  {purchaseProfit.total > 0 && (
                    <Card className='bg-blue-50 border-blue-200'>
                      <CardContent className='pt-4 pb-3'>
                        <div className='flex justify-between items-center'>
                          <span className='font-semibold text-blue-700'>Total Purchase Savings / Bonus:</span>
                          <span className='text-xl font-bold text-blue-700'>Rs {purchaseProfit.total.toFixed(2)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className='bg-slate-50 border-slate-200'>
                    <CardContent className='pt-4 pb-3'>
                      <div className='grid gap-2 text-sm md:grid-cols-2'>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>Paid to Supplier</span>
                          <span className='font-semibold text-red-600'>Rs {purchaseLedgerSummary.paidAmount.toFixed(2)}</span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>Remaining in Supplier Ledger</span>
                          <span className='font-semibold text-orange-600'>Rs {purchaseLedgerSummary.remainingAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className='space-y-2 md:max-w-md'>
                    <Label htmlFor='purchase-date'>Date</Label>
                    <Input id='purchase-date' type='date' value={purchaseForm.date} onChange={(e) => handlePurchaseChange('date', e.target.value)} {...purchaseEnter.enterProps('purchase-date')} />
                  </div>

                  <div className='flex gap-2'>
                    <Button size='lg' type='submit' disabled={isSavingPurchase || !purchaseForm.walletId} className='w-full md:w-auto bg-blue-600 hover:bg-blue-700'>
                      {isSavingPurchase ? 'Processing...' : editingPurchase ? '✓ Update Purchase' : '✓ Save Load Purchase'}
                    </Button>
                    {editingPurchase && (
                      <Button size='lg' type='button' variant='outline' onClick={() => { setEditingPurchase(null); setPurchaseForm(initialPurchaseForm); setIsPurchasePaidAmountManual(false) }}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className='min-w-0'>
              <CardHeader><CardTitle>Recent Load Purchases</CardTitle></CardHeader>
              <CardContent className='min-w-0'>
                {purchases.length === 0 ? (
                  <div className='flex items-center justify-center h-32'><p className='text-muted-foreground'>No purchases yet.</p></div>
                ) : (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Wallet</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Commission %</TableHead>
                        <TableHead className='text-green-600'>Savings</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Payment Wallet</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className='text-sm'>{format(new Date(p.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>{p.walletType}</TableCell>
                          <TableCell className='font-medium'>{p.supplierName || '-'}</TableCell>
                          <TableCell>Rs {Number(p.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell>Rs {Number((p as any).paidAmount || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell className='text-orange-600 font-semibold'>Rs {Math.max(0, Number(p.amount || 0) - Number((p as any).paidAmount || 0)).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell>{Number(p.commissionRate || 0).toFixed(2)}%</TableCell>
                          <TableCell className='text-green-600 font-semibold'>Rs {Number(p.profit || 0).toFixed(2)}</TableCell>
                          <TableCell className='text-sm capitalize'>{p.paymentMethod}</TableCell>
                          <TableCell>{(p as any).paymentWalletType || '—'}</TableCell>
                          <TableCell>
                            <div className='flex gap-1'>
                              <ListPrintButton onClick={() => setPreviewReceipt(buildLoadPurchaseReceipt(p))} />
                              <Button size='icon' variant='ghost' className='h-8 w-8' onClick={() => handleEditPurchase(p)}><Pencil className='h-4 w-4' /></Button>
                              <Button size='icon' variant='ghost' className='h-8 w-8 text-red-600 hover:text-red-700' onClick={() => handleDeletePurchase(p.id)}><Trash2 className='h-4 w-4' /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <SimplePagination
                    currentPage={purchasePage}
                    totalPages={purchasesData?.totalPages ?? 1}
                    totalResults={purchasesData?.totalResults}
                    limit={purchaseLimit}
                    onPageChange={setPurchasePage}
                    onLimitChange={setPurchaseLimit}
                    className='mt-3'
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}

        {/* ── SELL LOAD TAB ── */}
        {!isCashManagementMode && (
        <TabsContent value='sell' className='min-w-0'>
          <div className='grid min-w-0 gap-6'>
            <Card className='border-2 border-green-200'>
              <CardHeader>
                <CardTitle className='text-green-700'>📤 {editingTransaction ? 'Edit' : 'Sell'} Mobile Load</CardTitle>
              </CardHeader>
              <CardContent>
                <form ref={saleFormRef} data-mobile-form className='space-y-6' onSubmit={editingTransaction ? handleUpdateTransaction : handleSaleSubmit} onKeyDown={preventEnterSubmit}>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-wallet'>Select Wallet *</Label>
                      <Select
                        value={selectedSaleWalletId || undefined}
                        onValueChange={(v) => handleSaleChange('walletId', v)}
                      >
                        <SelectTrigger id='sale-wallet' {...saleEnter.enterProps('sale-wallet')}>
                          {selectedSaleWalletId ? (
                            <span className='truncate'>
                              {formatWalletSelectLabel(selectedSaleWalletId, saleForm.walletType)}
                            </span>
                          ) : (
                            <SelectValue placeholder='Choose wallet...' />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {pageWallets.length === 0 ? (
                            <div className='p-2 text-sm text-muted-foreground'>No load wallets available.</div>
                          ) : pageWallets.filter((w) => resolveWalletId(w)).map((wallet) => (
                            <SelectItem key={resolveWalletId(wallet)} value={resolveWalletId(wallet)}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='current-balance'>Current Balance (Rs) - Optional</Label>
                      <Input id='current-balance' type='number' min='0' step='0.01' placeholder='Enter current wallet balance' value={saleForm.currentBalance} onChange={(e) => handleSaleChange('currentBalance', e.target.value)} {...saleEnter.enterProps('current-balance')} />
                      {saleForm.walletId && (
                        <p className='text-xs text-muted-foreground'>Wallet Balance: Rs {Number(wallets.find(w => resolveWalletId(w) === saleForm.walletId)?.balance ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</p>
                      )}
                    </div>
                  </div>

                  <div className='space-y-2 md:max-w-md'>
                    <Label htmlFor='sale-customer'>Saved Customer - Optional</Label>
                    <SearchableSelect
                      options={customers.map((c: any) => ({
                        value: c.id || c._id,
                        label: c.name,
                        sublabel: c.phone || c.mobile || undefined,
                      }))}
                      value={saleForm.customerId}
                      onValueChange={(v) => handleSaleChange('customerId', v)}
                      placeholder='Choose customer (optional)'
                      searchPlaceholder='Search customers...'
                      clearLabel='No customer'
                      emptyText='No customers found.'
                      {...saleEnter.enterProps('sale-customer')}
                    />
                    <p className='text-xs text-muted-foreground'>If selected, this load sale will also be added in customer ledger.</p>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-amount'>Load Amount (Rs) *</Label>
                      <Input id='sale-amount' type='number' min='0' step='0.01' placeholder='e.g., 100, 500, 1000' value={saleForm.amount} onChange={(e) => handleSaleChange('amount', e.target.value)} {...saleEnter.enterProps('sale-amount')} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-received-amount'>Amount Received (Rs) - Optional</Label>
                      <Input
                        id='sale-received-amount'
                        type='number'
                        min='0'
                        max={saleForm.amount || undefined}
                        step='0.01'
                        placeholder='Amount received from customer'
                        value={saleForm.receivedAmount}
                        disabled={!canEditSaleReceivedAmount}
                        onChange={(e) => {
                          if (!canEditSaleReceivedAmount) return
                          setIsSaleReceivedAmountManual(true)
                          handleSaleChange('receivedAmount', e.target.value)
                        }}
                        {...saleEnter.enterProps('sale-received')}
                      />
                      <p className='text-xs text-muted-foreground'>
                        {canEditSaleReceivedAmount
                          ? 'Remaining amount will be added to customer ledger automatically.'
                          : 'Select a saved customer to enable partial receiving. Otherwise full amount is treated as received.'}
                      </p>
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='commission'>Commission Rate (%) - Optional</Label>
                      <Input id='commission' type='number' min='0' max='100' step='0.01' placeholder='e.g., 2, 2.5, 5' value={saleForm.commissionRate} onChange={(e) => handleSaleChange('commissionRate', e.target.value)} {...saleEnter.enterProps('commission')} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='extra'>Extra Charges (Rs) - Optional</Label>
                      <Input id='extra' type='number' min='0' step='0.01' placeholder='e.g., 10, 20' value={saleForm.extraCharge} onChange={(e) => handleSaleChange('extraCharge', e.target.value)} {...saleEnter.enterProps('extra')} />
                    </div>
                  </div>

                  <div className='space-y-2 md:max-w-xs'>
                    <Label htmlFor='sale-payment-method'>Payment Method</Label>
                    <Select value={saleForm.paymentMethod} onValueChange={(v) => handleSaleChange('paymentMethod', v as 'cash' | 'bank' | 'wallet')}>
                      <SelectTrigger id='sale-payment-method' {...saleEnter.enterProps('sale-payment-method')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value='cash'>Cash</SelectItem>
                        <SelectItem value='bank'>Bank Transfer</SelectItem>
                        <SelectItem value='wallet'>Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {saleForm.paymentMethod === 'wallet' && (
                    <div className='space-y-2 md:max-w-xs'>
                      <Label htmlFor='sale-payment-wallet'>
                        Payment Wallet
                        {selectedSalePaymentWallet && (
                          <span className='ml-2 text-xs text-muted-foreground'>
                            Balance: {Number(selectedSalePaymentWallet.balance ?? 0).toFixed(2)}
                          </span>
                        )}
                      </Label>
                      <Select value={saleForm.paymentWalletType || '__none__'} onValueChange={(v) => handleSaleChange('paymentWalletType', v === '__none__' ? '' : v)}>
                        <SelectTrigger id='sale-payment-wallet'><SelectValue placeholder='Select wallet...' /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value='__none__'>-- None --</SelectItem>
                          {wallets.filter((w) => w.isActive).map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.type}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='phone'>Customer Phone Number - Optional</Label>
                      <Input id='phone' type='tel' placeholder='e.g., 03001234567 (if known)' value={saleForm.mobileNumber} onChange={(e) => handleSaleChange('mobileNumber', e.target.value)} {...saleEnter.enterProps('phone')} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-date'>Date</Label>
                      <Input id='sale-date' type='date' value={saleForm.date} onChange={(e) => handleSaleChange('date', e.target.value)} {...saleEnter.enterProps('sale-date')} />
                    </div>
                  </div>

                  <Card className='bg-slate-50 border-slate-200'>
                    <CardContent className='pt-4 pb-3'>
                      <div className='grid gap-2 text-sm md:grid-cols-2'>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>Received from Customer</span>
                          <span className='font-semibold text-green-600'>Rs {saleLedgerSummary.receivedAmount.toFixed(2)}</span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>Remaining in Customer Ledger</span>
                          <span className='font-semibold text-orange-600'>Rs {saleLedgerSummary.remainingAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className='flex gap-2'>
                    <Button size='lg' type='submit' disabled={isSavingSale || !saleForm.walletId || !saleForm.amount} className='w-full md:w-auto bg-green-600 hover:bg-green-700'>
                      {isSavingSale ? 'Processing...' : editingTransaction ? '✓ Update Load Sale' : '✓ Confirm & Save Load Sale'}
                    </Button>
                    {editingTransaction && (
                      <Button size='lg' type='button' variant='outline' onClick={() => { setEditingTransaction(null); setSaleForm(initialSaleForm); setIsSaleReceivedAmountManual(false) }}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className='min-w-0'>
              <CardHeader><CardTitle>Recent Load Sales</CardTitle></CardHeader>
              <CardContent className='min-w-0'>
                {transactions.length === 0 ? (
                  <div className='flex items-center justify-center h-32'><p className='text-muted-foreground'>No sales yet.</p></div>
                ) : (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Wallet</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Payment Wallet</TableHead>
                        <TableHead className='text-green-600 font-bold'>Profit</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className='text-sm'>{format(new Date(t.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className='font-medium'>{t.walletType}</TableCell>
                          <TableCell className='font-medium'>
                            {t.customerName?.trim() || (t as any).customerId?.name || 'Walk-in Customer'}
                          </TableCell>
                          <TableCell>Rs {Number(t.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell>Rs {Number((t as any).receivedAmount || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell className='text-orange-600 font-semibold'>Rs {Math.max(0, Number(t.amount || 0) - Number((t as any).receivedAmount || 0)).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell className='text-sm'>{t.mobileNumber === 'N/A' ? '-' : t.mobileNumber}</TableCell>
                          <TableCell className='text-sm capitalize'>{t.paymentMethod || 'cash'}</TableCell>
                          <TableCell>{(t as any).paymentWalletType || '—'}</TableCell>
                          <TableCell className='text-green-600 font-bold'>Rs {Number(t.profit || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className='flex gap-1'>
                              <ListPrintButton onClick={() => setPreviewReceipt(buildLoadSaleReceipt(t))} />
                              <Button size='icon' variant='ghost' className='h-8 w-8' onClick={() => handleEditTransaction(t)}><Pencil className='h-4 w-4' /></Button>
                              <Button size='icon' variant='ghost' className='h-8 w-8 text-red-600 hover:text-red-700' onClick={() => handleDeleteTransaction(t.id)}><Trash2 className='h-4 w-4' /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <SimplePagination
                    currentPage={transactionPage}
                    totalPages={transactionsData?.totalPages ?? 1}
                    totalResults={transactionsData?.totalResults}
                    limit={transactionLimit}
                    onPageChange={setTransactionPage}
                    onLimitChange={setTransactionLimit}
                    className='mt-3'
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}

        {/* ── CASH WITHDRAWAL TAB ── */}
        {isCashManagementMode && (
        <TabsContent value='withdrawal' className='min-w-0'>
          <div className='grid min-w-0 gap-6'>
            <Card className='border-2 border-orange-200'>
              <CardHeader>
                <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
                  <div>
                    <CardTitle className='text-orange-700'>💸 {editingWithdrawal ? 'Edit' : 'Cash'} Received / Send</CardTitle>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Select type: <strong>Received</strong> = customer gets cash (wallet ↑) | <strong>Send</strong> = customer sends via wallet (wallet ↓)
                    </p>
                  </div>
                  {!editingWithdrawal && (
                    <div className='flex rounded-lg border overflow-hidden shrink-0'>
                      <button
                        type='button'
                        onClick={() => setWithdrawalEntryMode('single')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${withdrawalEntryMode === 'single' ? 'bg-orange-500 text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
                      >
                        Single Entry
                      </button>
                      <button
                        type='button'
                        onClick={() => setWithdrawalEntryMode('bulk')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${withdrawalEntryMode === 'bulk' ? 'bg-orange-500 text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
                      >
                        ⚡ Bulk Entry
                      </button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {withdrawalEntryMode === 'bulk' && !editingWithdrawal ? (
                  /* ─── BULK ENTRY FORM ─── */
                  <div className='space-y-6'>
                    {/* Transaction Type */}
                    <div className='grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg'>
                      <button
                        type='button'
                        onClick={() => handleBulkWithdrawalTypeChange('withdrawal')}
                        className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${bulkWithdrawalForm.transactionType === 'withdrawal' ? 'bg-white shadow text-orange-700 border border-orange-200' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        💸 Received (Customer gets cash) <span className='ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700'>↑ Cash Received in Account</span>
                      </button>
                      <button
                        type='button'
                        onClick={() => handleBulkWithdrawalTypeChange('deposit')}
                        className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${bulkWithdrawalForm.transactionType === 'deposit' ? 'bg-white shadow text-purple-700 border border-purple-200' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        📲 Send (Customer sends via wallet) <span className='ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700'>↓ Cash Sent from Account</span>
                      </button>
                    </div>

                    {bulkWithdrawalForm.transactionType === 'withdrawal' ? (
                      <div className='rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800'>
                        <strong>Received:</strong> Customer sends digital money → your wallet <strong>INCREASES</strong> → you give cash. Commission collected from customer.
                      </div>
                    ) : (
                      <div className='rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm text-purple-800'>
                        <strong>Send:</strong> Customer gives you cash → you send digital → your wallet <strong>DECREASES</strong>. Commission collected from customer.
                      </div>
                    )}

                    {/* Shared fields */}
                    <div className='grid gap-4 md:grid-cols-3'>
                      <div className='space-y-2'>
                        <Label>Select Wallet *</Label>
                        <Select
                          value={selectedBulkWalletId || undefined}
                          onValueChange={handleBulkWithdrawalWalletChange}
                        >
                          <SelectTrigger>
                            {selectedBulkWalletId ? (
                              <span className='truncate'>
                                {formatWalletSelectLabel(
                                  selectedBulkWalletId,
                                  bulkWithdrawalForm.walletType,
                                )}
                              </span>
                            ) : (
                              <SelectValue placeholder='Choose wallet...' />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {pageWallets.length === 0 ? (
                              <div className='p-2 text-sm text-muted-foreground'>No cash wallets available.</div>
                            ) : pageWallets.filter((w) => resolveWalletId(w)).map((wallet) => (
                              <SelectItem key={resolveWalletId(wallet)} value={resolveWalletId(wallet)}>
                                {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='space-y-2'>
                        <Label>Commission Rate (%) - Shared</Label>
                        <Input
                          type='number' min='0' max='100' step='0.01'
                          placeholder='e.g., 2'
                          value={bulkWithdrawalForm.commissionRate}
                          onChange={(e) => setBulkWithdrawalForm(prev => ({ ...prev, commissionRate: e.target.value }))}
                        />
                      </div>
                      <div className='space-y-2'>
                        <Label>Date</Label>
                        <Input
                          type='date'
                          value={bulkWithdrawalForm.date}
                          onChange={(e) => setBulkWithdrawalForm(prev => ({ ...prev, date: e.target.value }))}
                        />
                      </div>
                    </div>

                    {/* Entries table */}
                    <div>
                      <div className='flex items-center justify-between mb-3'>
                        <Label className='text-base font-semibold'>Entries ({bulkWithdrawalForm.entries.length})</Label>
                        <Button type='button' size='sm' variant='outline' onClick={() => addBulkEntry()}>
                          <Plus className='mr-1 h-4 w-4' /> Add Row
                        </Button>
                      </div>

                      <div className='overflow-x-auto'>
                        <table className='w-full text-sm border-collapse'>
                          <thead>
                            <tr className='border-b'>
                              <th className='text-left p-2 w-8 text-muted-foreground font-medium'>#</th>
                              <th className='text-left p-2 min-w-[130px] text-muted-foreground font-medium'>Amount (Rs) *</th>
                              <th className='text-left p-2 min-w-[150px] text-muted-foreground font-medium'>Customer Name</th>
                              <th className='text-left p-2 min-w-[150px] text-muted-foreground font-medium'>Account / Phone</th>
                              <th className='text-left p-2 min-w-[130px] text-muted-foreground font-medium'>Account Type</th>
                              <th className='text-left p-2 min-w-[110px] text-muted-foreground font-medium'>Extra Charge</th>
                              <th className='text-left p-2 min-w-[150px] text-muted-foreground font-medium'>Notes</th>
                              <th className='p-2 w-10'></th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkWithdrawalForm.entries.map((entry, idx) => (
                              <tr key={idx} className='border-b last:border-b-0'>
                                <td className='p-2 text-muted-foreground'>{idx + 1}</td>
                                <td className='p-2'>
                                  <Input
                                    data-bulk-amount={idx}
                                    type='number' min='0' step='0.01'
                                    placeholder='0'
                                    value={entry.amount}
                                    onChange={(e) => handleBulkEntryChange(idx, 'amount', e.target.value)}
                                    onKeyDown={(e) => handleBulkEntryKeyDown(e, idx)}
                                    className='h-8'
                                  />
                                </td>
                                <td className='p-2'>
                                  <Input
                                    placeholder='Optional'
                                    value={entry.customerName}
                                    onChange={(e) => handleBulkEntryChange(idx, 'customerName', e.target.value)}
                                    onKeyDown={(e) => handleBulkEntryKeyDown(e, idx)}
                                    className='h-8'
                                  />
                                </td>
                                <td className='p-2'>
                                  <Input
                                    placeholder='Optional'
                                    value={entry.customerNumber}
                                    onChange={(e) => handleBulkEntryChange(idx, 'customerNumber', e.target.value)}
                                    onKeyDown={(e) => handleBulkEntryKeyDown(e, idx)}
                                    className='h-8'
                                  />
                                </td>
                                <td className='p-2 min-w-[140px]'>
                                  <CustomerAccountTypePicker
                                    hideLabel
                                    value={entry.customerAccountType}
                                    onChange={(v) => handleBulkEntryChange(idx, 'customerAccountType', v)}
                                    triggerClassName='h-8 text-xs'
                                  />
                                </td>
                                <td className='p-2'>
                                  <Input
                                    type='number' min='0' step='0.01'
                                    placeholder='0'
                                    value={entry.extraCharge}
                                    onChange={(e) => handleBulkEntryChange(idx, 'extraCharge', e.target.value)}
                                    onKeyDown={(e) => handleBulkEntryKeyDown(e, idx)}
                                    className='h-8'
                                  />
                                </td>
                                <td className='p-2'>
                                  <Input
                                    placeholder='Optional'
                                    value={entry.notes}
                                    onChange={(e) => handleBulkEntryChange(idx, 'notes', e.target.value)}
                                    onKeyDown={(e) => handleBulkEntryKeyDown(e, idx)}
                                    className='h-8'
                                  />
                                </td>
                                <td className='p-2'>
                                  {bulkWithdrawalForm.entries.length > 1 && (
                                    <Button
                                      type='button' size='icon' variant='ghost'
                                      className='h-8 w-8 text-red-500 hover:text-red-600'
                                      onClick={() => removeBulkEntry(idx)}
                                    >
                                      <Trash2 className='h-4 w-4' />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Summary */}
                    <Card className='bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200'>
                      <CardContent className='pt-4 pb-3'>
                        <div className='grid grid-cols-3 gap-4 text-center'>
                          <div>
                            <p className='text-xs text-muted-foreground'>Valid Entries</p>
                            <p className='text-xl font-bold text-orange-700'>{bulkWithdrawalTotals.validCount}</p>
                          </div>
                          <div>
                            <p className='text-xs text-muted-foreground'>
                              {bulkWithdrawalForm.transactionType === 'withdrawal' ? 'Total Received' : 'Total Sent'}
                            </p>
                            <p className={`text-xl font-bold ${bulkWithdrawalForm.transactionType === 'withdrawal' ? 'text-green-600' : 'text-red-600'}`}>
                              {bulkWithdrawalForm.transactionType === 'withdrawal' ? '+' : '-'} Rs {bulkWithdrawalTotals.totalAmount.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className='text-xs text-muted-foreground'>Your Total Profit</p>
                            <p className='text-xl font-bold text-orange-700'>Rs {bulkWithdrawalTotals.totalProfit.toFixed(2)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Button
                      size='lg'
                      onClick={handleBulkWithdrawalSubmit}
                      disabled={isSavingBulk || !bulkWithdrawalForm.walletId || bulkWithdrawalTotals.validCount === 0}
                      className='w-full md:w-auto bg-orange-500 hover:bg-orange-600'
                    >
                      {isSavingBulk ? 'Saving...' : `✓ Save ${bulkWithdrawalTotals.validCount} ${cashTxLabel(bulkWithdrawalForm.transactionType)} Entries`}
                    </Button>
                  </div>
                ) : (
                  /* ─── SINGLE ENTRY FORM ─── */
                  <form ref={withdrawalFormRef} data-mobile-form className='space-y-6' onSubmit={editingWithdrawal ? handleUpdateWithdrawal : handleWithdrawalSubmit} onKeyDown={preventEnterSubmit}>

                  {/* Transaction Type Toggle */}
                  <div className='grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg'>
                    <button
                      type='button'
                      onClick={() => handleWithdrawalChange('transactionType', 'withdrawal')}
                      className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${withdrawalForm.transactionType === 'withdrawal' ? 'bg-white shadow text-orange-700 border border-orange-200' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      💸 Received (Customer gets cash) <span className='ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700'>↑ Cash Received in Account</span>
                    </button>
                    <button
                      type='button'
                      onClick={() => handleWithdrawalChange('transactionType', 'deposit')}
                      className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${withdrawalForm.transactionType === 'deposit' ? 'bg-white shadow text-purple-700 border border-purple-200' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      📲 Send (Customer sends via wallet) <span className='ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700'>↓ Cash Sent from Account</span>
                    </button>
                  </div>

                  {withdrawalForm.transactionType === 'withdrawal' ? (
                    <div className='rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800'>
                      <strong>Received:</strong> Customer sends digital money → your wallet <strong>INCREASES</strong> → you give cash to customer. Commission collected from customer.
                    </div>
                  ) : (
                    <div className='rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm text-purple-800'>
                      <strong>Send:</strong> Customer gives you cash → you send digital from wallet → your wallet <strong>DECREASES</strong>. Commission collected from customer.
                    </div>
                  )}

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-wallet'>Select Wallet *</Label>
                      <Select
                        value={selectedWithdrawalWalletId || undefined}
                        onValueChange={(v) => handleWithdrawalChange('walletId', v)}
                      >
                        <SelectTrigger id='withdrawal-wallet' {...withdrawalEnter.enterProps('withdrawal-wallet')}>
                          {selectedWithdrawalWalletId ? (
                            <span className='truncate'>
                              {formatWalletSelectLabel(selectedWithdrawalWalletId, withdrawalForm.walletType)}
                            </span>
                          ) : (
                            <SelectValue placeholder='Choose wallet...' />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {pageWallets.length === 0 ? (
                            <div className='p-2 text-sm text-muted-foreground'>No cash wallets available.</div>
                          ) : pageWallets.filter((w) => resolveWalletId(w)).map((wallet) => (
                            <SelectItem key={resolveWalletId(wallet)} value={resolveWalletId(wallet)}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-amount'>Amount (Rs) *</Label>
                      <Input id='withdrawal-amount' type='number' min='0' step='0.01' placeholder='e.g., 1000, 5000' value={withdrawalForm.amount} onChange={(e) => handleWithdrawalChange('amount', e.target.value)} {...withdrawalEnter.enterProps('withdrawal-amount')} />
                    </div>
                  </div>

                  <div className='space-y-2 md:max-w-md'>
                    <Label htmlFor='withdrawal-saved-customer'>Saved Customer - Optional</Label>
                    <SearchableSelect
                      options={[
                        { value: '', label: 'Walk-in Customer' },
                        ...customers.map((c: any) => ({
                          value: c.id || c._id,
                          label: c.name,
                          sublabel: c.phone || c.mobile || undefined,
                        })),
                      ]}
                      value={withdrawalForm.customerId}
                      onValueChange={(v) => handleWithdrawalChange('customerId', v)}
                      placeholder='Walk-in Customer'
                      searchPlaceholder='Search customers...'
                      emptyText='No customers found.'
                      {...withdrawalEnter.enterProps('withdrawal-customer')}
                    />
                    <p className='text-xs text-muted-foreground'>If selected, paid/received and remaining amounts will be tracked in customer ledger.</p>
                  </div>

                  <div className='grid gap-4 md:grid-cols-3'>
                    <div className='space-y-2'>
                      <Label htmlFor='customer-name'>Customer Name - Optional</Label>
                      <Input id='customer-name' placeholder='e.g., Ahmed Khan' value={withdrawalForm.customerName} onChange={(e) => handleWithdrawalChange('customerName', e.target.value)} {...withdrawalEnter.enterProps('customer-name')} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='customer-number'>Customer Account / Phone</Label>
                      <Input id='customer-number' type='tel' placeholder='e.g., 03001234567' value={withdrawalForm.customerNumber} onChange={(e) => handleWithdrawalChange('customerNumber', e.target.value)} {...withdrawalEnter.enterProps('customer-number')} />
                    </div>
                    <CustomerAccountTypePicker
                      id='customer-account-type'
                      value={withdrawalForm.customerAccountType}
                      onChange={(v) => handleWithdrawalChange('customerAccountType', v)}
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='withdrawal-cash-amount'>
                      {withdrawalForm.transactionType === 'withdrawal' ? 'Cash Paid (Rs)' : 'Cash Received (Rs)'} - Optional
                    </Label>
                    <Input
                      id='withdrawal-cash-amount'
                      type='number'
                      min='0'
                      max={withdrawalForm.amount || undefined}
                      step='0.01'
                      value={withdrawalForm.cashAmount}
                      onChange={(e) => {
                        setIsWithdrawalCashAmountManual(true)
                        handleWithdrawalChange('cashAmount', e.target.value)
                      }}
                      {...withdrawalEnter.enterProps('withdrawal-cash-amount')}
                    />
                    <p className='text-xs text-muted-foreground'>
                      {`Cash amount must be less than or equal to amount. Remaining amount is ${withdrawalForm.transactionType === 'withdrawal' ? 'cash payable' : 'cash receivable'} and will be added to customer ledger.`}
                    </p>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-commission'>Commission Rate (%) - Optional</Label>
                      <Input id='withdrawal-commission' type='number' min='0' max='100' step='0.01' placeholder='e.g., 1, 1.5, 2' value={withdrawalForm.commissionRate} onChange={(e) => handleWithdrawalChange('commissionRate', e.target.value)} {...withdrawalEnter.enterProps('withdrawal-commission')} />
                      {(Number(withdrawalForm.commissionRate) > 0 || Number(withdrawalForm.extraCharge) > 0) && (
                        <p className='text-xs text-muted-foreground'>
                          {Number(withdrawalForm.commissionRate) > 0 && (
                            <>Commission Profit: Rs {withdrawalProfit.commissionProfit.toFixed(2)}</>
                          )}
                          {Number(withdrawalForm.commissionRate) > 0 && Number(withdrawalForm.extraCharge) > 0 && ' · '}
                          {Number(withdrawalForm.extraCharge) > 0 && (
                            <>Extra: Rs {Number(withdrawalForm.extraCharge).toFixed(2)}</>
                          )}
                        </p>
                      )}
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-extra'>Extra Charges (Rs) - Optional</Label>
                      <Input id='withdrawal-extra' type='number' min='0' step='0.01' placeholder='e.g., 5, 10' value={withdrawalForm.extraCharge} onChange={(e) => handleWithdrawalChange('extraCharge', e.target.value)} {...withdrawalEnter.enterProps('withdrawal-extra')} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-notes'>Notes - Optional</Label>
                      <Input id='withdrawal-notes' placeholder='Any additional notes' value={withdrawalForm.notes} onChange={(e) => handleWithdrawalChange('notes', e.target.value)} {...withdrawalEnter.enterProps('withdrawal-notes')} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-date'>Date</Label>
                      <Input id='withdrawal-date' type='date' value={withdrawalForm.date} onChange={(e) => handleWithdrawalChange('date', e.target.value)} {...withdrawalEnter.enterProps('withdrawal-date')} />
                    </div>
                  </div>

                  <Card className='bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200'>
                    <CardContent className='pt-6'>
                      <div className='space-y-3'>
                        <div className='flex justify-between items-center'>
                          <span className='text-muted-foreground'>
                            {withdrawalForm.transactionType === 'withdrawal' ? 'Amount Received into Wallet:' : 'Amount Sent from Wallet:'}
                          </span>
                          <span className={`font-semibold ${withdrawalForm.transactionType === 'withdrawal' ? 'text-green-600' : 'text-red-600'}`}>
                            {withdrawalForm.transactionType === 'withdrawal' ? '+' : '-'} Rs {Number(withdrawalForm.amount || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className='flex justify-between items-center'>
                          <span className='text-muted-foreground'>
                            {withdrawalForm.transactionType === 'withdrawal' ? 'Cash Paid to Customer:' : 'Cash Received from Customer:'}
                          </span>
                          <span className={`font-semibold ${withdrawalForm.transactionType === 'withdrawal' ? 'text-red-600' : 'text-green-600'}`}>
                            {withdrawalForm.transactionType === 'withdrawal' ? '-' : '+'} Rs {withdrawalProfit.normalizedCashAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className='flex justify-between items-center'>
                          <span className='text-muted-foreground'>
                            Remaining ({withdrawalForm.transactionType === 'withdrawal' ? 'Payable' : 'Receivable'}):
                          </span>
                          <span className='text-orange-600 font-semibold'>Rs {withdrawalProfit.remainingAmount.toFixed(2)}</span>
                        </div>
                        {withdrawalProfit.settlementProfit > 0 && (
                          <div className='flex justify-between items-center'>
                            <span className='text-muted-foreground'>Settlement Profit:</span>
                            <span className='text-green-600 font-semibold'>+ Rs {withdrawalProfit.settlementProfit.toFixed(2)}</span>
                          </div>
                        )}
                        {withdrawalProfit.commissionProfit > 0 && (
                          <div className='flex justify-between items-center'>
                            <span className='text-muted-foreground'>Commission ({withdrawalForm.commissionRate}%):</span>
                            <span className='text-green-600 font-semibold'>+ Rs {withdrawalProfit.commissionProfit.toFixed(2)}</span>
                          </div>
                        )}
                        {Number(withdrawalForm.extraCharge || 0) > 0 && (
                          <div className='flex justify-between items-center'>
                            <span className='text-muted-foreground'>Extra Charges:</span>
                            <span className='text-green-600 font-semibold'>+ Rs {Number(withdrawalForm.extraCharge).toFixed(2)}</span>
                          </div>
                        )}
                        {withdrawalProfit.totalProfit > 0 && (
                        <div className='border-t-2 border-orange-200 pt-3 flex justify-between items-center'>
                          <span className='text-lg font-bold'>Your Profit:</span>
                          <span className='text-2xl font-bold text-orange-700'>Rs {withdrawalProfit.totalProfit.toFixed(2)}</span>
                        </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <div className='flex gap-2'>
                    <Button size='lg' type='submit' disabled={isSavingWithdrawal || !withdrawalForm.walletId || !withdrawalForm.amount} className='w-full md:w-auto bg-orange-500 hover:bg-orange-600'>
                      {isSavingWithdrawal ? 'Processing...' : editingWithdrawal ? `✓ Update ${cashTxLabel(withdrawalForm.transactionType)}` : `✓ Confirm ${cashTxLabel(withdrawalForm.transactionType)}`}
                    </Button>
                    {editingWithdrawal && (
                      <Button size='lg' type='button' variant='outline' onClick={() => { setEditingWithdrawal(null); setWithdrawalForm(initialWithdrawalForm); setIsWithdrawalCashAmountManual(false) }}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
                )}
              </CardContent>
            </Card>

            <Card className='min-w-0'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle>Recent Cash Received &amp; Send</CardTitle>
                  {selectedWithdrawalIds.size > 0 && (
                    <Button
                      variant='destructive'
                      size='sm'
                      disabled={isDeletingBatch}
                      onClick={() => setBulkDeleteConfirm(true)}
                    >
                      <Trash2 className='h-4 w-4 mr-1' />
                      {isDeletingBatch ? 'Deleting...' : `Delete Selected (${selectedWithdrawalIds.size})`}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className='min-w-0'>
                {withdrawals.length === 0 ? (
                  <div className='flex items-center justify-center h-32'><p className='text-muted-foreground'>No transactions yet.</p></div>
                ) : (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className='w-10'>
                          <Checkbox
                            checked={withdrawals.length > 0 && selectedWithdrawalIds.size === withdrawals.length}
                            onCheckedChange={toggleAllWithdrawals}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Wallet</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Account / Phone</TableHead>
                        <TableHead>Account Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Cash Settled</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Commission %</TableHead>
                        <TableHead className='text-orange-600 font-bold'>Profit</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {withdrawals.map((w) => (
                        <TableRow key={w.id} className={selectedWithdrawalIds.has(w.id) ? 'bg-muted/50' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={selectedWithdrawalIds.has(w.id)}
                              onCheckedChange={() => toggleWithdrawalSelection(w.id)}
                            />
                          </TableCell>
                          <TableCell className='text-sm'>{format(new Date(w.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${w.transactionType === 'withdrawal' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                              {w.transactionType === 'withdrawal' ? `💸 ${cashTxLabel('withdrawal')}` : `📲 ${cashTxLabel('deposit')}`}
                            </span>
                          </TableCell>
                          <TableCell className='font-medium'>{w.walletType}</TableCell>
                          <TableCell>{w.customerName?.trim() ? w.customerName : 'Walk-in Customer'}</TableCell>
                          <TableCell>{w.customerNumber || '-'}</TableCell>
                          <TableCell>
                            {resolveAccountTypeLabel(w.customerAccountType, customerAccountTypes)}
                          </TableCell>
                          <TableCell className={w.transactionType === 'withdrawal' ? 'text-green-600' : 'text-red-600'}>
                            {w.transactionType === 'withdrawal' ? '+' : '-'} Rs {Number(w.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className={w.transactionType === 'withdrawal' ? 'text-red-600' : 'text-green-600'}>
                            {w.transactionType === 'withdrawal' ? '-' : '+'} Rs {Number((w as any).cashAmount || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className='text-orange-600 font-semibold'>
                            Rs {Math.max(0, Number(w.amount || 0) - Number((w as any).cashAmount || 0)).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell>{Number(w.commissionRate || 0).toFixed(2)}%</TableCell>
                          <TableCell className='text-orange-600 font-bold'>Rs {Number(w.profit || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className='flex gap-1'>
                              <ListPrintButton onClick={() => setPreviewReceipt(buildCashWithdrawalReceipt(w))} />
                              <Button size='icon' variant='ghost' className='h-8 w-8' onClick={() => handleEditWithdrawal(w)}><Pencil className='h-4 w-4' /></Button>
                              <Button size='icon' variant='ghost' className='h-8 w-8 text-red-600 hover:text-red-700' onClick={() => handleDeleteWithdrawal(w.id)}><Trash2 className='h-4 w-4' /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <SimplePagination
                    currentPage={withdrawalPage}
                    totalPages={withdrawalsData?.totalPages ?? 1}
                    totalResults={withdrawalsData?.totalResults}
                    limit={withdrawalLimit}
                    onPageChange={setWithdrawalPage}
                    onLimitChange={setWithdrawalLimit}
                    className='mt-3'
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}
      </Tabs>
      </>
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this {deleteConfirm?.type === 'purchase' ? 'purchase' : deleteConfirm?.type === 'transaction' ? 'sale' : 'cash transaction'} record. Wallet balance and cash book entries will be reversed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className='bg-red-600 hover:bg-red-700'>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedWithdrawalIds.size} transaction(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected cash transaction records. Wallet balances and cash book entries will be reversed for each. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className='bg-red-600 hover:bg-red-700'>
              {isDeletingBatch ? 'Deleting...' : `Delete ${selectedWithdrawalIds.size} Record(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobilePageShell>
  )
}
