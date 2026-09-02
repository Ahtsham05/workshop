import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, MoreHorizontal, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { handleFormEnterKeyDown } from '@/lib/form-enter-navigation'
import { Can, usePermissions } from '@/context/permission-context'
import { getErrorMessage } from '@/lib/get-error-message'
import {
  useGetTaxCategoriesQuery,
  useCreateTaxCategoryMutation,
  useUpdateTaxCategoryMutation,
  useDeleteTaxCategoryMutation,
  type TaxCategory,
} from '@/stores/taxCategory.api'

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
})
type FormValues = z.infer<typeof formSchema>
const emptyValues: FormValues = { name: '', code: '', description: '', isDefault: false }

function TaxCategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: TaxCategory | null
}) {
  const [createTaxCategory, { isLoading: isCreating }] = useCreateTaxCategoryMutation()
  const [updateTaxCategory, { isLoading: isUpdating }] = useUpdateTaxCategoryMutation()
  const isSubmitting = isCreating || isUpdating

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: category
      ? { name: category.name, code: category.code || '', description: category.description || '', isDefault: !!category.isDefault }
      : emptyValues,
  })

  const onSubmit = async (values: FormValues) => {
    try {
      if (category) {
        await updateTaxCategory({ id: category._id, body: values }).unwrap()
        toast.success(`Tax category "${values.name}" updated`)
      } else {
        await createTaxCategory(values).unwrap()
        toast.success(`Tax category "${values.name}" created`)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save tax category'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit Tax Category' : 'New Tax Category'}</DialogTitle>
          <DialogDescription>
            A classification like Standard, Reduced, or Zero Rated — tax rates attach to a category rather than a
            product directly.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleFormEnterKeyDown} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. Standard' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='code'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. STD' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='isDefault'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between rounded-lg border p-3'>
                  <div>
                    <FormLabel>Set as default category</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      New products fall back to this category when none is set. Unsets any other default.
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
                {isSubmitting ? 'Saving...' : category ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function TaxCategoriesSettings() {
  const { hasExplicitPermission } = usePermissions()
  const { data, isLoading } = useGetTaxCategoriesQuery({ limit: 100 })
  const [deleteTaxCategory] = useDeleteTaxCategoryMutation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [current, setCurrent] = useState<TaxCategory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TaxCategory | null>(null)

  const categories = data?.results || []

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteTaxCategory(deleteTarget._id).unwrap()
      toast.success(`Tax category "${deleteTarget.name}" deactivated`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to deactivate tax category'))
    }
  }

  return (
    <ContentSection title='Tax Categories' desc='Classifications like Standard, Reduced, or Zero Rated that tax rates attach to.'>
      <div className='space-y-4'>
        <div className='flex justify-end'>
          <Can permission='createTaxCategories'>
            <Button
              onClick={() => {
                setCurrent(null)
                setDialogOpen(true)
              }}
            >
              <Plus className='mr-2 h-4 w-4' /> Add Tax Category
            </Button>
          </Can>
        </div>

        {isLoading ? (
          <Skeleton className='h-64 w-full' />
        ) : categories.length === 0 ? (
          <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center'>
            <ReceiptText className='mb-3 h-10 w-10 text-muted-foreground' />
            <h3 className='text-sm font-medium'>No tax categories yet</h3>
            <p className='mt-1 max-w-sm text-xs text-muted-foreground'>
              Create your first tax category (e.g. Standard, Zero Rated) to start organizing tax rates.
            </p>
            <Can permission='createTaxCategories'>
              <Button
                className='mt-4'
                onClick={() => {
                  setCurrent(null)
                  setDialogOpen(true)
                }}
              >
                <Plus className='mr-2 h-4 w-4' /> Create Tax Category
              </Button>
            </Can>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='w-10' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category._id}>
                  <TableCell className='font-medium'>
                    {category.name}
                    {category.isDefault && (
                      <Badge variant='secondary' className='ml-2'>
                        Default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>{category.code || '—'}</TableCell>
                  <TableCell className='max-w-xs truncate text-muted-foreground'>{category.description || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={category.status === 'inactive' ? 'outline' : 'default'}>
                      {category.status === 'inactive' ? 'Inactive' : 'Active'}
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
                        {hasExplicitPermission('editTaxCategories') && (
                          <DropdownMenuItem
                            onClick={() => {
                              setCurrent(category)
                              setDialogOpen(true)
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                        )}
                        {hasExplicitPermission('deleteTaxCategories') && (
                          <DropdownMenuItem className='text-destructive' onClick={() => setDeleteTarget(category)}>
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

      <TaxCategoryDialog open={dialogOpen} onOpenChange={setDialogOpen} category={current} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate tax category?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks <strong>{deleteTarget?.name}</strong> as inactive — it won't be selectable for new products
              or tax rates, but existing references keep working.
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
