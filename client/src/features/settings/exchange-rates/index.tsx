import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, MoreHorizontal, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { handleFormEnterKeyDown } from '@/lib/form-enter-navigation'
import { Can, usePermissions } from '@/context/permission-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useGetCurrenciesQuery } from '@/stores/localization.api'
import {
  useGetExchangeRatesQuery,
  useCreateOrUpdateExchangeRateMutation,
  useDeleteExchangeRateMutation,
  type ExchangeRate,
} from '@/stores/exchangeRate.api'

const formSchema = z
  .object({
    fromCurrency: z.string().min(1, 'From currency is required'),
    toCurrency: z.string().min(1, 'To currency is required'),
    rate: z.coerce.number().min(0, 'Rate must be 0 or more'),
    rateDate: z.string().min(1, 'Rate date is required'),
    notes: z.string().optional(),
  })
  .refine((data) => data.fromCurrency !== data.toCurrency, {
    message: 'From and To currency must be different',
    path: ['toCurrency'],
  })
type FormValues = z.infer<typeof formSchema>

const toDateInput = (value?: string) => (value ? value.slice(0, 10) : '')

const emptyValues: FormValues = {
  fromCurrency: '',
  toCurrency: '',
  rate: 0,
  rateDate: toDateInput(new Date().toISOString()),
  notes: '',
}

function ExchangeRateDialog({
  open,
  onOpenChange,
  rate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rate: ExchangeRate | null
}) {
  const { data: currencies } = useGetCurrenciesQuery()
  const [createOrUpdateExchangeRate, { isLoading: isSubmitting }] = useCreateOrUpdateExchangeRateMutation()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: rate
      ? { fromCurrency: rate.fromCurrency, toCurrency: rate.toCurrency, rate: rate.rate, rateDate: toDateInput(rate.rateDate), notes: rate.notes || '' }
      : emptyValues,
  })

  const currencyOptions = (currencies || []).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))

  const onSubmit = async (values: FormValues) => {
    try {
      await createOrUpdateExchangeRate(values).unwrap()
      toast.success(`Exchange rate ${values.fromCurrency} → ${values.toCurrency} saved`)
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save exchange rate'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{rate ? 'Edit Exchange Rate' : 'New Exchange Rate'}</DialogTitle>
          <DialogDescription>
            Manually entered — invoices/purchases snapshot whatever rate was current at save time, so a later change
            never retroactively affects past transactions.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleFormEnterKeyDown} className='space-y-4'>
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='fromCurrency'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From *</FormLabel>
                    <SearchableSelect
                      options={currencyOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder='Currency'
                      searchPlaceholder='Search...'
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='toCurrency'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>To *</FormLabel>
                    <SearchableSelect
                      options={currencyOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder='Currency'
                      searchPlaceholder='Search...'
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='rate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate *</FormLabel>
                    <FormControl>
                      <Input type='number' min={0} step='0.0001' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='rateDate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate Date *</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : rate ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function ExchangeRatesSettings() {
  const { hasExplicitPermission } = usePermissions()
  const { data, isLoading } = useGetExchangeRatesQuery({ limit: 100 })
  const [deleteExchangeRate] = useDeleteExchangeRateMutation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [current, setCurrent] = useState<ExchangeRate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExchangeRate | null>(null)

  const rates = data?.results || []

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteExchangeRate(deleteTarget._id).unwrap()
      toast.success('Exchange rate deleted')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete exchange rate'))
    }
  }

  return (
    <ContentSection title='Exchange Rates' desc='Manually entered rates used to convert multi-currency transactions into your base currency.'>
      <div className='space-y-4'>
        <div className='flex justify-end'>
          <Can permission='createExchangeRates'>
            <Button
              onClick={() => {
                setCurrent(null)
                setDialogOpen(true)
              }}
            >
              <Plus className='mr-2 h-4 w-4' /> Add Exchange Rate
            </Button>
          </Can>
        </div>

        {isLoading ? (
          <Skeleton className='h-64 w-full' />
        ) : rates.length === 0 ? (
          <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center'>
            <ArrowRightLeft className='mb-3 h-10 w-10 text-muted-foreground' />
            <h3 className='text-sm font-medium'>No exchange rates yet</h3>
            <p className='mt-1 max-w-sm text-xs text-muted-foreground'>
              Add a rate to enable multi-currency invoices and purchases against your base currency.
            </p>
            <Can permission='createExchangeRates'>
              <Button
                className='mt-4'
                onClick={() => {
                  setCurrent(null)
                  setDialogOpen(true)
                }}
              >
                <Plus className='mr-2 h-4 w-4' /> Add Exchange Rate
              </Button>
            </Can>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pair</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className='w-10' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate) => (
                <TableRow key={rate._id}>
                  <TableCell className='font-medium'>
                    {rate.fromCurrency} → {rate.toCurrency}
                  </TableCell>
                  <TableCell>{rate.rate}</TableCell>
                  <TableCell className='text-muted-foreground'>{new Date(rate.rateDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant='outline' className='capitalize'>
                      {rate.source || 'manual'}
                    </Badge>
                  </TableCell>
                  <TableCell className='max-w-xs truncate text-muted-foreground'>{rate.notes || '—'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='icon' className='h-8 w-8'>
                          <MoreHorizontal className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        {hasExplicitPermission('editExchangeRates') && (
                          <DropdownMenuItem
                            onClick={() => {
                              setCurrent(rate)
                              setDialogOpen(true)
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                        )}
                        {hasExplicitPermission('deleteExchangeRates') && (
                          <DropdownMenuItem className='text-destructive' onClick={() => setDeleteTarget(rate)}>
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ExchangeRateDialog open={dialogOpen} onOpenChange={setDialogOpen} rate={current} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete exchange rate?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {deleteTarget?.fromCurrency} → {deleteTarget?.toCurrency} rate for{' '}
              {deleteTarget ? new Date(deleteTarget.rateDate).toLocaleDateString() : ''}. Transactions that already
              used it keep their own snapshot and are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentSection>
  )
}
