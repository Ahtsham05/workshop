import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { MobilePageShell } from '../components/mobile-page-shell'
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
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

type PurchaseFormState = {
  walletId: string
  walletType: string
  savedSupplierId: string
  amount: string
  supplierName: string
  paymentMethod: 'cash' | 'bank'
  commissionRate: string
  extraCharge: string
  date: string
}

type LoadSaleFormState = {
  walletId: string
  walletType: string
  customerId: string
  customerName: string
  amount: string
  currentBalance: string
  commissionRate: string
  extraCharge: string
  mobileNumber: string
  date: string
}

type WithdrawalFormState = {
  walletId: string
  walletType: string
  amount: string
  transactionType: 'withdrawal' | 'deposit'
  customerName: string
  customerNumber: string
  commissionRate: string
  extraCharge: string
  notes: string
  date: string
}

type BulkWithdrawalEntry = {
  amount: string
  customerName: string
  customerNumber: string
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
  supplierName: '',
  paymentMethod: 'cash',
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
  currentBalance: '',
  commissionRate: '0',
  extraCharge: '0',
  mobileNumber: '',
  date: format(new Date(), 'yyyy-MM-dd'),
}

const initialWithdrawalForm: WithdrawalFormState = {
  walletId: '',
  walletType: '',
  amount: '0',
  transactionType: 'withdrawal',
  customerName: '',
  customerNumber: '',
  commissionRate: '0',
  extraCharge: '0',
  notes: '',
  date: format(new Date(), 'yyyy-MM-dd'),
}

type LoadManagementPageProps = {
  mode?: 'load' | 'cash-management'
}

export default function LoadManagementPage({ mode = 'load' }: LoadManagementPageProps) {
  const isCashManagementMode = mode === 'cash-management'
  const dispatch = useDispatch<any>()

  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(initialPurchaseForm)
  const [saleForm, setSaleForm] = useState<LoadSaleFormState>(initialSaleForm)
  const [withdrawalForm, setWithdrawalForm] = useState<WithdrawalFormState>(initialWithdrawalForm)
  const [withdrawalEntryMode, setWithdrawalEntryMode] = useState<'single' | 'bulk'>('single')
  const [bulkWithdrawalForm, setBulkWithdrawalForm] = useState<BulkWithdrawalFormState>(makeInitialBulkWithdrawalForm)

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

  const { data: walletsData } = useGetWalletsQuery()
  const { data: customersData } = useGetAllCustomersQuery(undefined)
  const suppliersRedux = useSelector((state: RootState) => state.supplier.data)
  const { data: purchasesData } = useGetLoadPurchasesQuery({ page: purchasePage, limit: purchaseLimit })
  const { data: transactionsData } = useGetLoadTransactionsQuery({ page: transactionPage, limit: transactionLimit })
  const { data: withdrawalsData } = useGetCashWithdrawalsQuery({ page: withdrawalPage, limit: withdrawalLimit })

  const wallets = walletsData?.results ?? []
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

  const purchaseProfit = useMemo(() => {
    const amount = Number(purchaseForm.amount) || 0
    const commissionRate = Number(purchaseForm.commissionRate) || 0
    const extraCharge = Number(purchaseForm.extraCharge) || 0
    const commissionProfit = (amount * commissionRate) / 100
    return { commissionProfit, total: commissionProfit + extraCharge }
  }, [purchaseForm.amount, purchaseForm.commissionRate, purchaseForm.extraCharge])

  const withdrawalProfit = useMemo(() => {
    const amount = Number(withdrawalForm.amount) || 0
    const commissionRate = Number(withdrawalForm.commissionRate) || 0
    const extraCharge = Number(withdrawalForm.extraCharge) || 0
    const commissionProfit = (amount * commissionRate) / 100
    return { commissionProfit, totalProfit: commissionProfit + extraCharge }
  }, [withdrawalForm.amount, withdrawalForm.commissionRate, withdrawalForm.extraCharge])

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
      }))
      return
    }
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => w.id === value)
      setPurchaseForm(prev => ({
        ...prev,
        walletId: value,
        walletType: selectedWallet?.type || '',
        commissionRate: selectedWallet ? String(selectedWallet.commissionRate ?? 0) : prev.commissionRate,
      }))
    } else {
      setPurchaseForm(prev => ({ ...prev, [field]: value }))
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
      }))
      return
    }
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => w.id === value)
      setSaleForm(prev => ({
        ...prev,
        walletId: value,
        walletType: selectedWallet?.type || '',
        commissionRate: selectedWallet ? String(selectedWallet.commissionRate ?? 0) : prev.commissionRate,
        currentBalance: '',
      }))
      return
    }
    if (field === 'currentBalance') {
      const selectedWallet = wallets.find(w => w.id === saleForm.walletId)
      const walletBalance = Number(selectedWallet?.balance ?? 0)
      const currentBal = Number(value) || 0
      const calculatedAmount = walletBalance - currentBal
      setSaleForm(prev => ({
        ...prev,
        currentBalance: value,
        amount: calculatedAmount > 0 ? String(calculatedAmount) : '0',
      }))
      return
    }
    setSaleForm(prev => ({ ...prev, [field]: value }))
  }

  const handleWithdrawalChange = (field: keyof WithdrawalFormState, value: string) => {
    if (field === 'walletId') {
      const selectedWallet = wallets.find(w => w.id === value)
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
      const selectedWallet = wallets.find(w => w.id === withdrawalForm.walletId)
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
    setWithdrawalForm(prev => ({ ...prev, [field]: value }))
  }

  const handlePurchaseSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!purchaseForm.walletId) { toast.error('Please select a wallet'); return }
    if (!purchaseForm.amount || Number(purchaseForm.amount) <= 0) { toast.error('Please enter a valid amount'); return }
    try {
      await createLoadPurchase({
        walletType: purchaseForm.walletType,
        supplierId: purchaseForm.savedSupplierId || undefined,
        amount: Number(purchaseForm.amount),
        supplierName: purchaseForm.supplierName.trim() || undefined,
        paymentMethod: purchaseForm.paymentMethod as 'cash' | 'bank',
        commissionRate: Number(purchaseForm.commissionRate),
        extraCharge: Number(purchaseForm.extraCharge),
        date: purchaseForm.date ? new Date(purchaseForm.date).toISOString() : new Date().toISOString(),
      }).unwrap()
      toast.success('Load purchase recorded!')
      setPurchaseForm(initialPurchaseForm)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save load purchase')
    }
  }

  const handleSaleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!saleForm.walletId) { toast.error('Please select a wallet'); return }
    if (!saleForm.amount || Number(saleForm.amount) <= 0) { toast.error('Please enter a valid amount'); return }
    if (!saleForm.walletType) { toast.error('Selected wallet is invalid'); return }
    try {
      await createLoadTransaction({
        walletId: saleForm.walletId,
        walletType: saleForm.walletType,
        customerId: saleForm.customerId || undefined,
        customerName: saleForm.customerName || undefined,
        amount: Number(saleForm.amount),
        commissionRate: Number(saleForm.commissionRate),
        extraCharge: Number(saleForm.extraCharge),
        mobileNumber: saleForm.mobileNumber || 'N/A',
        date: saleForm.date ? new Date(saleForm.date).toISOString() : new Date().toISOString(),
        type: 'normal',
        network: 'none',
        paymentMethod: 'cash',
      }).unwrap()
      toast.success('Load sold successfully!')
      setSaleForm(initialSaleForm)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save load transaction')
    }
  }

  const handleWithdrawalSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!withdrawalForm.walletId) { toast.error('Please select a wallet'); return }
    if (!withdrawalForm.amount || Number(withdrawalForm.amount) <= 0) { toast.error('Please enter a valid amount'); return }
    if (!withdrawalForm.walletType) { toast.error('Selected wallet is invalid'); return }
    try {
      await createCashWithdrawal({
        walletId: withdrawalForm.walletId,
        walletType: withdrawalForm.walletType,
        amount: Number(withdrawalForm.amount),
        transactionType: withdrawalForm.transactionType,
        customerName: withdrawalForm.customerName.trim() || undefined,
        customerNumber: withdrawalForm.customerNumber.trim() || undefined,
        commissionRate: Number(withdrawalForm.commissionRate),
        extraCharge: Number(withdrawalForm.extraCharge),
        notes: withdrawalForm.notes.trim() || undefined,
        date: withdrawalForm.date ? new Date(withdrawalForm.date).toISOString() : new Date().toISOString(),
      }).unwrap()
      toast.success('Cash withdrawal recorded!')
      const prevType = withdrawalForm.transactionType
      const prevWalletId = withdrawalForm.walletId
      const prevWalletType = withdrawalForm.walletType
      const prevCommission = withdrawalForm.commissionRate
      const prevDate = withdrawalForm.date
      setWithdrawalForm({
        walletId: prevWalletId,
        walletType: prevWalletType,
        amount: '0',
        transactionType: prevType,
        customerName: '',
        customerNumber: '',
        commissionRate: prevCommission,
        extraCharge: '0',
        notes: '',
        date: prevDate,
      })
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to save cash withdrawal')
    }
  }

  // ─── Bulk Withdrawal Handlers ───
  const handleBulkWithdrawalWalletChange = (walletId: string) => {
    const selectedWallet = wallets.find(w => w.id === walletId)
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
    const selectedWallet = wallets.find(w => w.id === bulkWithdrawalForm.walletId)
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
    try {
      await createCashWithdrawalsBatch({
        walletId: bulkWithdrawalForm.walletId,
        walletType: bulkWithdrawalForm.walletType,
        transactionType: bulkWithdrawalForm.transactionType,
        commissionRate: Number(bulkWithdrawalForm.commissionRate) || 0,
        date: new Date(bulkWithdrawalForm.date).toISOString(),
        entries: validEntries.map(e => ({
          amount: Number(e.amount),
          customerName: e.customerName.trim() || undefined,
          customerNumber: e.customerNumber.trim() || undefined,
          extraCharge: Number(e.extraCharge) || 0,
          notes: e.notes.trim() || undefined,
        })),
      }).unwrap()
      toast.success(`${validEntries.length} ${bulkWithdrawalForm.transactionType === 'withdrawal' ? 'withdrawal' : 'deposit'} entries saved!`)
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
      toast.success(`${result.deleted} withdrawal(s) deleted${result.failed > 0 ? `, ${result.failed} failed` : ''}`)
      setSelectedWithdrawalIds(new Set())
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete withdrawals')
    } finally {
      setBulkDeleteConfirm(false)
    }
  }

  // ─── Edit / Delete Handlers ───
  const handleEditPurchase = (p: any) => {
    const purchaseSupplierId = p.supplierId?.id || p.supplierId?._id || p.supplierId || ''
    setPurchaseForm({
      walletId: wallets.find(w => w.type === p.walletType)?.id || '',
      walletType: p.walletType,
      savedSupplierId: purchaseSupplierId || suppliers.find((s: any) => s.name === p.supplierName)?.id || suppliers.find((s: any) => s.name === p.supplierName)?._id || '',
      amount: String(p.amount),
      supplierName: p.supplierName || '',
      paymentMethod: p.paymentMethod || 'cash',
      commissionRate: String(p.commissionRate || 0),
      extraCharge: String(p.extraCharge || 0),
      date: format(new Date(p.date), 'yyyy-MM-dd'),
    })
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
          supplierName: purchaseForm.supplierName.trim() || undefined,
          paymentMethod: purchaseForm.paymentMethod as 'cash' | 'bank',
          commissionRate: Number(purchaseForm.commissionRate),
          extraCharge: Number(purchaseForm.extraCharge),
          date: purchaseForm.date ? new Date(purchaseForm.date).toISOString() : new Date().toISOString(),
        },
      }).unwrap()
      toast.success('Purchase updated!')
      setPurchaseForm(initialPurchaseForm)
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
      walletId: wallets.find(w => w.type === t.walletType)?.id || t.walletId || '',
      walletType: t.walletType,
      customerId: t.customerId?.id || t.customerId?._id || t.customerId || '',
      customerName: t.customerName || t.customerId?.name || '',
      amount: String(t.amount),
      currentBalance: '',
      commissionRate: String(t.commissionRate || 0),
      extraCharge: String(t.extraCharge || 0),
      mobileNumber: t.mobileNumber === 'N/A' ? '' : (t.mobileNumber || ''),
      date: format(new Date(t.date), 'yyyy-MM-dd'),
    })
    setEditingTransaction(t)
  }

  const handleUpdateTransaction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTransaction) return
    try {
      await updateLoadTransaction({
        id: editingTransaction.id,
        body: {
          walletType: saleForm.walletType,
          walletId: saleForm.walletId,
          customerId: saleForm.customerId || undefined,
          customerName: saleForm.customerName || '',
          amount: Number(saleForm.amount),
          commissionRate: Number(saleForm.commissionRate),
          extraCharge: Number(saleForm.extraCharge),
          mobileNumber: saleForm.mobileNumber || 'N/A',
          date: saleForm.date ? new Date(saleForm.date).toISOString() : new Date().toISOString(),
        },
      }).unwrap()
      toast.success('Transaction updated!')
      setSaleForm(initialSaleForm)
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
      walletId: wallets.find(wl => wl.type === w.walletType)?.id || w.walletId || '',
      walletType: w.walletType,
      amount: String(w.amount),
      transactionType: w.transactionType || 'withdrawal',
      customerName: w.customerName || '',
      customerNumber: w.customerNumber || '',
      commissionRate: String(w.commissionRate || 0),
      extraCharge: String(w.extraCharge || 0),
      notes: w.notes || '',
      date: format(new Date(w.date), 'yyyy-MM-dd'),
    })
    setEditingWithdrawal(w)
  }

  const handleUpdateWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingWithdrawal) return
    try {
      await updateCashWithdrawal({
        id: editingWithdrawal.id,
        body: {
          walletId: withdrawalForm.walletId,
          walletType: withdrawalForm.walletType,
          amount: Number(withdrawalForm.amount),
          transactionType: withdrawalForm.transactionType,
          customerName: withdrawalForm.customerName.trim() || undefined,
          customerNumber: withdrawalForm.customerNumber.trim() || undefined,
          commissionRate: Number(withdrawalForm.commissionRate),
          extraCharge: Number(withdrawalForm.extraCharge),
          notes: withdrawalForm.notes.trim() || undefined,
          date: withdrawalForm.date ? new Date(withdrawalForm.date).toISOString() : new Date().toISOString(),
        },
      }).unwrap()
      toast.success('Withdrawal updated!')
      setWithdrawalForm(initialWithdrawalForm)
      setEditingWithdrawal(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update withdrawal')
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
        toast.success('Withdrawal deleted!')
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
      description={isCashManagementMode ? 'Manage cash withdrawals and deposits' : 'Purchase and sell mobile load'}
    >
      <Tabs defaultValue={isCashManagementMode ? 'withdrawal' : 'sell'}>
        {!isCashManagementMode && (
          <TabsList className='mb-4'>
            <TabsTrigger value='purchase'>📥 Purchase Load</TabsTrigger>
            <TabsTrigger value='sell'>📤 Sell Load</TabsTrigger>
          </TabsList>
        )}

        {/* ── PURCHASE LOAD TAB ── */}
        {!isCashManagementMode && (
        <TabsContent value='purchase'>
          <div className='grid gap-6'>
            <Card className='border-2 border-blue-200'>
              <CardHeader>
                <CardTitle className='text-blue-700'>📥 {editingPurchase ? 'Edit' : 'Purchase'} Load</CardTitle>
              </CardHeader>
              <CardContent>
                <form className='space-y-6' onSubmit={editingPurchase ? handleUpdatePurchase : handlePurchaseSubmit}>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-wallet'>Select Wallet *</Label>
                      <Select value={purchaseForm.walletId} onValueChange={(v) => handlePurchaseChange('walletId', v)}>
                        <SelectTrigger id='purchase-wallet'>
                          <SelectValue placeholder='Choose wallet...' />
                        </SelectTrigger>
                        <SelectContent>
                          {wallets.length === 0 ? (
                            <div className='p-2 text-sm text-muted-foreground'>No wallets available. Create one in Wallet Management.</div>
                          ) : wallets.map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.id}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='supplier'>Supplier Name - Optional</Label>
                      <Input id='supplier' placeholder='e.g., Jazz Supplier, Local Agent' value={purchaseForm.supplierName} onChange={(e) => handlePurchaseChange('supplierName', e.target.value)} />
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
                    />
                    <p className='text-xs text-muted-foreground'>Selecting a supplier auto-fills Supplier Name for this purchase.</p>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-amount'>Amount (Rs) *</Label>
                      <Input id='purchase-amount' type='number' min='0' step='0.01' value={purchaseForm.amount} onChange={(e) => handlePurchaseChange('amount', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-payment-method'>Payment Method</Label>
                      <Select value={purchaseForm.paymentMethod} onValueChange={(v) => handlePurchaseChange('paymentMethod', v as 'cash' | 'bank')}>
                        <SelectTrigger id='purchase-payment-method'><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value='cash'>Cash</SelectItem>
                          <SelectItem value='bank'>Bank Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-commission'>Supplier Commission (%) - Optional</Label>
                      <Input id='purchase-commission' type='number' min='0' max='100' step='0.01' placeholder='e.g., 1, 1.5' value={purchaseForm.commissionRate} onChange={(e) => handlePurchaseChange('commissionRate', e.target.value)} />
                      {purchaseProfit.commissionProfit > 0 && (
                        <p className='text-xs text-green-600'>Commission Savings: Rs {purchaseProfit.commissionProfit.toFixed(2)}</p>
                      )}
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='purchase-extra'>Extra Discount (Rs) - Optional</Label>
                      <Input id='purchase-extra' type='number' min='0' step='0.01' placeholder='e.g., 10, 20' value={purchaseForm.extraCharge} onChange={(e) => handlePurchaseChange('extraCharge', e.target.value)} />
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

                  <div className='space-y-2 md:max-w-md'>
                    <Label htmlFor='purchase-date'>Date</Label>
                    <Input id='purchase-date' type='date' value={purchaseForm.date} onChange={(e) => handlePurchaseChange('date', e.target.value)} />
                  </div>

                  <div className='flex gap-2'>
                    <Button size='lg' type='submit' disabled={isSavingPurchase || !purchaseForm.walletId} className='w-full md:w-auto bg-blue-600 hover:bg-blue-700'>
                      {isSavingPurchase ? 'Processing...' : editingPurchase ? '✓ Update Purchase' : '✓ Save Load Purchase'}
                    </Button>
                    {editingPurchase && (
                      <Button size='lg' type='button' variant='outline' onClick={() => { setEditingPurchase(null); setPurchaseForm(initialPurchaseForm) }}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent Load Purchases</CardTitle></CardHeader>
              <CardContent>
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
                        <TableHead>Commission %</TableHead>
                        <TableHead className='text-green-600'>Savings</TableHead>
                        <TableHead>Method</TableHead>
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
                          <TableCell>{Number(p.commissionRate || 0).toFixed(2)}%</TableCell>
                          <TableCell className='text-green-600 font-semibold'>Rs {Number(p.profit || 0).toFixed(2)}</TableCell>
                          <TableCell className='text-sm capitalize'>{p.paymentMethod}</TableCell>
                          <TableCell>
                            <div className='flex gap-1'>
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
        <TabsContent value='sell'>
          <div className='grid gap-6'>
            <Card className='border-2 border-green-200'>
              <CardHeader>
                <CardTitle className='text-green-700'>📤 {editingTransaction ? 'Edit' : 'Sell'} Mobile Load</CardTitle>
              </CardHeader>
              <CardContent>
                <form className='space-y-6' onSubmit={editingTransaction ? handleUpdateTransaction : handleSaleSubmit}>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-wallet'>Select Wallet *</Label>
                      <Select value={saleForm.walletId} onValueChange={(v) => handleSaleChange('walletId', v)}>
                        <SelectTrigger id='sale-wallet'><SelectValue placeholder='Choose wallet...' /></SelectTrigger>
                        <SelectContent>
                          {wallets.length === 0 ? (
                            <div className='p-2 text-sm text-muted-foreground'>No wallets available.</div>
                          ) : wallets.map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.id}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='current-balance'>Current Balance (Rs) - Optional</Label>
                      <Input id='current-balance' type='number' min='0' step='0.01' placeholder='Enter current wallet balance' value={saleForm.currentBalance} onChange={(e) => handleSaleChange('currentBalance', e.target.value)} />
                      {saleForm.walletId && (
                        <p className='text-xs text-muted-foreground'>Wallet Balance: Rs {Number(wallets.find(w => w.id === saleForm.walletId)?.balance ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</p>
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
                    />
                    <p className='text-xs text-muted-foreground'>If selected, this load sale will also be added in customer ledger.</p>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-amount'>Load Amount (Rs) *</Label>
                      <Input id='sale-amount' type='number' min='0' step='0.01' placeholder='e.g., 100, 500, 1000' value={saleForm.amount} onChange={(e) => handleSaleChange('amount', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='commission'>Commission Rate (%) - Optional</Label>
                      <Input id='commission' type='number' min='0' max='100' step='0.01' placeholder='e.g., 2, 2.5, 5' value={saleForm.commissionRate} onChange={(e) => handleSaleChange('commissionRate', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='extra'>Extra Charges (Rs) - Optional</Label>
                      <Input id='extra' type='number' min='0' step='0.01' placeholder='e.g., 10, 20' value={saleForm.extraCharge} onChange={(e) => handleSaleChange('extraCharge', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='phone'>Customer Phone Number - Optional</Label>
                      <Input id='phone' type='tel' placeholder='e.g., 03001234567 (if known)' value={saleForm.mobileNumber} onChange={(e) => handleSaleChange('mobileNumber', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='sale-date'>Date</Label>
                      <Input id='sale-date' type='date' value={saleForm.date} onChange={(e) => handleSaleChange('date', e.target.value)} />
                    </div>
                  </div>

                  <div className='flex gap-2'>
                    <Button size='lg' type='submit' disabled={isSavingSale || !saleForm.walletId || !saleForm.amount} className='w-full md:w-auto bg-green-600 hover:bg-green-700'>
                      {isSavingSale ? 'Processing...' : editingTransaction ? '✓ Update Load Sale' : '✓ Confirm & Save Load Sale'}
                    </Button>
                    {editingTransaction && (
                      <Button size='lg' type='button' variant='outline' onClick={() => { setEditingTransaction(null); setSaleForm(initialSaleForm) }}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent Load Sales</CardTitle></CardHeader>
              <CardContent>
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
                        <TableHead>Phone</TableHead>
                        <TableHead className='text-green-600 font-bold'>Profit</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className='text-sm'>{format(new Date(t.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className='font-medium'>{t.walletType}</TableCell>
                          <TableCell className='font-medium'>{t.customerName || (t as any).customerId?.name || '-'}</TableCell>
                          <TableCell>Rs {Number(t.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell className='text-sm'>{t.mobileNumber === 'N/A' ? '-' : t.mobileNumber}</TableCell>
                          <TableCell className='text-green-600 font-bold'>Rs {Number(t.profit || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className='flex gap-1'>
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
        <TabsContent value='withdrawal'>
          <div className='grid gap-6'>
            <Card className='border-2 border-orange-200'>
              <CardHeader>
                <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
                  <div>
                    <CardTitle className='text-orange-700'>💸 {editingWithdrawal ? 'Edit' : 'Cash'} Withdrawal / Transfer</CardTitle>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Select type: <strong>Withdrawal</strong> = customer gets cash (wallet ↑, you earn 2%) | <strong>Deposit</strong> = customer sends via wallet (wallet ↓, you earn 1%)
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
                        💸 Withdrawal (Customer gets cash) <span className='ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700'>↑ Cash Received in Account</span>
                      </button>
                      <button
                        type='button'
                        onClick={() => handleBulkWithdrawalTypeChange('deposit')}
                        className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${bulkWithdrawalForm.transactionType === 'deposit' ? 'bg-white shadow text-purple-700 border border-purple-200' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        📲 Deposit (Customer sends via wallet) <span className='ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700'>↓ Cash Sent from Account</span>
                      </button>
                    </div>

                    {bulkWithdrawalForm.transactionType === 'withdrawal' ? (
                      <div className='rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800'>
                        <strong>Withdrawal:</strong> Customer sends digital money → your wallet <strong>INCREASES</strong> → you give cash. Commission collected from customer.
                      </div>
                    ) : (
                      <div className='rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm text-purple-800'>
                        <strong>Deposit/Send:</strong> Customer gives you cash → you send digital → your wallet <strong>DECREASES</strong>. Commission collected from customer.
                      </div>
                    )}

                    {/* Shared fields */}
                    <div className='grid gap-4 md:grid-cols-3'>
                      <div className='space-y-2'>
                        <Label>Select Wallet *</Label>
                        <Select value={bulkWithdrawalForm.walletId} onValueChange={handleBulkWithdrawalWalletChange}>
                          <SelectTrigger><SelectValue placeholder='Choose wallet...' /></SelectTrigger>
                          <SelectContent>
                            {wallets.length === 0 ? (
                              <div className='p-2 text-sm text-muted-foreground'>No wallets available.</div>
                            ) : wallets.map((wallet) => (
                              <SelectItem key={wallet.id} value={wallet.id}>
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
                      {isSavingBulk ? 'Saving...' : `✓ Save ${bulkWithdrawalTotals.validCount} ${bulkWithdrawalForm.transactionType === 'withdrawal' ? 'Withdrawal' : 'Deposit'} Entries`}
                    </Button>
                  </div>
                ) : (
                  /* ─── SINGLE ENTRY FORM ─── */
                  <form className='space-y-6' onSubmit={editingWithdrawal ? handleUpdateWithdrawal : handleWithdrawalSubmit}>

                  {/* Transaction Type Toggle */}
                  <div className='grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg'>
                    <button
                      type='button'
                      onClick={() => handleWithdrawalChange('transactionType', 'withdrawal')}
                      className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${withdrawalForm.transactionType === 'withdrawal' ? 'bg-white shadow text-orange-700 border border-orange-200' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      💸 Withdrawal (Customer gets cash) <span className='ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700'>↑ Cash Received in Account</span>
                    </button>
                    <button
                      type='button'
                      onClick={() => handleWithdrawalChange('transactionType', 'deposit')}
                      className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${withdrawalForm.transactionType === 'deposit' ? 'bg-white shadow text-purple-700 border border-purple-200' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      📲 Deposit (Customer sends via wallet) <span className='ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700'>↓ Cash Sent from Account</span>
                    </button>
                  </div>

                  {withdrawalForm.transactionType === 'withdrawal' ? (
                    <div className='rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800'>
                      <strong>Withdrawal:</strong> Customer sends digital money → your wallet <strong>INCREASES</strong> → you give cash to customer. Commission collected from customer.
                    </div>
                  ) : (
                    <div className='rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm text-purple-800'>
                      <strong>Deposit/Send:</strong> Customer gives you cash → you send digital from wallet → your wallet <strong>DECREASES</strong>. Commission collected from customer.
                    </div>
                  )}

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-wallet'>Select Wallet *</Label>
                      <Select value={withdrawalForm.walletId} onValueChange={(v) => handleWithdrawalChange('walletId', v)}>
                        <SelectTrigger id='withdrawal-wallet'><SelectValue placeholder='Choose wallet...' /></SelectTrigger>
                        <SelectContent>
                          {wallets.length === 0 ? (
                            <div className='p-2 text-sm text-muted-foreground'>No wallets available.</div>
                          ) : wallets.map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.id}>
                              {wallet.type} (Rs {Number(wallet.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-amount'>Amount (Rs) *</Label>
                      <Input id='withdrawal-amount' type='number' min='0' step='0.01' placeholder='e.g., 1000, 5000' value={withdrawalForm.amount} onChange={(e) => handleWithdrawalChange('amount', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='customer-name'>Customer Name - Optional</Label>
                      <Input id='customer-name' placeholder='e.g., Ahmed Khan' value={withdrawalForm.customerName} onChange={(e) => handleWithdrawalChange('customerName', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='customer-number'>Customer Account / Phone</Label>
                      <Input id='customer-number' type='tel' placeholder='e.g., 03001234567' value={withdrawalForm.customerNumber} onChange={(e) => handleWithdrawalChange('customerNumber', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-commission'>Commission Rate (%) - Optional</Label>
                      <Input id='withdrawal-commission' type='number' min='0' max='100' step='0.01' placeholder='e.g., 1, 1.5, 2' value={withdrawalForm.commissionRate} onChange={(e) => handleWithdrawalChange('commissionRate', e.target.value)} />
                      <p className='text-xs text-muted-foreground'>Commission Profit: Rs {withdrawalProfit.commissionProfit.toFixed(2)}</p>
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-extra'>Extra Charges (Rs) - Optional</Label>
                      <Input id='withdrawal-extra' type='number' min='0' step='0.01' placeholder='e.g., 5, 10' value={withdrawalForm.extraCharge} onChange={(e) => handleWithdrawalChange('extraCharge', e.target.value)} />
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-notes'>Notes - Optional</Label>
                      <Input id='withdrawal-notes' placeholder='Any additional notes' value={withdrawalForm.notes} onChange={(e) => handleWithdrawalChange('notes', e.target.value)} />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='withdrawal-date'>Date</Label>
                      <Input id='withdrawal-date' type='date' value={withdrawalForm.date} onChange={(e) => handleWithdrawalChange('date', e.target.value)} />
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
                        <div className='border-t-2 border-orange-200 pt-3 flex justify-between items-center'>
                          <span className='text-lg font-bold'>Your Profit:</span>
                          <span className='text-2xl font-bold text-orange-700'>Rs {withdrawalProfit.totalProfit.toFixed(2)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className='flex gap-2'>
                    <Button size='lg' type='submit' disabled={isSavingWithdrawal || !withdrawalForm.walletId || !withdrawalForm.amount} className='w-full md:w-auto bg-orange-500 hover:bg-orange-600'>
                      {isSavingWithdrawal ? 'Processing...' : editingWithdrawal ? '✓ Update Withdrawal' : '✓ Confirm Cash Withdrawal'}
                    </Button>
                    {editingWithdrawal && (
                      <Button size='lg' type='button' variant='outline' onClick={() => { setEditingWithdrawal(null); setWithdrawalForm(initialWithdrawalForm) }}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle>Recent Cash Withdrawals</CardTitle>
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
              <CardContent>
                {withdrawals.length === 0 ? (
                  <div className='flex items-center justify-center h-32'><p className='text-muted-foreground'>No withdrawals yet.</p></div>
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
                        <TableHead>Amount</TableHead>
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
                              {w.transactionType === 'withdrawal' ? '💸 Withdrawal' : '📲 Deposit'}
                            </span>
                          </TableCell>
                          <TableCell className='font-medium'>{w.walletType}</TableCell>
                          <TableCell>{w.customerName || '-'}</TableCell>
                          <TableCell>{w.customerNumber || '-'}</TableCell>
                          <TableCell className={w.transactionType === 'withdrawal' ? 'text-green-600' : 'text-red-600'}>
                            {w.transactionType === 'withdrawal' ? '+' : '-'} Rs {Number(w.amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell>{Number(w.commissionRate || 0).toFixed(2)}%</TableCell>
                          <TableCell className='text-orange-600 font-bold'>Rs {Number(w.profit || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className='flex gap-1'>
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

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this {deleteConfirm?.type === 'purchase' ? 'purchase' : deleteConfirm?.type === 'transaction' ? 'sale' : 'withdrawal'} record. Wallet balance and cash book entries will be reversed. This action cannot be undone.
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
            <AlertDialogTitle>Delete {selectedWithdrawalIds.size} withdrawal(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected withdrawal records. Wallet balances and cash book entries will be reversed for each. This action cannot be undone.
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
