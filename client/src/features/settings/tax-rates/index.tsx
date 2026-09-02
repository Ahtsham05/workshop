import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, MoreHorizontal, Percent } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { useGetTaxCategoriesQuery } from '@/stores/taxCategory.api'
import { useGetTaxJurisdictionsQuery } from '@/stores/taxJurisdiction.api'
import {
  useGetTaxRatesQuery,
  useCreateTaxRateMutation,
  useUpdateTaxRateMutation,
  useDeleteTaxRateMutation,
  type TaxRate,
} from '@/stores/taxRate.api'

const formSchema = z.object({
  taxCategoryId: z.string().min(1, 'Tax category is required'),
  taxJurisdictionId: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  rateType: z.enum(['PERCENTAGE', 'FIXED']),
  rate: z.coerce.number().min(0, 'Rate must be 0 or more'),
  isCompound: z.boolean().optional(),
  priority: z.coerce.number().optional(),
  effectiveFrom: z.string().min(1, 'Effective from date is required'),
  effectiveTo: z.string().optional(),
})
type FormValues = z.infer<typeof formSchema>

const toDateInput = (value?: string) => (value ? value.slice(0, 10) : '')

const emptyValues: FormValues = {
  taxCategoryId: '',
  taxJurisdictionId: '',
  name: '',
  rateType: 'PERCENTAGE',
  rate: 0,
  isCompound: false,
  priority: 0,
  effectiveFrom: toDateInput(new Date().toISOString()),
  effectiveTo: '',
}

function TaxRateDialog({
  open,
  onOpenChange,
  rate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rate: TaxRate | null
}) {
  const { data: categoriesData } = useGetTaxCategoriesQuery({ limit: 100 })
  const { data: jurisdictionsData } = useGetTaxJurisdictionsQuery({ limit: 100 })
  const [createTaxRate, { isLoading: isCreating }] = useCreateTaxRateMutation()
  const [updateTaxRate, { isLoading: isUpdating }] = useUpdateTaxRateMutation()
  const isSubmitting = isCreating || isUpdating

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: rate
      ? {
          taxCategoryId: rate.taxCategoryId,
          taxJurisdictionId: rate.taxJurisdictionId || '',
          name: rate.name,
          rateType: rate.rateType || 'PERCENTAGE',
          rate: rate.rate,
          isCompound: !!rate.isCompound,
          priority: rate.priority || 0,
          effectiveFrom: toDateInput(rate.effectiveFrom),
          effectiveTo: toDateInput(rate.effectiveTo || undefined),
        }
      : emptyValues,
  })

  const rateType = form.watch('rateType')
  const categoryOptions = (categoriesData?.results || []).map((c) => ({ value: c._id, label: c.name }))
  const jurisdictionOptions = (jurisdictionsData?.results || []).map((j) => ({ value: j._id, label: j.name }))

  const onSubmit = async (values: FormValues) => {
    const body = {
      ...values,
      taxJurisdictionId: values.taxJurisdictionId || null,
      effectiveTo: values.effectiveTo || null,
    }
    try {
      if (rate) {
        await updateTaxRate({ id: rate._id, body }).unwrap()
        toast.success(`Tax rate "${values.name}" updated`)
      } else {
        await createTaxRate(body).unwrap()
        toast.success(`Tax rate "${values.name}" created`)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save tax rate'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{rate ? 'Edit Tax Rate' : 'New Tax Rate'}</DialogTitle>
          <DialogDescription>A dated rate attached to a tax category, optionally scoped to a jurisdiction.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleFormEnterKeyDown} className='space-y-4'>
            <FormField
              control={form.control}
              name='taxCategoryId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Category *</FormLabel>
                  <SearchableSelect
                    options={categoryOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder='Select category'
                    searchPlaceholder='Search categories...'
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. Standard VAT 20%' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='rateType'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='PERCENTAGE'>Percentage</SelectItem>
                        <SelectItem value='FIXED'>Fixed amount</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='rate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate {rateType === 'PERCENTAGE' ? '(%)' : '(amount)'}</FormLabel>
                    <FormControl>
                      <Input type='number' min={0} step='0.01' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='taxJurisdictionId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jurisdiction</FormLabel>
                  <SearchableSelect
                    options={jurisdictionOptions}
                    value={field.value || ''}
                    onValueChange={field.onChange}
                    placeholder='Applies everywhere'
                    searchPlaceholder='Search jurisdictions...'
                    clearLabel='None (applies everywhere)'
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='effectiveFrom'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective From *</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='effectiveTo'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective To</FormLabel>
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
              name='isCompound'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between rounded-lg border p-3'>
                  <div>
                    <FormLabel>Compound</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      Applies on top of already-applied taxes rather than the base amount (US jurisdiction stacking).
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
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

export default function TaxRatesSettings() {
  const { hasExplicitPermission } = usePermissions()
  const { data, isLoading } = useGetTaxRatesQuery({ limit: 100 })
  const { data: categoriesData } = useGetTaxCategoriesQuery({ limit: 100 })
  const { data: jurisdictionsData } = useGetTaxJurisdictionsQuery({ limit: 100 })
  const [deleteTaxRate] = useDeleteTaxRateMutation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [current, setCurrent] = useState<TaxRate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TaxRate | null>(null)

  const rates = data?.results || []
  const categoryNameById = new Map((categoriesData?.results || []).map((c) => [c._id, c.name]))
  const jurisdictionNameById = new Map((jurisdictionsData?.results || []).map((j) => [j._id, j.name]))

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteTaxRate(deleteTarget._id).unwrap()
      toast.success(`Tax rate "${deleteTarget.name}" deactivated`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to deactivate tax rate'))
    }
  }

  return (
    <ContentSection title='Tax Rates' desc='Dated rates attached to a tax category — changing a rate never affects already-issued invoices.'>
      <div className='space-y-4'>
        <div className='flex justify-end'>
          <Can permission='createTaxRates'>
            <Button
              onClick={() => {
                setCurrent(null)
                setDialogOpen(true)
              }}
            >
              <Plus className='mr-2 h-4 w-4' /> Add Tax Rate
            </Button>
          </Can>
        </div>

        {isLoading ? (
          <Skeleton className='h-64 w-full' />
        ) : rates.length === 0 ? (
          <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center'>
            <Percent className='mb-3 h-10 w-10 text-muted-foreground' />
            <h3 className='text-sm font-medium'>No tax rates yet</h3>
            <p className='mt-1 max-w-sm text-xs text-muted-foreground'>
              Create your first tax rate to start calculating tax automatically on invoices.
            </p>
            <Can permission='createTaxRates'>
              <Button
                className='mt-4'
                onClick={() => {
                  setCurrent(null)
                  setDialogOpen(true)
                }}
              >
                <Plus className='mr-2 h-4 w-4' /> Create Tax Rate
              </Button>
            </Can>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='w-10' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate) => (
                <TableRow key={rate._id}>
                  <TableCell className='font-medium'>{rate.name}</TableCell>
                  <TableCell className='text-muted-foreground'>{categoryNameById.get(rate.taxCategoryId) || '—'}</TableCell>
                  <TableCell>{rate.rateType === 'FIXED' ? rate.rate : `${rate.rate}%`}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {rate.taxJurisdictionId ? jurisdictionNameById.get(rate.taxJurisdictionId) || '—' : 'Everywhere'}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {new Date(rate.effectiveFrom).toLocaleDateString()} —{' '}
                    {rate.effectiveTo ? new Date(rate.effectiveTo).toLocaleDateString() : 'Ongoing'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rate.status === 'inactive' ? 'outline' : 'default'}>
                      {rate.status === 'inactive' ? 'Inactive' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='icon' className='h-8 w-8'>
                          <MoreHorizontal className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        {hasExplicitPermission('editTaxRates') && (
                          <DropdownMenuItem
                            onClick={() => {
                              setCurrent(rate)
                              setDialogOpen(true)
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                        )}
                        {hasExplicitPermission('deleteTaxRates') && (
                          <DropdownMenuItem className='text-destructive' onClick={() => setDeleteTarget(rate)}>
                            Deactivate
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

      <TaxRateDialog open={dialogOpen} onOpenChange={setDialogOpen} rate={current} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate tax rate?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks <strong>{deleteTarget?.name}</strong> as inactive — it won't apply to new transactions, but
              historical invoices/purchases that already used it keep their snapshot unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentSection>
  )
}
