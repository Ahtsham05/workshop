import { useState, useMemo, useEffect, useRef } from 'react'
import { format, isPast, isToday, addDays } from 'date-fns'
import { toast } from 'sonner'
import {
  CreditCard, Search, Plus, Trash2, Pencil, ChevronRight, X,
  CheckCircle2, AlertCircle, Clock, Ban, Users, Wallet, CalendarClock,
  Package, ChevronDown, Check,
} from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchAllProducts } from '@/stores/product.slice'
import { AppDispatch, RootState } from '@/stores/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { MobilePageShell } from '@/features/mobile-shop/components/mobile-page-shell'
import {
  useGetInstallmentPlansQuery,
  useGetInstallmentPlanQuery,
  useCreateInstallmentPlanMutation,
  useUpdateInstallmentPlanMutation,
  useDeleteInstallmentPlanMutation,
  useRecordInstallmentPaymentMutation,
  useGetInstallmentPaymentsQuery,
  useDeleteInstallmentPaymentMutation,
  useGetInstallmentSummaryQuery,
  type InstallmentPlanRecord,
  type InstallmentPaymentRecord,
} from '@/stores/mobile-shop.api'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import {
  MOBILE_FORM_KEYBOARD_HINT,
  makeEnterChain,
  useCtrlEnterSubmit,
} from '@/lib/mobile-form-keyboard'

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanFormState = {
  customerName: string
  customerPhone: string
  customerCNIC: string
  customerAddress: string
  guarantorName: string
  guarantorPhone: string
  itemDescription: string
  quantity: string
  totalAmount: string
  downPayment: string
  totalInstallments: string
  installmentFrequency: 'weekly' | 'biweekly' | 'monthly'
  installmentAmount: string
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'bank'
  startDate: string
  notes: string
}

type PaymentFormState = {
  amount: string
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'bank'
  date: string
  notes: string
}

const initialPlanForm = (): PlanFormState => ({
  customerName: '',
  customerPhone: '',
  customerCNIC: '',
  customerAddress: '',
  guarantorName: '',
  guarantorPhone: '',
  itemDescription: '',
  quantity: '1',
  totalAmount: '',
  downPayment: '0',
  totalInstallments: '',
  installmentFrequency: 'monthly',
  installmentAmount: '',
  paymentMethod: 'cash',
  startDate: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
})

const initialPaymentForm = (): PaymentFormState => ({
  amount: '',
  paymentMethod: 'cash',
  date: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
})

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)

const statusConfig = {
  active:    { label: 'Active',    color: 'bg-blue-100 text-blue-700',   icon: Clock },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  defaulted: { label: 'Defaulted', color: 'bg-red-100 text-red-700',     icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600',   icon: Ban },
}

const isDue = (plan: InstallmentPlanRecord) =>
  plan.status === 'active' && plan.nextDueDate && isPast(new Date(plan.nextDueDate)) && !isToday(new Date(plan.nextDueDate))

const isDueSoon = (plan: InstallmentPlanRecord) =>
  plan.status === 'active' && plan.nextDueDate &&
  !isPast(new Date(plan.nextDueDate)) &&
  new Date(plan.nextDueDate) <= addDays(new Date(), 7)

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InstallmentsPage() {
  const dispatch = useDispatch<AppDispatch>()
  const allProducts = useSelector((s: RootState) => s.product.products)
  const dataFetched = useRef(false)

  useEffect(() => {
    if (dataFetched.current) return
    dataFetched.current = true
    if (!allProducts.length) dispatch(fetchAllProducts({}))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTab, setActiveTab] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit] = useState(15)

  // Plan form / dialogs
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [planForm, setPlanForm] = useState<PlanFormState>(initialPlanForm)
  const [editingPlan, setEditingPlan] = useState<InstallmentPlanRecord | null>(null)
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null)

  // Product picker state
  const [productPopoverOpen, setProductPopoverOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)

  // Detail view (drawer-like dialog)
  const [detailPlanId, setDetailPlanId] = useState<string | null>(null)

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentPlanId, setPaymentPlanId] = useState<string | null>(null)
  const [paymentPlanName, setPaymentPlanName] = useState('')
  const [paymentPlanOutstanding, setPaymentPlanOutstanding] = useState(0)
  const [paymentPlanInstallmentAmount, setPaymentPlanInstallmentAmount] = useState(0)
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(initialPaymentForm)
  const [deletePaymentInfo, setDeletePaymentInfo] = useState<{ planId: string; paymentId: string } | null>(null)

  const planFormRef = useRef<HTMLFormElement>(null)
  const paymentFormRef = useRef<HTMLFormElement>(null)

  // Status update
  const [statusUpdateInfo, setStatusUpdateInfo] = useState<{ id: string; status: string } | null>(null)

  // Filtered products for search
  const filteredProducts = useMemo(() => {
    if (!productSearch) return allProducts
    const q = productSearch.toLowerCase()
    return allProducts.filter((p: any) =>
      p.name?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q)
    )
  }, [allProducts, productSearch])

  // API hooks
  const { data: summaryData, isLoading: isSummaryLoading } = useGetInstallmentSummaryQuery()
  const { data: plansData, isLoading: isPlansLoading } = useGetInstallmentPlansQuery({
    page,
    limit,
    status: activeTab !== 'all' ? activeTab : undefined,
    search: search || undefined,
  })
  const { data: detailPlan } = useGetInstallmentPlanQuery(detailPlanId!, { skip: !detailPlanId })
  const { data: paymentsData } = useGetInstallmentPaymentsQuery(
    { planId: detailPlanId!, limit: 100 },
    { skip: !detailPlanId }
  )
  const paymentDialogPayments = useGetInstallmentPaymentsQuery(
    { planId: paymentPlanId!, limit: 100 },
    { skip: !paymentPlanId }
  )

  const [createPlan, { isLoading: isCreating }] = useCreateInstallmentPlanMutation()
  const [updatePlan, { isLoading: isUpdating }] = useUpdateInstallmentPlanMutation()
  const [deletePlan, { isLoading: isDeleting }] = useDeleteInstallmentPlanMutation()
  const [recordPayment, { isLoading: isRecording }] = useRecordInstallmentPaymentMutation()
  const [deletePayment, { isLoading: isDeletingPayment }] = useDeleteInstallmentPaymentMutation()

  const planEnter = useMemo(
    () =>
      makeEnterChain(
        [
          'inst-customer-name',
          'inst-customer-phone',
          'inst-customer-cnic',
          'inst-customer-address',
          'inst-guarantor-name',
          'inst-guarantor-phone',
          'inst-product',
          'inst-item-description',
          'inst-quantity',
          'inst-total',
          'inst-down',
          'inst-installments',
          'inst-installment-amount',
          'inst-start-date',
          'inst-notes',
        ],
        { onSubmit: () => planFormRef.current?.requestSubmit() },
      ),
    [],
  )

  const paymentEnter = useMemo(
    () =>
      makeEnterChain(
        ['pay-amount', 'pay-date', 'pay-notes'],
        { onSubmit: () => paymentFormRef.current?.requestSubmit() },
      ),
    [],
  )

  useCtrlEnterSubmit(() => {
    if (paymentDialogOpen) {
      paymentFormRef.current?.requestSubmit()
      return
    }
    if (planDialogOpen) {
      planFormRef.current?.requestSubmit()
    }
  }, isCreating || isUpdating || isRecording)

  useEffect(() => {
    if (planDialogOpen) {
      window.setTimeout(() => planEnter.focusFirst(), 100)
    }
  }, [planDialogOpen, planEnter])

  useEffect(() => {
    if (paymentDialogOpen) {
      window.setTimeout(() => paymentEnter.focusFirst(), 100)
    }
  }, [paymentDialogOpen, paymentEnter])

  const plans = plansData?.results ?? []

  // Auto-calculate installment amount
  const calculatedInstallmentAmount = useMemo(() => {
    const total = Number(planForm.totalAmount) || 0
    const down = Number(planForm.downPayment) || 0
    const periods = Number(planForm.totalInstallments) || 0
    if (total > 0 && periods > 0) return ((total - down) / periods).toFixed(2)
    return ''
  }, [planForm.totalAmount, planForm.downPayment, planForm.totalInstallments])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const openCreateDialog = () => {
    setEditingPlan(null)
    setPlanForm(initialPlanForm())
    setSelectedProduct(null)
    setProductSearch('')
    setPlanDialogOpen(true)
  }

  const openEditDialog = (plan: InstallmentPlanRecord) => {
    setEditingPlan(plan)
    setSelectedProduct(null)
    setProductSearch('')
    setPlanForm({
      customerName: plan.customerName,
      customerPhone: plan.customerPhone || '',
      customerCNIC: plan.customerCNIC || '',
      customerAddress: plan.customerAddress || '',
      guarantorName: plan.guarantorName || '',
      guarantorPhone: plan.guarantorPhone || '',
      itemDescription: plan.itemDescription,
      quantity: String(plan.quantity || 1),
      totalAmount: String(plan.totalAmount),
      downPayment: String(plan.downPayment),
      totalInstallments: String(plan.totalInstallments),
      installmentFrequency: plan.installmentFrequency || 'monthly',
      installmentAmount: String(plan.installmentAmount),
      paymentMethod: 'cash',
      startDate: format(new Date(plan.startDate), 'yyyy-MM-dd'),
      notes: plan.notes || '',
    })
    setPlanDialogOpen(true)
  }

  const openPaymentDialog = (plan: InstallmentPlanRecord) => {
    setPaymentPlanId(plan.id)
    setPaymentPlanName(plan.customerName)
    setPaymentPlanOutstanding(plan.totalOutstanding)
    setPaymentPlanInstallmentAmount(plan.installmentAmount)
    setPaymentForm({
      ...initialPaymentForm(),
      amount: String(plan.installmentAmount),
    })
    setPaymentDialogOpen(true)
  }

  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product)
    setProductSearch('')
    setProductPopoverOpen(false)
    const salePrice = product.salePrice ?? product.sellingPrice ?? product.price ?? 0
    setPlanForm(prev => {
      const quantity = Number(prev.quantity) || 1
      const totalAmountValue = salePrice * quantity
      const totalAmount = String(totalAmountValue)
      const down = Number(prev.downPayment) || 0
      const periods = Number(prev.totalInstallments) || 0
      const installmentAmount = totalAmountValue > 0 && periods > 0
        ? ((totalAmountValue - down) / periods).toFixed(2)
        : prev.installmentAmount
      return {
        ...prev,
        itemDescription: product.name,
        totalAmount,
        installmentAmount,
      }
    })
  }

  const handlePlanFormChange = (field: keyof PlanFormState, value: string) => {
    setPlanForm(prev => {
      const next = { ...prev, [field]: value }
      // Auto-calculate installment amount unless user manually set it
      if (['totalAmount', 'downPayment', 'totalInstallments', 'quantity'].includes(field)) {
        let total = Number(field === 'totalAmount' ? value : prev.totalAmount) || 0
        const quantity = Number(field === 'quantity' ? value : prev.quantity) || 1
        const down = Number(field === 'downPayment' ? value : prev.downPayment) || 0
        const periods = Number(field === 'totalInstallments' ? value : prev.totalInstallments) || 0
        if (field === 'quantity' && selectedProduct) {
          const unitPrice = selectedProduct.salePrice ?? selectedProduct.sellingPrice ?? selectedProduct.price ?? 0
          total = unitPrice * quantity
          next.totalAmount = String(total)
        }
        if (total > 0 && periods > 0) next.installmentAmount = ((total - down) / periods).toFixed(2)
      }
      return next
    })
  }

  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!planForm.customerName.trim()) { toast.error('Customer name is required'); return }
    if (!planForm.itemDescription.trim()) { toast.error('Item description is required'); return }
    if (!editingPlan && !selectedProduct) { toast.error('Please select a product from stock'); return }
    if (!planForm.quantity || Number(planForm.quantity) < 1) { toast.error('Quantity must be at least 1'); return }
    if (!editingPlan && selectedProduct && Number(planForm.quantity) > Number(selectedProduct.stockQuantity ?? 0)) {
      toast.error(`Only ${selectedProduct.stockQuantity ?? 0} item(s) available in stock`)
      return
    }
    if (!planForm.totalAmount || Number(planForm.totalAmount) <= 0) { toast.error('Valid total amount required'); return }
    if (!planForm.totalInstallments || Number(planForm.totalInstallments) < 1) { toast.error('Number of installments required'); return }
    if (!planForm.installmentAmount || Number(planForm.installmentAmount) <= 0) { toast.error('Installment amount required'); return }

    try {
      if (editingPlan) {
        await updatePlan({
          id: editingPlan.id,
          body: {
            customerName: planForm.customerName.trim(),
            customerPhone: planForm.customerPhone.trim(),
            customerCNIC: planForm.customerCNIC.trim(),
            customerAddress: planForm.customerAddress.trim(),
            guarantorName: planForm.guarantorName.trim(),
            guarantorPhone: planForm.guarantorPhone.trim(),
            itemDescription: planForm.itemDescription.trim(),
            quantity: Number(planForm.quantity) || 1,
            totalInstallments: Number(planForm.totalInstallments),
            installmentFrequency: planForm.installmentFrequency,
            installmentAmount: Number(planForm.installmentAmount),
            notes: planForm.notes.trim(),
          },
        }).unwrap()
        toast.success('Installment plan updated!')
      } else {
        await createPlan({
          customerName: planForm.customerName.trim(),
          customerPhone: planForm.customerPhone.trim() || undefined,
          customerCNIC: planForm.customerCNIC.trim() || undefined,
          customerAddress: planForm.customerAddress.trim() || undefined,
          guarantorName: planForm.guarantorName.trim() || undefined,
          guarantorPhone: planForm.guarantorPhone.trim() || undefined,
          itemDescription: planForm.itemDescription.trim(),
          productId: String(selectedProduct?._id || selectedProduct?.id),
          quantity: Number(planForm.quantity) || 1,
          totalAmount: Number(planForm.totalAmount),
          downPayment: Number(planForm.downPayment) || 0,
          totalInstallments: Number(planForm.totalInstallments),
          installmentFrequency: planForm.installmentFrequency,
          installmentAmount: Number(planForm.installmentAmount),
          paymentMethod: planForm.paymentMethod,
          startDate: planForm.startDate ? new Date(planForm.startDate).toISOString() : new Date().toISOString(),
          notes: planForm.notes.trim() || undefined,
        }).unwrap()
        toast.success('Installment plan created!')
      }
      setPlanDialogOpen(false)
      setEditingPlan(null)
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save plan')
    }
  }

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paymentPlanId) return
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) { toast.error('Enter a valid amount'); return }
    try {
      const result = await recordPayment({
        planId: paymentPlanId,
        amount: Number(paymentForm.amount),
        paymentMethod: paymentForm.paymentMethod,
        date: paymentForm.date ? new Date(paymentForm.date).toISOString() : new Date().toISOString(),
        notes: paymentForm.notes.trim() || undefined,
      }).unwrap()
      toast.success(`Payment #${result.payment.paymentNumber} recorded!`)
      // Reset amount to installment amount for next payment
      setPaymentForm(prev => ({ ...prev, amount: String(paymentPlanInstallmentAmount), notes: '' }))
      if (result.plan.status === 'completed') {
        toast.success('🎉 Plan fully paid off!')
        setPaymentDialogOpen(false)
      }
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to record payment')
    }
  }

  const handleDeletePlan = async () => {
    if (!deletePlanId) return
    try {
      await deletePlan(deletePlanId).unwrap()
      toast.success('Plan deleted')
      setDeletePlanId(null)
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to delete')
    }
  }

  const handleDeletePayment = async () => {
    if (!deletePaymentInfo) return
    try {
      await deletePayment(deletePaymentInfo).unwrap()
      toast.success('Payment reversed')
      setDeletePaymentInfo(null)
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to reverse payment')
    }
  }

  const handleStatusUpdate = async () => {
    if (!statusUpdateInfo) return
    try {
      await updatePlan({ id: statusUpdateInfo.id, body: { status: statusUpdateInfo.status as any } }).unwrap()
      toast.success('Status updated')
      setStatusUpdateInfo(null)
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to update status')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <MobilePageShell title='Installments' description={`Manage product installment plans & customer payments · ${MOBILE_FORM_KEYBOARD_HINT}`}>

      {/* ── Summary Cards ── */}
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6'>
        {isSummaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className='h-28 rounded-xl' />)
        ) : (
          <>
            <Card className='border-blue-200'>
              <CardContent className='pt-5 pb-4'>
                <div className='flex items-center justify-between mb-1'>
                  <span className='text-sm text-muted-foreground font-medium'>Active Plans</span>
                  <Users className='h-4 w-4 text-blue-500' />
                </div>
                <div className='text-2xl font-bold text-blue-600'>{summaryData?.active.count ?? 0}</div>
                <p className='text-xs text-muted-foreground mt-1'>Outstanding: {fmt(summaryData?.active.totalOutstanding ?? 0)}</p>
              </CardContent>
            </Card>
            <Card className='border-orange-200'>
              <CardContent className='pt-5 pb-4'>
                <div className='flex items-center justify-between mb-1'>
                  <span className='text-sm text-muted-foreground font-medium'>Overdue</span>
                  <AlertCircle className='h-4 w-4 text-orange-500' />
                </div>
                <div className='text-2xl font-bold text-orange-600'>{summaryData?.overdueCount ?? 0}</div>
                <p className='text-xs text-muted-foreground mt-1'>Plans past due date</p>
              </CardContent>
            </Card>
            <Card className='border-green-200'>
              <CardContent className='pt-5 pb-4'>
                <div className='flex items-center justify-between mb-1'>
                  <span className='text-sm text-muted-foreground font-medium'>Completed</span>
                  <CheckCircle2 className='h-4 w-4 text-green-500' />
                </div>
                <div className='text-2xl font-bold text-green-600'>{summaryData?.completed.count ?? 0}</div>
                <p className='text-xs text-muted-foreground mt-1'>Fully recovered</p>
              </CardContent>
            </Card>
            <Card className='border-purple-200'>
              <CardContent className='pt-5 pb-4'>
                <div className='flex items-center justify-between mb-1'>
                  <span className='text-sm text-muted-foreground font-medium'>Total Collected</span>
                  <Wallet className='h-4 w-4 text-purple-500' />
                </div>
                <div className='text-2xl font-bold text-purple-600'>{fmt(summaryData?.totalCollected ?? 0)}</div>
                <p className='text-xs text-muted-foreground mt-1'>Installment payments received</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Plans List ── */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <CreditCard className='h-5 w-5 text-primary' /> Installment Plans
            </CardTitle>
            <Button onClick={openCreateDialog} className='gap-2 w-full sm:w-auto'>
              <Plus className='h-4 w-4' /> New Plan
            </Button>
          </div>
          {/* Search */}
          <div className='relative mt-3'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search by name, phone, CNIC, item...'
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className='pl-9'
            />
            {search && (
              <button onClick={() => setSearch('')} className='absolute right-3 top-1/2 -translate-y-1/2'>
                <X className='h-4 w-4 text-muted-foreground hover:text-foreground' />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Status tabs */}
          <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setPage(1) }} className='mb-4'>
            <TabsList className='flex-wrap h-auto gap-1'>
              <TabsTrigger value='all'>All</TabsTrigger>
              <TabsTrigger value='active'>Active</TabsTrigger>
              <TabsTrigger value='completed'>Completed</TabsTrigger>
              <TabsTrigger value='defaulted'>Defaulted</TabsTrigger>
              <TabsTrigger value='cancelled'>Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>

          {isPlansLoading ? (
            <div className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className='h-20 rounded-lg' />)}
            </div>
          ) : plans.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
              <CreditCard className='h-12 w-12 mb-3 opacity-30' />
              <p className='text-base font-medium'>No installment plans found</p>
              <p className='text-sm'>Create a new plan to get started</p>
            </div>
          ) : (
            <>
              <div className='space-y-3'>
                {plans.map(plan => {
                  const cfg = statusConfig[plan.status]
                  const overdue = isDue(plan)
                  const dueSoon = isDueSoon(plan)
                  const progress = plan.totalInstallments > 0
                    ? Math.round((plan.paidInstallments / plan.totalInstallments) * 100)
                    : 0

                  return (
                    <div
                      key={plan.id}
                      className={`rounded-lg border p-4 hover:bg-muted/30 transition-colors ${overdue ? 'border-red-300 bg-red-50/40' : dueSoon ? 'border-orange-200 bg-orange-50/30' : ''}`}
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center gap-2 flex-wrap mb-1'>
                            <span className='font-semibold text-sm truncate'>{plan.customerName}</span>
                            <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                            {overdue && <Badge className='text-xs bg-red-100 text-red-700'>⚠ Overdue</Badge>}
                            {dueSoon && <Badge className='text-xs bg-orange-100 text-orange-700'>Due Soon</Badge>}
                            <span className='text-xs text-muted-foreground font-mono'>{plan.planNumber}</span>
                          </div>
                          <p className='text-xs text-muted-foreground truncate mb-2'>{plan.itemDescription}</p>
                          <div className='flex items-center gap-4 flex-wrap text-xs'>
                            <span className='text-muted-foreground'>Total: <strong className='text-foreground'>{fmt(plan.totalAmount)}</strong></span>
                            <span className='text-muted-foreground'>Outstanding: <strong className='text-red-600'>{fmt(plan.totalOutstanding)}</strong></span>
                            <span className='text-muted-foreground'>Installments: <strong className='text-foreground'>{plan.paidInstallments}/{plan.totalInstallments}</strong></span>
                            {plan.customerPhone && <span className='text-muted-foreground'>📞 {plan.customerPhone}</span>}
                          </div>
                          {/* Progress bar */}
                          <div className='mt-2 flex items-center gap-2'>
                            <Progress value={progress} className='h-1.5 flex-1' />
                            <span className='text-xs text-muted-foreground w-8 text-right'>{progress}%</span>
                          </div>
                          {plan.nextDueDate && plan.status === 'active' && (
                            <p className={`text-xs mt-1 ${overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                              <CalendarClock className='inline h-3 w-3 mr-1' />
                              Next due: {format(new Date(plan.nextDueDate), 'dd MMM yyyy')}
                            </p>
                          )}
                        </div>
                        <div className='flex items-center gap-1 flex-shrink-0'>
                          {plan.status === 'active' && (
                            <Button
                              size='sm'
                              className='bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs'
                              onClick={() => openPaymentDialog(plan)}
                            >
                              + Pay
                            </Button>
                          )}
                          <Button size='icon' variant='ghost' className='h-8 w-8' onClick={() => setDetailPlanId(plan.id)}>
                            <ChevronRight className='h-4 w-4' />
                          </Button>
                          <Button size='icon' variant='ghost' className='h-8 w-8' onClick={() => openEditDialog(plan)}>
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button size='icon' variant='ghost' className='h-8 w-8 text-red-500 hover:text-red-700' onClick={() => setDeletePlanId(plan.id)}>
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <SimplePagination
                currentPage={page}
                totalPages={plansData?.totalPages ?? 1}
                totalResults={plansData?.totalResults}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={() => {}}
                className='mt-4'
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Create / Edit Plan Dialog ── */}
      <Dialog open={planDialogOpen} onOpenChange={open => { if (!open) { setPlanDialogOpen(false); setEditingPlan(null) } }}>
        <DialogContent className='w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Installment Plan' : 'New Installment Plan'}</DialogTitle>
          </DialogHeader>
          <form ref={planFormRef} onSubmit={handlePlanSubmit} className='space-y-5'>

            {/* Customer Info */}
            <div>
              <h4 className='text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3'>Customer Information</h4>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label>Customer Name *</Label>
                  <Input value={planForm.customerName} onChange={e => handlePlanFormChange('customerName', e.target.value)} placeholder='Full name' {...planEnter.enterProps('inst-customer-name')} />
                </div>
                <div className='space-y-1'>
                  <Label>Phone Number</Label>
                  <Input value={planForm.customerPhone} onChange={e => handlePlanFormChange('customerPhone', e.target.value)} placeholder='03XX-XXXXXXX' {...planEnter.enterProps('inst-customer-phone')} />
                </div>
                <div className='space-y-1'>
                  <Label>CNIC</Label>
                  <Input value={planForm.customerCNIC} onChange={e => handlePlanFormChange('customerCNIC', e.target.value)} placeholder='XXXXX-XXXXXXX-X' {...planEnter.enterProps('inst-customer-cnic')} />
                </div>
                <div className='space-y-1'>
                  <Label>Address</Label>
                  <Input value={planForm.customerAddress} onChange={e => handlePlanFormChange('customerAddress', e.target.value)} placeholder='Customer address' {...planEnter.enterProps('inst-customer-address')} />
                </div>
              </div>
            </div>

            {/* Guarantor */}
            <div>
              <h4 className='text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3'>Guarantor (Optional)</h4>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label>Guarantor Name</Label>
                  <Input value={planForm.guarantorName} onChange={e => handlePlanFormChange('guarantorName', e.target.value)} placeholder='Guarantor full name' {...planEnter.enterProps('inst-guarantor-name')} />
                </div>
                <div className='space-y-1'>
                  <Label>Guarantor Phone</Label>
                  <Input value={planForm.guarantorPhone} onChange={e => handlePlanFormChange('guarantorPhone', e.target.value)} placeholder='03XX-XXXXXXX' {...planEnter.enterProps('inst-guarantor-phone')} />
                </div>
              </div>
            </div>

            {/* Sale Details */}
            <div>
              <h4 className='text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3'>Sale Details</h4>
              <div className='space-y-3'>

                {/* Product picker */}
                <div className='space-y-1'>
                  <Label>Product *</Label>
                  <Popover open={productPopoverOpen} onOpenChange={o => { setProductPopoverOpen(o); if (!o) setProductSearch('') }}>
                    <PopoverTrigger asChild>
                      <Button
                        type='button'
                        variant='outline'
                        className={`w-full justify-between font-normal ${!selectedProduct && !editingPlan ? 'text-muted-foreground' : ''}`}
                        {...planEnter.enterProps('inst-product')}
                      >
                        <div className='flex items-center gap-2 min-w-0'>
                          {selectedProduct?.image?.url ? (
                            <img src={selectedProduct.image.url} alt='' className='h-6 w-6 rounded object-cover flex-shrink-0' />
                          ) : (
                            <Package className='h-4 w-4 text-muted-foreground flex-shrink-0' />
                          )}
                          <span className='truncate'>
                            {selectedProduct
                              ? selectedProduct.name
                              : editingPlan
                                ? planForm.itemDescription
                                : 'Search and select a product...'}
                          </span>
                        </div>
                        <ChevronDown className='h-4 w-4 opacity-50 flex-shrink-0' />
                      </Button>
                    </PopoverTrigger>
                  <PopoverContent className='w-[var(--radix-popover-trigger-width)] max-w-[90vw] p-0' align='start'>
                      <Command>
                        <CommandInput
                          placeholder='Search by name, barcode, SKU...'
                          value={productSearch}
                          onValueChange={setProductSearch}
                        />
                        <CommandEmpty>No products found.</CommandEmpty>
                        <CommandGroup className='max-h-72 overflow-auto'>
                          {filteredProducts.map((p: any) => {
                            const price = p.salePrice ?? p.sellingPrice ?? p.price ?? 0
                            const isSelected = selectedProduct?.id === p.id || selectedProduct?._id === p._id
                            return (
                              <CommandItem
                                key={p._id || p.id}
                                value={p.name}
                                onSelect={() => handleSelectProduct(p)}
                                className='flex items-center gap-3 cursor-pointer'
                              >
                                {p.image?.url ? (
                                  <img src={p.image.url} alt={p.name} className='h-9 w-9 rounded object-cover flex-shrink-0' />
                                ) : (
                                  <div className='flex h-9 w-9 items-center justify-center rounded bg-muted flex-shrink-0'>
                                    <Package className='h-4 w-4 text-muted-foreground' />
                                  </div>
                                )}
                                <div className='flex-1 min-w-0'>
                                  <p className='truncate font-medium'>{p.name}</p>
                                  <p className='text-xs text-muted-foreground'>
                                    {p.barcode ? `Barcode: ${p.barcode} · ` : ''}
                                    Stock: {p.stockQuantity ?? 0} · Price: Rs {price.toLocaleString()}
                                  </p>
                                </div>
                                {isSelected && <Check className='h-4 w-4 text-primary flex-shrink-0' />}
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Extra description (e.g. IMEI, color) */}
                <div className='space-y-1'>
                  <Label>Item Description / Notes {!editingPlan && <span className='text-muted-foreground font-normal'>(auto-filled from product)</span>}</Label>
                  <Input
                    value={planForm.itemDescription}
                    onChange={e => handlePlanFormChange('itemDescription', e.target.value)}
                    placeholder='e.g. Samsung Galaxy A54 – IMEI: 123456789, Color: Black'
                    {...planEnter.enterProps('inst-item-description')}
                  />
                </div>
                <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                  <div className='space-y-1'>
                    <Label>Quantity *</Label>
                    <Input type='number' min='1' step='1' value={planForm.quantity} onChange={e => handlePlanFormChange('quantity', e.target.value)} placeholder='1' disabled={!!editingPlan} {...planEnter.enterProps('inst-quantity')} />
                    {selectedProduct && !editingPlan && (
                      <p className='text-xs text-muted-foreground'>In stock: {selectedProduct.stockQuantity ?? 0}</p>
                    )}
                  </div>
                  <div className='space-y-1'>
                    <Label>Total Sale Price (Rs) *</Label>
                    <Input type='number' min='0' step='0.01' value={planForm.totalAmount} onChange={e => handlePlanFormChange('totalAmount', e.target.value)} placeholder='0' {...planEnter.enterProps('inst-total')} />
                  </div>
                  <div className='space-y-1'>
                    <Label>Down Payment (Rs)</Label>
                    <Input type='number' min='0' step='0.01' value={planForm.downPayment} onChange={e => handlePlanFormChange('downPayment', e.target.value)} placeholder='0' {...planEnter.enterProps('inst-down')} />
                  </div>
                  <div className='space-y-1'>
                    <Label>Remaining</Label>
                    <Input
                      readOnly
                      value={`Rs ${Math.max(0, (Number(planForm.totalAmount) || 0) - (Number(planForm.downPayment) || 0)).toLocaleString()}`}
                      className='bg-muted'
                    />
                  </div>
                </div>
                <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                  <div className='space-y-1'>
                    <Label className='min-h-5 inline-flex items-center'>No. of Installments *</Label>
                    <Input type='number' min='1' step='1' value={planForm.totalInstallments} onChange={e => handlePlanFormChange('totalInstallments', e.target.value)} placeholder='e.g. 12' {...planEnter.enterProps('inst-installments')} />
                  </div>
                  <div className='space-y-1'>
                    <Label className='min-h-5 inline-flex items-center'>Installment Amount *</Label>
                    <Input
                      type='number' min='0' step='0.01'
                      value={planForm.installmentAmount}
                      onChange={e => handlePlanFormChange('installmentAmount', e.target.value)}
                      placeholder={calculatedInstallmentAmount || '0'}
                      {...planEnter.enterProps('inst-installment-amount')}
                    />
                    {calculatedInstallmentAmount && planForm.installmentAmount !== calculatedInstallmentAmount && (
                      <button type='button' className='text-xs text-blue-600 hover:underline' onClick={() => handlePlanFormChange('installmentAmount', calculatedInstallmentAmount)}>
                        Auto: Rs {Number(calculatedInstallmentAmount).toLocaleString()}
                      </button>
                    )}
                  </div>
                  <div className='space-y-1'>
                    <Label className='min-h-5 inline-flex items-center'>Start Date</Label>
                    <Input type='date' value={planForm.startDate} onChange={e => handlePlanFormChange('startDate', e.target.value)} {...planEnter.enterProps('inst-start-date')} />
                  </div>
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='space-y-1'>
                    <Label>Installment Frequency</Label>
                    <Select value={planForm.installmentFrequency} onValueChange={v => handlePlanFormChange('installmentFrequency', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value='weekly'>Weekly (7 days)</SelectItem>
                        <SelectItem value='biweekly'>Every 15 days</SelectItem>
                        <SelectItem value='monthly'>Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!editingPlan && (
                    <div className='space-y-1'>
                      <Label>Down Payment Method</Label>
                      <Select value={planForm.paymentMethod} onValueChange={v => handlePlanFormChange('paymentMethod', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value='cash'>Cash</SelectItem>
                          <SelectItem value='jazzcash'>JazzCash</SelectItem>
                          <SelectItem value='easypaisa'>Easypaisa</SelectItem>
                          <SelectItem value='bank'>Bank</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className='space-y-1'>
                  <Label>Notes</Label>
                  <Textarea value={planForm.notes} onChange={e => handlePlanFormChange('notes', e.target.value)} placeholder='Any additional notes...' rows={2} {...planEnter.enterProps('inst-notes')} />
                </div>
              </div>
            </div>

            {/* Summary preview */}
            {!editingPlan && planForm.totalAmount && planForm.totalInstallments && (
              <div className='rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm space-y-1'>
                <p className='font-semibold text-blue-700'>Plan Summary</p>
                <div className='grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-blue-900'>
                  <span>Total Amount:</span><span className='font-medium'>{fmt(Number(planForm.totalAmount) || 0)}</span>
                  <span>Down Payment:</span><span className='font-medium'>{fmt(Number(planForm.downPayment) || 0)}</span>
                  <span>Remaining:</span><span className='font-medium'>{fmt(Math.max(0, (Number(planForm.totalAmount) || 0) - (Number(planForm.downPayment) || 0)))}</span>
                  <span>Per Installment:</span><span className='font-medium'>{fmt(Number(planForm.installmentAmount) || 0)}</span>
                  <span>Frequency:</span><span className='font-medium'>{planForm.installmentFrequency === 'biweekly' ? 'Every 15 days' : planForm.installmentFrequency === 'weekly' ? 'Weekly' : 'Monthly'}</span>
                  <span>Duration:</span><span className='font-medium'>{planForm.totalInstallments} installments</span>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setPlanDialogOpen(false)}>Cancel</Button>
              <Button type='submit' disabled={isCreating || isUpdating}>
                {(isCreating || isUpdating) ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment Dialog ── */}
      <Dialog open={paymentDialogOpen} onOpenChange={open => { if (!open) setPaymentDialogOpen(false) }}>
        <DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Record Payment — {paymentPlanName}</DialogTitle>
          </DialogHeader>
          <div className='flex items-center justify-between p-3 rounded-lg bg-muted mb-2'>
            <span className='text-sm text-muted-foreground'>Outstanding Balance</span>
            <span className='font-bold text-red-600 text-lg'>{fmt(paymentPlanOutstanding)}</span>
          </div>
          <form ref={paymentFormRef} onSubmit={handlePaymentSubmit} className='space-y-4'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>Amount (Rs) *</Label>
                <Input type='number' min='0.01' step='0.01' max={paymentPlanOutstanding} value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} {...paymentEnter.enterProps('pay-amount')} />
              </div>
              <div className='space-y-1'>
                <Label>Payment Method</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm(p => ({ ...p, paymentMethod: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='cash'>Cash</SelectItem>
                    <SelectItem value='jazzcash'>JazzCash</SelectItem>
                    <SelectItem value='easypaisa'>Easypaisa</SelectItem>
                    <SelectItem value='bank'>Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className='space-y-1'>
              <Label>Date</Label>
              <Input type='date' value={paymentForm.date} onChange={e => setPaymentForm(p => ({ ...p, date: e.target.value }))} {...paymentEnter.enterProps('pay-date')} />
            </div>
            <div className='space-y-1'>
              <Label>Notes</Label>
              <Input value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} placeholder='Optional note' {...paymentEnter.enterProps('pay-notes')} />
            </div>

            {/* Payment history in dialog */}
            {(paymentDialogPayments.data?.results ?? []).length > 0 && (
              <div>
                <h4 className='text-sm font-semibold mb-2'>Payment History</h4>
                <div className='max-h-48 overflow-y-auto space-y-1.5'>
                  {(paymentDialogPayments.data?.results ?? []).map((pmt: InstallmentPaymentRecord) => (
                    <div key={pmt.id} className='flex items-center justify-between text-xs rounded bg-muted/50 px-3 py-1.5'>
                      <span className='text-muted-foreground'>{pmt.isDownPayment ? 'Down Payment' : `#${pmt.paymentNumber}`} — {format(new Date(pmt.date), 'dd MMM yyyy')}</span>
                      <div className='flex items-center gap-2'>
                        <span className='font-medium text-green-700'>{fmt(pmt.amount)}</span>
                        {!pmt.isDownPayment && (
                          <button type='button' onClick={() => setDeletePaymentInfo({ planId: paymentPlanId!, paymentId: pmt.id })} className='text-red-400 hover:text-red-600'>
                            <Trash2 className='h-3 w-3' />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setPaymentDialogOpen(false)}>Close</Button>
              <Button type='submit' disabled={isRecording} className='bg-green-600 hover:bg-green-700'>
                {isRecording ? 'Recording...' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Plan Detail Dialog ── */}
      <Dialog open={!!detailPlanId} onOpenChange={open => { if (!open) setDetailPlanId(null) }}>
        <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
          {detailPlan ? (
            <>
              <DialogHeader>
                <DialogTitle className='flex items-center gap-2'>
                  <CreditCard className='h-5 w-5' /> {detailPlan.customerName}
                  <Badge className={`text-xs ${statusConfig[detailPlan.status].color}`}>{statusConfig[detailPlan.status].label}</Badge>
                </DialogTitle>
                <p className='text-xs text-muted-foreground font-mono'>{detailPlan.planNumber}</p>
              </DialogHeader>

              {/* Plan details grid */}
              <div className='grid gap-4 sm:grid-cols-2 mt-2'>
                <div className='space-y-3'>
                  <DetailRow label='Item' value={detailPlan.itemDescription} />
                  <DetailRow label='Customer Phone' value={detailPlan.customerPhone || '—'} />
                  <DetailRow label='CNIC' value={detailPlan.customerCNIC || '—'} />
                  <DetailRow label='Address' value={detailPlan.customerAddress || '—'} />
                  {detailPlan.guarantorName && <DetailRow label='Guarantor' value={`${detailPlan.guarantorName} — ${detailPlan.guarantorPhone || ''}`} />}
                </div>
                <div className='space-y-3'>
                  <DetailRow label='Total Amount' value={fmt(detailPlan.totalAmount)} highlight />
                  <DetailRow label='Down Payment' value={fmt(detailPlan.downPayment)} />
                  <DetailRow label='Installment' value={`${fmt(detailPlan.installmentAmount)} × ${detailPlan.totalInstallments} (${detailPlan.installmentFrequency === 'biweekly' ? 'Every 15 days' : detailPlan.installmentFrequency})`} />
                  <DetailRow label='Paid' value={`${fmt(detailPlan.totalPaid)} (${detailPlan.paidInstallments}/${detailPlan.totalInstallments})`} />
                  <DetailRow label='Outstanding' value={fmt(detailPlan.totalOutstanding)} highlight danger={detailPlan.totalOutstanding > 0} />
                  {detailPlan.nextDueDate && detailPlan.status === 'active' && (
                    <DetailRow label='Next Due' value={format(new Date(detailPlan.nextDueDate), 'dd MMM yyyy')} danger={!!isDue(detailPlan)} />
                  )}
                  <DetailRow label='Start Date' value={format(new Date(detailPlan.startDate), 'dd MMM yyyy')} />
                </div>
              </div>

              {/* Progress */}
              <div className='mt-2'>
                <div className='flex justify-between text-xs mb-1'>
                  <span className='text-muted-foreground'>Recovery Progress</span>
                  <span className='font-medium'>{Math.round((detailPlan.paidInstallments / detailPlan.totalInstallments) * 100)}%</span>
                </div>
                <Progress value={Math.round((detailPlan.paidInstallments / detailPlan.totalInstallments) * 100)} />
              </div>

              {/* Status control */}
              {detailPlan.status === 'active' && (
                <div className='flex gap-2 flex-wrap'>
                  <Button size='sm' variant='outline' className='text-red-600 border-red-200 hover:bg-red-50'
                    onClick={() => setStatusUpdateInfo({ id: detailPlan.id, status: 'defaulted' })}>
                    Mark as Defaulted
                  </Button>
                  <Button size='sm' variant='outline' className='text-gray-600 border-gray-200'
                    onClick={() => setStatusUpdateInfo({ id: detailPlan.id, status: 'cancelled' })}>
                    Cancel Plan
                  </Button>
                </div>
              )}
              {(detailPlan.status === 'defaulted' || detailPlan.status === 'cancelled') && (
                <Button size='sm' variant='outline' className='text-blue-600 border-blue-200 hover:bg-blue-50'
                  onClick={() => setStatusUpdateInfo({ id: detailPlan.id, status: 'active' })}>
                  Reactivate Plan
                </Button>
              )}

              {detailPlan.notes && (
                <div className='text-sm text-muted-foreground bg-muted/50 rounded p-3'>
                  <strong>Notes:</strong> {detailPlan.notes}
                </div>
              )}

              {/* Full payment history */}
              <div>
                <h4 className='text-sm font-semibold mb-2'>All Payments</h4>
                {(paymentsData?.results ?? []).length === 0 ? (
                  <p className='text-sm text-muted-foreground'>No payments recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentsData!.results.map((pmt: InstallmentPaymentRecord) => (
                        <TableRow key={pmt.id}>
                          <TableCell className='text-xs'>{pmt.isDownPayment ? 'DP' : `#${pmt.paymentNumber}`}</TableCell>
                          <TableCell className='text-xs'>{format(new Date(pmt.date), 'dd MMM yyyy')}</TableCell>
                          <TableCell className='text-green-700 font-medium'>{fmt(pmt.amount)}</TableCell>
                          <TableCell className='text-xs capitalize'>{pmt.paymentMethod}</TableCell>
                          <TableCell className='text-xs text-muted-foreground'>{pmt.notes || '—'}</TableCell>
                          <TableCell>
                            {!pmt.isDownPayment && (
                              <button onClick={() => setDeletePaymentInfo({ planId: detailPlan.id, paymentId: pmt.id })} className='text-red-400 hover:text-red-600'>
                                <Trash2 className='h-3.5 w-3.5' />
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <DialogFooter>
                {detailPlan.status === 'active' && (
                  <Button className='bg-green-600 hover:bg-green-700' onClick={() => { setDetailPlanId(null); openPaymentDialog(detailPlan) }}>
                    + Record Payment
                  </Button>
                )}
                <Button variant='outline' onClick={() => setDetailPlanId(null)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <div className='py-8 flex justify-center'><Skeleton className='h-48 w-full' /></div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Plan Confirm ── */}
      <AlertDialog open={!!deletePlanId} onOpenChange={open => !open && setDeletePlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Installment Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the plan and all its payment records. Cashbook entries will be reversed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePlan} disabled={isDeleting} className='bg-red-600 hover:bg-red-700'>
              {isDeleting ? 'Deleting...' : 'Delete Plan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Payment Confirm ── */}
      <AlertDialog open={!!deletePaymentInfo} onOpenChange={open => !open && setDeletePaymentInfo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the payment, update the plan balance, and remove the cashbook entry. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePayment} disabled={isDeletingPayment} className='bg-red-600 hover:bg-red-700'>
              {isDeletingPayment ? 'Reversing...' : 'Reverse Payment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Status Update Confirm ── */}
      <AlertDialog open={!!statusUpdateInfo} onOpenChange={open => !open && setStatusUpdateInfo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Status?</AlertDialogTitle>
            <AlertDialogDescription>
              Change plan status to <strong className='capitalize'>{statusUpdateInfo?.status}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusUpdate}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </MobilePageShell>
  )
}

// ── Small helper component ────────────────────────────────────────────────────

function DetailRow({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
  return (
    <div className='flex flex-col'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <span className={`text-sm font-medium ${danger ? 'text-red-600' : highlight ? 'text-foreground' : ''}`}>{value}</span>
    </div>
  )
}
