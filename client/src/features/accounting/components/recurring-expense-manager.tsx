import { useState, useMemo } from 'react'
import { useDispatch } from 'react-redux'
import {
  Plus, Trash2, Pencil, RefreshCw, Loader2, CalendarClock,
  ChevronDown, ChevronUp, Check, ChevronsUpDown, Wallet, CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  recurringExpenseApi,
  useGetRecurringExpensesQuery,
  useCreateRecurringExpenseMutation,
  useUpdateRecurringExpenseMutation,
  useDeleteRecurringExpenseMutation,
  useRunRecurringExpensesNowMutation,
  usePayRecurringExpenseRuleMutation,
  usePayAllRecurringExpensesMutation,
  type RecurringExpenseRecord,
  type RecurringFrequency,
} from '@/stores/recurringExpense.api'
import { useGetExpenseCategoriesQuery } from '@/stores/expenseCategory.api'
import { useGetPendingExpensesQuery, usePayExpenseMutation } from '@/stores/expense.api'
import { getBusinessToday, formatBusinessDate } from '@/lib/business-timezone'

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const frequencyLabel = (r: RecurringExpenseRecord) => {
  if (r.frequency === 'daily') return 'Every Day'
  if (r.frequency === 'weekly') {
    const day = DAYS_OF_WEEK.find((d) => d.value === r.dayOfWeek)?.label ?? 'Weekly'
    return `Every ${day}`
  }
  if (r.frequency === 'monthly') return `Monthly (day ${r.dayOfMonth ?? '—'})`
  return r.frequency
}

const monthlyEst = (r: RecurringExpenseRecord) => {
  if (r.frequency === 'daily') return r.amount * 30
  if (r.frequency === 'weekly') return r.amount * 4
  return r.amount
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`
// The backend computes recurring-expense day boundaries in the business timezone
// (Asia/Karachi) — format with the same helper so the displayed day always
// matches what the server considers "today", regardless of viewer's browser TZ.
const fmtDate = (d?: string | null) => (d ? formatBusinessDate(d) : '—')

/** Show daily / monthly equivalent as a hint below the amount field */
function AmountHint({ amount, frequency }: { amount: string; frequency: RecurringFrequency }) {
  const n = parseFloat(amount)
  if (!n || isNaN(n)) return null
  if (frequency === 'monthly') {
    const daily30 = n / 30
    const daily31 = n / 31
    return (
      <p className='text-xs text-muted-foreground mt-1'>
        ≈ <strong>{fmt(daily30)}/day</strong> (30-day month) · <strong>{fmt(daily31)}/day</strong> (31-day month)
      </p>
    )
  }
  if (frequency === 'daily') {
    return (
      <p className='text-xs text-muted-foreground mt-1'>
        ≈ <strong>{fmt(n * 30)}/month</strong> (30 days) · <strong>{fmt(n * 365)}/year</strong>
      </p>
    )
  }
  if (frequency === 'weekly') {
    return (
      <p className='text-xs text-muted-foreground mt-1'>
        ≈ <strong>{fmt(n * 4)}/month</strong> (4 weeks) · <strong>{fmt(n * 52)}/year</strong>
      </p>
    )
  }
  return null
}

type FormState = {
  name: string
  category: string
  description: string
  amount: string
  vendor: string
  frequency: RecurringFrequency
  dayOfWeek: string
  dayOfMonth: string
  startDate: string
  endDate: string
}

const emptyForm = (): FormState => ({
  name: '',
  category: '',
  description: '',
  amount: '',
  vendor: '',
  frequency: 'monthly',
  dayOfWeek: '1',
  dayOfMonth: '1',
  startDate: getBusinessToday(),
  endDate: '',
})

export function RecurringExpenseManager() {
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [showAll, setShowAll] = useState(false)
  const [catOpen, setCatOpen] = useState(false)

  const [payAllDialogOpen, setPayAllDialogOpen] = useState(false)
  const [payRuleDialogOpen, setPayRuleDialogOpen] = useState(false)
  const [ruleToPay, setRuleToPay] = useState<RecurringExpenseRecord | null>(null)

  const { data, isLoading } = useGetRecurringExpensesQuery()
  const { data: categoriesData } = useGetExpenseCategoriesQuery({ transactionType: 'business_expense' })
  const [createRule, { isLoading: isCreating }] = useCreateRecurringExpenseMutation()
  const [updateRule, { isLoading: isUpdating }] = useUpdateRecurringExpenseMutation()
  const [deleteRule] = useDeleteRecurringExpenseMutation()
  const [runNow, { isLoading: isRunning }] = useRunRecurringExpensesNowMutation()
  const [payRule, { isLoading: isPayingRule }] = usePayRecurringExpenseRuleMutation()
  const [payAll, { isLoading: isPayingAll }] = usePayAllRecurringExpensesMutation()

  const categories: string[] = useMemo(() => {
    const raw = Array.isArray(categoriesData) ? categoriesData : (categoriesData as any)?.results ?? []
    return raw.map((c: any) => c.name as string)
  }, [categoriesData])

  const rules = data?.results ?? []
  const monthSummary = data?.monthSummary
  const activeRules = rules.filter((r) => r.isActive)
  const displayRules = showAll ? rules : rules.slice(0, 8)

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (rule: RecurringExpenseRecord) => {
    setEditingId(rule.id)
    setForm({
      name: rule.name,
      category: rule.category,
      description: rule.description,
      amount: String(rule.amount),
      vendor: rule.vendor ?? '',
      frequency: rule.frequency,
      dayOfWeek: String(rule.dayOfWeek ?? 1),
      dayOfMonth: String(rule.dayOfMonth ?? 1),
      startDate: rule.startDate.slice(0, 10),
      endDate: rule.endDate ? rule.endDate.slice(0, 10) : '',
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.category || !form.description || !form.amount || !form.startDate) {
      toast.error('Please fill all required fields')
      return
    }
    const payload = {
      name: form.name,
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount),
      vendor: form.vendor || undefined,
      frequency: form.frequency,
      dayOfWeek: form.frequency === 'weekly' ? parseInt(form.dayOfWeek) : undefined,
      dayOfMonth: form.frequency === 'monthly' ? parseInt(form.dayOfMonth) : undefined,
      startDate: form.startDate,
      endDate: form.endDate || null,
    }
    try {
      if (editingId) {
        const result = await updateRule({ id: editingId, ...payload }).unwrap()
        toast.success(
          result.pendingCount
            ? `Rule updated — ${result.pendingCount} day(s) pending catch-up, click "Run Now" to generate them`
            : 'Rule updated'
        )
      } else {
        const result = await createRule(payload).unwrap()
        toast.success(
          result.pendingCount
            ? `Rule created — ${result.pendingCount} day(s) pending catch-up, click "Run Now" to generate them`
            : 'Recurring expense created'
        )
      }
      setFormOpen(false)
    } catch {
      toast.error('Failed to save')
    }
  }

  const toggleActive = async (rule: RecurringExpenseRecord) => {
    await updateRule({ id: rule.id, isActive: !rule.isActive }).unwrap()
    toast.success(rule.isActive ? 'Rule paused' : 'Rule activated')
  }

  const handleDelete = async (rule: RecurringExpenseRecord) => {
    if (!confirm(`Delete recurring rule "${rule.name}"?`)) return
    await deleteRule(rule.id)
    toast.success('Rule deleted')
  }

  const handleRunNow = async () => {
    try {
      const result = await runNow().unwrap()
      toast.success(`Generated ${result.created} expense(s) from ${result.total} due rules`)
    } catch {
      toast.error('Failed to run')
    }
  }

  const totalMonthlyEst = activeRules.reduce((s, r) => s + monthlyEst(r), 0)
  const totalUnpaidCount = rules.reduce((s, r) => s + (r.unpaidCount || 0), 0)
  const totalUnpaidAmount = rules.reduce((s, r) => s + (r.unpaidAmount || 0), 0)
  const totalGeneratedCount = rules.reduce((s, r) => s + (r.totalGenerated || 0), 0)
  const totalGeneratedAmount = rules.reduce((s, r) => s + (r.generatedAmount || 0), 0)

  const handleConfirmPayAll = async () => {
    try {
      const result = await payAll().unwrap()
      toast.success(`Paid ${result.paidCount} expense(s) — ${fmt(result.totalAmount)} deducted from cash book`)
      setPayAllDialogOpen(false)
    } catch {
      toast.error('Failed to pay pending expenses')
    }
  }

  const openPayRuleDialog = (rule: RecurringExpenseRecord) => {
    setRuleToPay(rule)
    setPayRuleDialogOpen(true)
  }

  const handleConfirmPayRule = async () => {
    if (!ruleToPay) return
    try {
      const result = await payRule(ruleToPay.id).unwrap()
      toast.success(`Paid ${result.paidCount} expense(s) — ${fmt(result.totalAmount)} deducted from cash book`)
      setPayRuleDialogOpen(false)
      setRuleToPay(null)
    } catch {
      toast.error('Failed to pay pending expenses')
    }
  }

  return (
    <div className='space-y-4'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>Recurring Expenses</h2>
          <p className='text-sm text-muted-foreground'>
            {activeRules.length} active rule{activeRules.length !== 1 ? 's' : ''} · auto-generated daily, catches up missed days automatically
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={handleRunNow} disabled={isRunning}>
            {isRunning ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
            <span className='ml-1.5'>Run Now</span>
          </Button>
          {totalUnpaidCount > 0 && (
            <Button
              variant='outline'
              size='sm'
              className='border-green-600 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30'
              onClick={() => setPayAllDialogOpen(true)}
            >
              <Wallet className='h-4 w-4' />
              <span className='ml-1.5'>Pay All Pending ({totalUnpaidCount})</span>
            </Button>
          )}
          <Button size='sm' onClick={openCreate}>
            <Plus className='h-4 w-4 mr-1.5' />
            Add Rule
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'>
        <Card className='py-3'>
          <CardContent className='px-4 py-0'>
            <p className='text-xs text-muted-foreground'>Active Rules</p>
            <p className='text-2xl font-bold text-green-600'>{activeRules.length}</p>
          </CardContent>
        </Card>
        <Card className='py-3'>
          <CardContent className='px-4 py-0'>
            <p className='text-xs text-muted-foreground'>Total Rules</p>
            <p className='text-2xl font-bold'>{rules.length}</p>
          </CardContent>
        </Card>
        <Card className='py-3'>
          <CardContent className='px-4 py-0'>
            <p className='text-xs text-muted-foreground'>Total Generated</p>
            <p className='text-xl font-bold'>{fmt(totalGeneratedAmount)}</p>
            <p className='text-xs text-muted-foreground'>{totalGeneratedCount} expense{totalGeneratedCount !== 1 ? 's' : ''} total</p>
          </CardContent>
        </Card>
        <Card className='py-3'>
          <CardContent className='px-4 py-0'>
            <p className='text-xs text-muted-foreground'>This Month</p>
            <p className='text-xl font-bold text-purple-600'>{fmt(monthSummary?.amount ?? 0)}</p>
            <p className='text-xs text-muted-foreground'>
              {monthSummary?.days ?? 0} day{(monthSummary?.days ?? 0) !== 1 ? 's' : ''} generated
            </p>
          </CardContent>
        </Card>
        <Card className='py-3'>
          <CardContent className='px-4 py-0'>
            <p className='text-xs text-muted-foreground'>Monthly Est.</p>
            <p className='text-xl font-bold text-blue-600'>{fmt(totalMonthlyEst)}</p>
            <p className='text-xs text-muted-foreground'>≈ {fmt(totalMonthlyEst / 30)}/day</p>
          </CardContent>
        </Card>
        <Card className='py-3'>
          <CardContent className='px-4 py-0'>
            <p className='text-xs text-muted-foreground'>Unpaid (Pending Cash Out)</p>
            <p className='text-xl font-bold text-amber-600'>{fmt(totalUnpaidAmount)}</p>
            <p className='text-xs text-muted-foreground'>{totalUnpaidCount} expense{totalUnpaidCount !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className='p-0'>
          {isLoading ? (
            <div className='flex justify-center py-10'>
              <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
            </div>
          ) : rules.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 text-center gap-3'>
              <CalendarClock className='h-12 w-12 text-muted-foreground/40' />
              <div>
                <p className='font-medium'>No recurring rules yet</p>
                <p className='text-sm text-muted-foreground'>Auto-generate salaries, rent, bills, etc.</p>
              </div>
              <Button onClick={openCreate} size='sm'>
                <Plus className='h-4 w-4 mr-1.5' />
                Create First Rule
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead className='text-center'>Generated</TableHead>
                    <TableHead>Unpaid</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRules.map((rule) => (
                    <TableRow key={rule.id} className={!rule.isActive ? 'opacity-50' : ''}>
                      <TableCell className='font-medium'>{rule.name}</TableCell>
                      <TableCell>
                        <Badge variant='outline' className='text-xs'>{rule.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className='font-semibold'>{fmt(rule.amount)}</span>
                        {rule.frequency === 'monthly' && (
                          <span className='block text-xs text-muted-foreground'>≈ {fmt(rule.amount / 30)}/day</span>
                        )}
                        {rule.frequency === 'daily' && (
                          <span className='block text-xs text-muted-foreground'>≈ {fmt(rule.amount * 30)}/mo</span>
                        )}
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{frequencyLabel(rule)}</TableCell>
                      <TableCell className='text-sm text-blue-600 font-medium'>
                        {fmtDate(rule.nextRunDate)}
                        {!!rule.pendingCount && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className='block'>
                                <Badge variant='outline' className='mt-1 text-xs border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-950/30'>
                                  {rule.pendingCount}{rule.pendingCount >= 400 ? '+' : ''} pending
                                </Badge>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {rule.pendingCount} cycle(s) are due but not yet generated. Click "Run Now" to catch up.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{fmtDate(rule.lastGeneratedDate)}</TableCell>
                      <TableCell className='text-center text-sm'>
                        {rule.totalGenerated}
                        {!!rule.generatedAmount && (
                          <span className='block text-xs text-muted-foreground'>{fmt(rule.generatedAmount)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {rule.unpaidCount ? (
                          <Button
                            variant='outline'
                            size='sm'
                            className='border-green-600 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30 h-7 px-2'
                            onClick={() => openPayRuleDialog(rule)}
                          >
                            <Wallet className='h-3.5 w-3.5 mr-1' />
                            <span className='text-xs'>{rule.unpaidCount} · {fmt(rule.unpaidAmount || 0)}</span>
                          </Button>
                        ) : (
                          <span className='text-xs text-muted-foreground'>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch checked={rule.isActive} onCheckedChange={() => toggleActive(rule)} />
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button size='icon' variant='ghost' onClick={() => openEdit(rule)} title='Edit'>
                          <Pencil className='h-4 w-4' />
                        </Button>
                        <Button size='icon' variant='ghost' onClick={() => handleDelete(rule)} title='Delete'>
                          <Trash2 className='h-4 w-4 text-destructive' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rules.length > 8 && (
                <div className='flex justify-center py-3 border-t'>
                  <Button variant='ghost' size='sm' onClick={() => setShowAll((s) => !s)}>
                    {showAll ? <><ChevronUp className='h-4 w-4 mr-1' />Show Less</> : <><ChevronDown className='h-4 w-4 mr-1' />Show All ({rules.length})</>}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className='sm:max-w-lg max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Recurring Rule' : 'New Recurring Expense'}</DialogTitle>
          </DialogHeader>

          <div className='space-y-4 pt-2'>
            <div>
              <Label>Rule Name *</Label>
              <Input
                placeholder='e.g. Amir Bhai Salary, Shop Rent, MEPCO Bill'
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>

            {/* Searchable Category */}
            <div>
              <Label>Category *</Label>
              <Popover open={catOpen} onOpenChange={setCatOpen}>
                <PopoverTrigger asChild>
                  <Button variant='outline' role='combobox' className='w-full justify-between font-normal'>
                    {form.category || 'Search category...'}
                    <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-full p-0' align='start'>
                  <Command>
                    <CommandInput placeholder='Search categories...' />
                    <CommandList>
                      <CommandEmpty>No category found.</CommandEmpty>
                      <CommandGroup>
                        {categories.map((cat) => (
                          <CommandItem
                            key={cat}
                            value={cat}
                            onSelect={(v) => {
                              set('category', v)
                              setCatOpen(false)
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', form.category === cat ? 'opacity-100' : 'opacity-0')} />
                            {cat}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Amount + hint */}
            <div>
              <Label>
                Amount (Rs.) *
                {form.frequency === 'daily' && <span className='text-muted-foreground font-normal ml-1'>— per day</span>}
                {form.frequency === 'weekly' && <span className='text-muted-foreground font-normal ml-1'>— per week</span>}
                {form.frequency === 'monthly' && <span className='text-muted-foreground font-normal ml-1'>— per month</span>}
              </Label>
              <Input
                type='number'
                min='0'
                placeholder='0'
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
              <AmountHint amount={form.amount} frequency={form.frequency} />
            </div>

            <div>
              <Label>Description *</Label>
              <Input
                placeholder='Brief description'
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>

            <div>
              <Label>Vendor (optional)</Label>
              <Input placeholder='Vendor name' value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
            </div>

            {/* Schedule box */}
            <div className='border rounded-lg p-3 space-y-3 bg-muted/30'>
              <p className='text-sm font-medium'>Schedule</p>
              <div>
                <Label>Frequency *</Label>
                <Select value={form.frequency} onValueChange={(v) => set('frequency', v as RecurringFrequency)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='daily'>Daily — every day (auto catch-up missed days)</SelectItem>
                    <SelectItem value='weekly'>Weekly — specific day of week</SelectItem>
                    <SelectItem value='monthly'>Monthly — specific day of month (handles 30/31 days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.frequency === 'weekly' && (
                <div>
                  <Label>Day of Week</Label>
                  <Select value={form.dayOfWeek} onValueChange={(v) => set('dayOfWeek', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.frequency === 'monthly' && (
                <div>
                  <Label>Day of Month (1–28)</Label>
                  <Input
                    type='number'
                    min='1'
                    max='28'
                    placeholder='1'
                    value={form.dayOfMonth}
                    onChange={(e) => set('dayOfMonth', e.target.value)}
                  />
                  <p className='text-xs text-muted-foreground mt-1'>
                    Max 28 to safely work in all months (Feb included)
                  </p>
                </div>
              )}

              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <Label>Start Date *</Label>
                  <Input type='date' value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
                  {form.startDate && form.startDate < getBusinessToday() && (
                    <p className='text-xs text-amber-600 mt-1'>
                      Backdated — missed days since this date will be marked pending and auto-generated on the next run.
                    </p>
                  )}
                </div>
                <div>
                  <Label>End Date (optional)</Label>
                  <Input type='date' value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
                  <p className='text-xs text-muted-foreground mt-1'>Leave blank = runs forever</p>
                </div>
              </div>
            </div>

            <div className='flex gap-2 justify-end pt-2'>
              <Button variant='outline' onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isCreating || isUpdating}>
                {(isCreating || isUpdating) && <Loader2 className='h-4 w-4 animate-spin mr-2' />}
                {editingId ? 'Save Changes' : 'Create Rule'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay All Pending Confirmation */}
      <AlertDialog open={payAllDialogOpen} onOpenChange={setPayAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pay All Pending Expenses</AlertDialogTitle>
            <AlertDialogDescription>
              This pays every unpaid auto-generated expense across all recurring rules and deducts the total from
              your cash book. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='rounded-md border bg-muted/30 p-4 flex items-center justify-between'>
            <span className='text-sm text-muted-foreground'>{totalUnpaidCount} expense{totalUnpaidCount !== 1 ? 's' : ''}</span>
            <span className='font-bold text-lg'>{fmt(totalUnpaidAmount)}</span>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPayingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmPayAll() }}
              disabled={isPayingAll}
              className='bg-green-600 hover:bg-green-700'
            >
              {isPayingAll && <Loader2 className='h-4 w-4 animate-spin mr-2' />}
              Confirm & Pay All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay-for-one-rule Dialog — lists individual pending cycles, each payable on its own, plus a bulk "Pay All" for this rule */}
      <Dialog open={payRuleDialogOpen} onOpenChange={setPayRuleDialogOpen}>
        <DialogContent className='sm:max-w-lg max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Pending payments — {ruleToPay?.name}</DialogTitle>
          </DialogHeader>
          {ruleToPay && (
            <PayRuleDialogBody
              rule={ruleToPay}
              isPayingAll={isPayingRule}
              onPayAll={handleConfirmPayRule}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Body of the per-rule pay dialog: individual pending expenses (each payable alone) + a bulk "Pay All" for the rule. */
function PayRuleDialogBody({
  rule,
  isPayingAll,
  onPayAll,
}: {
  rule: RecurringExpenseRecord
  isPayingAll: boolean
  onPayAll: () => void
}) {
  const { data, isLoading } = useGetPendingExpensesQuery({ referenceId: rule.id })
  const [payExpense, { isLoading: isPayingSingle }] = usePayExpenseMutation()
  const [payingId, setPayingId] = useState<string | null>(null)
  const dispatch = useDispatch()

  const items = data?.results ?? []
  const totalAmount = items.reduce((s, e) => s + e.amount, 0)

  const handlePaySingle = async (expenseId: string) => {
    setPayingId(expenseId)
    try {
      await payExpense(expenseId).unwrap()
      toast.success('Expense paid and deducted from cash book')
      // expenseApi and recurringExpenseApi are separate RTK slices — nudge the
      // rule list to refetch so its unpaidCount/unpaidAmount badge stays accurate.
      dispatch(recurringExpenseApi.util.invalidateTags(['RecurringExpenses']))
    } catch {
      toast.error('Failed to pay expense')
    } finally {
      setPayingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className='flex justify-center py-8'>
        <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className='py-8 text-center text-sm text-muted-foreground'>
        Nothing pending — this rule is fully paid up.
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between rounded-md border bg-muted/30 p-3'>
        <span className='text-sm text-muted-foreground'>{items.length} expense{items.length !== 1 ? 's' : ''} pending</span>
        <div className='flex items-center gap-3'>
          <span className='font-bold'>{fmt(totalAmount)}</span>
          <Button size='sm' onClick={onPayAll} disabled={isPayingAll} className='bg-green-600 hover:bg-green-700'>
            {isPayingAll ? <Loader2 className='h-4 w-4 animate-spin mr-1.5' /> : <CheckCircle2 className='h-4 w-4 mr-1.5' />}
            Pay All ({items.length})
          </Button>
        </div>
      </div>

      <div className='space-y-2 max-h-80 overflow-y-auto'>
        {items.map((expense) => (
          <div key={expense.id} className='flex items-center justify-between rounded-md border p-2.5 text-sm'>
            <div>
              <p className='font-medium'>{fmtDate(expense.date)}</p>
              <p className='text-xs text-muted-foreground'>{expense.description}</p>
            </div>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>{fmt(expense.amount)}</span>
              <Button
                size='sm'
                variant='outline'
                className='border-green-600 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30'
                onClick={() => handlePaySingle(expense.id)}
                disabled={isPayingSingle && payingId === expense.id}
              >
                {isPayingSingle && payingId === expense.id ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  'Pay'
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
