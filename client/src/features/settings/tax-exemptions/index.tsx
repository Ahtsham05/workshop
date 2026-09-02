import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, MoreHorizontal, ShieldCheck } from 'lucide-react'
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
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import { useGetTaxCategoriesQuery } from '@/stores/taxCategory.api'
import {
  useGetTaxExemptionsQuery,
  useCreateTaxExemptionMutation,
  useUpdateTaxExemptionMutation,
  useDeleteTaxExemptionMutation,
  type TaxExemption,
} from '@/stores/taxExemption.api'

interface CustomerOption {
  _id?: string
  id?: string
  name: string
}

const formSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  taxCategoryId: z.string().optional(),
  exemptionType: z.string().optional(),
  certificateNumber: z.string().optional(),
  reason: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
})
type FormValues = z.infer<typeof formSchema>

const toDateInput = (value?: string) => (value ? value.slice(0, 10) : '')

const emptyValues: FormValues = {
  customerId: '',
  taxCategoryId: '',
  exemptionType: '',
  certificateNumber: '',
  reason: '',
  validFrom: toDateInput(new Date().toISOString()),
  validTo: '',
}

function TaxExemptionDialog({
  open,
  onOpenChange,
  exemption,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exemption: TaxExemption | null
}) {
  const { data: customersData } = useGetAllCustomersQuery(undefined)
  const { data: categoriesData } = useGetTaxCategoriesQuery({ limit: 100 })
  const [createTaxExemption, { isLoading: isCreating }] = useCreateTaxExemptionMutation()
  const [updateTaxExemption, { isLoading: isUpdating }] = useUpdateTaxExemptionMutation()
  const isSubmitting = isCreating || isUpdating

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: exemption
      ? {
          customerId: exemption.customerId,
          taxCategoryId: exemption.taxCategoryId || '',
          exemptionType: exemption.exemptionType || '',
          certificateNumber: exemption.certificateNumber || '',
          reason: exemption.reason || '',
          validFrom: toDateInput(exemption.validFrom),
          validTo: toDateInput(exemption.validTo || undefined),
        }
      : emptyValues,
  })

  const customers: CustomerOption[] = Array.isArray(customersData) ? customersData : []
  const customerOptions = customers.map((c) => ({ value: c._id || c.id || '', label: c.name }))
  const categoryOptions = (categoriesData?.results || []).map((c) => ({ value: c._id, label: c.name }))

  const onSubmit = async (values: FormValues) => {
    const body = {
      ...values,
      taxCategoryId: values.taxCategoryId || null,
      validTo: values.validTo || null,
    }
    try {
      if (exemption) {
        await updateTaxExemption({ id: exemption._id, body }).unwrap()
        toast.success('Tax exemption updated')
      } else {
        await createTaxExemption(body).unwrap()
        toast.success('Tax exemption created')
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save tax exemption'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{exemption ? 'Edit Tax Exemption' : 'New Tax Exemption'}</DialogTitle>
          <DialogDescription>
            A recorded, auditable exemption for a customer — not just a yes/no flag.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleFormEnterKeyDown} className='space-y-4'>
            <FormField
              control={form.control}
              name='customerId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer *</FormLabel>
                  <SearchableSelect
                    options={customerOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder='Select customer'
                    searchPlaceholder='Search customers...'
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='taxCategoryId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Category</FormLabel>
                  <SearchableSelect
                    options={categoryOptions}
                    value={field.value || ''}
                    onValueChange={field.onChange}
                    placeholder='Fully exempt (all categories)'
                    searchPlaceholder='Search categories...'
                    clearLabel='Fully exempt (all categories)'
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='exemptionType'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Exemption Type</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. Resale' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='certificateNumber'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certificate #</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='reason'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='validFrom'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid From</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='validTo'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid To</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : exemption ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function TaxExemptionsSettings() {
  const { hasExplicitPermission } = usePermissions()
  const { data, isLoading } = useGetTaxExemptionsQuery({ limit: 100 })
  const { data: customersData } = useGetAllCustomersQuery(undefined)
  const { data: categoriesData } = useGetTaxCategoriesQuery({ limit: 100 })
  const [deleteTaxExemption] = useDeleteTaxExemptionMutation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [current, setCurrent] = useState<TaxExemption | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TaxExemption | null>(null)

  const exemptions = data?.results || []
  const customers: CustomerOption[] = Array.isArray(customersData) ? customersData : []
  const customerNameById = new Map(customers.map((c) => [c._id || c.id, c.name]))
  const categoryNameById = new Map((categoriesData?.results || []).map((c) => [c._id, c.name]))

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteTaxExemption(deleteTarget._id).unwrap()
      toast.success('Tax exemption deactivated')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to deactivate tax exemption'))
    }
  }

  return (
    <ContentSection title='Tax Exemptions' desc="Recorded, auditable exemptions for customers — reason and certificate are kept, not just a yes/no flag.">
      <div className='space-y-4'>
        <div className='flex justify-end'>
          <Can permission='createTaxExemptions'>
            <Button
              onClick={() => {
                setCurrent(null)
                setDialogOpen(true)
              }}
            >
              <Plus className='mr-2 h-4 w-4' /> Add Exemption
            </Button>
          </Can>
        </div>

        {isLoading ? (
          <Skeleton className='h-64 w-full' />
        ) : exemptions.length === 0 ? (
          <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center'>
            <ShieldCheck className='mb-3 h-10 w-10 text-muted-foreground' />
            <h3 className='text-sm font-medium'>No tax exemptions yet</h3>
            <p className='mt-1 max-w-sm text-xs text-muted-foreground'>
              Record a customer's tax exemption to stop tax from being calculated on their invoices.
            </p>
            <Can permission='createTaxExemptions'>
              <Button
                className='mt-4'
                onClick={() => {
                  setCurrent(null)
                  setDialogOpen(true)
                }}
              >
                <Plus className='mr-2 h-4 w-4' /> Add Exemption
              </Button>
            </Can>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Certificate #</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='w-10' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {exemptions.map((exemption) => (
                <TableRow key={exemption._id}>
                  <TableCell className='font-medium'>{customerNameById.get(exemption.customerId) || '—'}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {exemption.taxCategoryId ? categoryNameById.get(exemption.taxCategoryId) || '—' : 'All categories'}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>{exemption.certificateNumber || '—'}</TableCell>
                  <TableCell className='max-w-xs truncate text-muted-foreground'>{exemption.reason || '—'}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {exemption.validFrom ? new Date(exemption.validFrom).toLocaleDateString() : '—'} —{' '}
                    {exemption.validTo ? new Date(exemption.validTo).toLocaleDateString() : 'Ongoing'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={exemption.status === 'inactive' ? 'outline' : 'default'}>
                      {exemption.status === 'inactive' ? 'Inactive' : 'Active'}
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
                        {hasExplicitPermission('editTaxExemptions') && (
                          <DropdownMenuItem
                            onClick={() => {
                              setCurrent(exemption)
                              setDialogOpen(true)
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                        )}
                        {hasExplicitPermission('deleteTaxExemptions') && (
                          <DropdownMenuItem className='text-destructive' onClick={() => setDeleteTarget(exemption)}>
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

      <TaxExemptionDialog open={dialogOpen} onOpenChange={setDialogOpen} exemption={current} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate tax exemption?</AlertDialogTitle>
            <AlertDialogDescription>
              This customer's future invoices will be taxed normally again. The exemption record is kept for the audit
              trail, just marked inactive.
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
