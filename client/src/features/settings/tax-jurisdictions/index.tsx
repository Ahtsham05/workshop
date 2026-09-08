import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, MoreHorizontal, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { useGetCountriesQuery } from '@/stores/localization.api'
import {
  useGetTaxJurisdictionsQuery,
  useCreateTaxJurisdictionMutation,
  useUpdateTaxJurisdictionMutation,
  useDeleteTaxJurisdictionMutation,
  type TaxJurisdiction,
} from '@/stores/taxJurisdiction.api'

const LEVELS = ['COUNTRY', 'STATE', 'COUNTY', 'CITY', 'DISTRICT', 'CUSTOM'] as const
type Level = (typeof LEVELS)[number]

const LEVEL_LABELS: Record<Level, string> = {
  COUNTRY: 'Country',
  STATE: 'State / Province',
  COUNTY: 'County',
  CITY: 'City',
  DISTRICT: 'District',
  CUSTOM: 'Custom / Other',
}

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  level: z.enum(LEVELS),
  countryCode: z.string().optional(),
  code: z.string().optional(),
  parentJurisdictionId: z.string().optional(),
})
type FormValues = z.infer<typeof formSchema>

const emptyValues: FormValues = {
  name: '',
  level: 'COUNTRY',
  countryCode: '',
  code: '',
  parentJurisdictionId: '',
}

/** Walks parentJurisdictionId up to the root, guarding against cycles the UI shouldn't
 * be able to create but that stale/imported data could still contain. */
function buildAncestryChain(jurisdiction: TaxJurisdiction, byId: Map<string, TaxJurisdiction>): string {
  const chain: string[] = []
  const visited = new Set<string>([jurisdiction._id])
  let parentId = jurisdiction.parentJurisdictionId
  while (parentId && !visited.has(parentId)) {
    const parent = byId.get(parentId)
    if (!parent) break
    chain.unshift(parent.name)
    visited.add(parentId)
    parentId = parent.parentJurisdictionId
  }
  return chain.join(' → ')
}

/** All descendants of `rootId` (children, grandchildren, ...) — excluded from the parent
 * picker so the form can't be used to create a cycle in the first place. */
function collectDescendantIds(rootId: string, jurisdictions: TaxJurisdiction[]): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  jurisdictions.forEach((j) => {
    if (j.parentJurisdictionId) {
      const list = childrenByParent.get(j.parentJurisdictionId) || []
      list.push(j._id)
      childrenByParent.set(j.parentJurisdictionId, list)
    }
  })
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const childId of childrenByParent.get(current) || []) {
      if (!result.has(childId)) {
        result.add(childId)
        queue.push(childId)
      }
    }
  }
  return result
}

function TaxJurisdictionDialog({
  open,
  onOpenChange,
  jurisdiction,
  allJurisdictions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  jurisdiction: TaxJurisdiction | null
  allJurisdictions: TaxJurisdiction[]
}) {
  const { data: countries } = useGetCountriesQuery()
  const [createTaxJurisdiction, { isLoading: isCreating }] = useCreateTaxJurisdictionMutation()
  const [updateTaxJurisdiction, { isLoading: isUpdating }] = useUpdateTaxJurisdictionMutation()
  const isSubmitting = isCreating || isUpdating

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: jurisdiction
      ? {
          name: jurisdiction.name,
          level: jurisdiction.level,
          countryCode: jurisdiction.countryCode || '',
          code: jurisdiction.code || '',
          parentJurisdictionId: jurisdiction.parentJurisdictionId || '',
        }
      : emptyValues,
  })

  useEffect(() => {
    form.reset(
      jurisdiction
        ? {
            name: jurisdiction.name,
            level: jurisdiction.level,
            countryCode: jurisdiction.countryCode || '',
            code: jurisdiction.code || '',
            parentJurisdictionId: jurisdiction.parentJurisdictionId || '',
          }
        : emptyValues
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jurisdiction, open])

  const countryOptions = (countries || []).map((c) => ({ value: c.code, label: c.name }))

  // A jurisdiction can never become its own parent, nor a descendant of itself —
  // both would create a cycle. Excluded up front so the picker can't offer them.
  const excludedParentIds = jurisdiction
    ? new Set([jurisdiction._id, ...collectDescendantIds(jurisdiction._id, allJurisdictions)])
    : new Set<string>()
  const parentOptions = allJurisdictions
    .filter((j) => !excludedParentIds.has(j._id))
    .map((j) => ({ value: j._id, label: `${j.name} (${LEVEL_LABELS[j.level]})` }))

  const onSubmit = async (values: FormValues) => {
    const body = {
      ...values,
      countryCode: values.countryCode || undefined,
      code: values.code || undefined,
      parentJurisdictionId: values.parentJurisdictionId || null,
    }
    try {
      if (jurisdiction) {
        await updateTaxJurisdiction({ id: jurisdiction._id, body }).unwrap()
        toast.success(`Tax jurisdiction "${values.name}" updated`)
      } else {
        await createTaxJurisdiction(body).unwrap()
        toast.success(`Tax jurisdiction "${values.name}" created`)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save tax jurisdiction'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{jurisdiction ? 'Edit Tax Jurisdiction' : 'New Tax Jurisdiction'}</DialogTitle>
          <DialogDescription>
            A geographic scope a tax rate can be attached to — e.g. a US state, county, or city.
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
                    <Input placeholder='e.g. California' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='level'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Level *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {LEVEL_LABELS[level]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      <Input placeholder='e.g. CA' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='countryCode'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <SearchableSelect
                    options={countryOptions}
                    value={field.value || ''}
                    onValueChange={field.onChange}
                    placeholder='Select country'
                    searchPlaceholder='Search countries...'
                    clearLabel='No country'
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='parentJurisdictionId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Jurisdiction</FormLabel>
                  <SearchableSelect
                    options={parentOptions}
                    value={field.value || ''}
                    onValueChange={field.onChange}
                    placeholder='No parent (top-level)'
                    searchPlaceholder='Search jurisdictions...'
                    clearLabel='No parent (top-level)'
                  />
                  <p className='text-xs text-muted-foreground'>
                    Optional rollup for reporting/hierarchy display — e.g. a City under a County under a State.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : jurisdiction ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function TaxJurisdictionsSettings() {
  const { hasExplicitPermission } = usePermissions()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<'all' | Level>('all')
  const [countryFilter, setCountryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [current, setCurrent] = useState<TaxJurisdiction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TaxJurisdiction | null>(null)

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timeout)
  }, [search])

  const { data: countries } = useGetCountriesQuery()
  const countryOptions = (countries || []).map((c) => ({ value: c.code, label: c.name }))

  // Unfiltered list, used to resolve parent names/breadcrumbs and populate the dialog's
  // parent picker — independent of whatever filters are currently narrowing the table.
  const { data: allJurisdictionsData } = useGetTaxJurisdictionsQuery({ limit: 100 })
  const allJurisdictions = useMemo(() => allJurisdictionsData?.results || [], [allJurisdictionsData])
  const jurisdictionById = useMemo(() => new Map(allJurisdictions.map((j) => [j._id, j])), [allJurisdictions])

  const queryParams = useMemo(
    () => ({
      limit: 100,
      ...(debouncedSearch ? { search: debouncedSearch, fieldName: 'name,code' } : {}),
      ...(levelFilter !== 'all' ? { level: levelFilter } : {}),
      ...(countryFilter ? { countryCode: countryFilter } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    }),
    [debouncedSearch, levelFilter, countryFilter, statusFilter]
  )
  const { data, isLoading } = useGetTaxJurisdictionsQuery(queryParams)
  const jurisdictions = data?.results || []

  const [updateTaxJurisdiction] = useUpdateTaxJurisdictionMutation()
  const [deleteTaxJurisdiction] = useDeleteTaxJurisdictionMutation()

  const hasActiveFilters = !!debouncedSearch || levelFilter !== 'all' || !!countryFilter || statusFilter !== 'all'

  const handleActivate = async (target: TaxJurisdiction) => {
    try {
      await updateTaxJurisdiction({ id: target._id, body: { status: 'active' } }).unwrap()
      toast.success(`Tax jurisdiction "${target.name}" activated`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to activate tax jurisdiction'))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteTaxJurisdiction(deleteTarget._id).unwrap()
      toast.success(`Tax jurisdiction "${deleteTarget.name}" deactivated`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to deactivate tax jurisdiction'))
    }
  }

  return (
    <ContentSection
      title='Tax Jurisdictions'
      desc='Geographic scopes (state, county, city...) a tax rate can be attached to — required for US-style stacked sales tax.'
    >
      <div className='space-y-4'>
        <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'>
          <div className='flex flex-1 flex-wrap gap-2'>
            <Input
              placeholder='Search name or code...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='max-w-56'
            />
            <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as 'all' | Level)}>
              <SelectTrigger className='w-44'>
                <SelectValue placeholder='All levels' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All levels</SelectItem>
                {LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchableSelect
              options={countryOptions}
              value={countryFilter}
              onValueChange={setCountryFilter}
              placeholder='All countries'
              searchPlaceholder='Search countries...'
              clearLabel='All countries'
              className='w-48'
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
              <SelectTrigger className='w-36'>
                <SelectValue placeholder='All statuses' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All statuses</SelectItem>
                <SelectItem value='active'>Active</SelectItem>
                <SelectItem value='inactive'>Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Can permission='manageTaxJurisdictions'>
            <Button
              onClick={() => {
                setCurrent(null)
                setDialogOpen(true)
              }}
            >
              <Plus className='mr-2 h-4 w-4' /> Add Jurisdiction
            </Button>
          </Can>
        </div>

        {isLoading ? (
          <Skeleton className='h-64 w-full' />
        ) : jurisdictions.length === 0 ? (
          <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center'>
            <MapPin className='mb-3 h-10 w-10 text-muted-foreground' />
            <h3 className='text-sm font-medium'>{hasActiveFilters ? 'No jurisdictions match your filters' : 'No tax jurisdictions yet'}</h3>
            <p className='mt-1 max-w-sm text-xs text-muted-foreground'>
              {hasActiveFilters
                ? 'Try adjusting or clearing your search and filters.'
                : 'Create a jurisdiction (e.g. a US state or county) before attaching stacked tax rates to it.'}
            </p>
            {!hasActiveFilters && (
              <Can permission='manageTaxJurisdictions'>
                <Button
                  className='mt-4'
                  onClick={() => {
                    setCurrent(null)
                    setDialogOpen(true)
                  }}
                >
                  <Plus className='mr-2 h-4 w-4' /> Create Jurisdiction
                </Button>
              </Can>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='w-10' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jurisdictions.map((jurisdiction) => (
                <TableRow key={jurisdiction._id}>
                  <TableCell className='font-medium'>{jurisdiction.name}</TableCell>
                  <TableCell>
                    <Badge variant='secondary'>{LEVEL_LABELS[jurisdiction.level]}</Badge>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {countryOptions.find((c) => c.value === jurisdiction.countryCode)?.label || jurisdiction.countryCode || '—'}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>{jurisdiction.code || '—'}</TableCell>
                  <TableCell className='text-muted-foreground'>{buildAncestryChain(jurisdiction, jurisdictionById) || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={jurisdiction.status === 'inactive' ? 'outline' : 'default'}>
                      {jurisdiction.status === 'inactive' ? 'Inactive' : 'Active'}
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
                        {hasExplicitPermission('manageTaxJurisdictions') && (
                          <DropdownMenuItem
                            onClick={() => {
                              setCurrent(jurisdiction)
                              setDialogOpen(true)
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                        )}
                        {hasExplicitPermission('manageTaxJurisdictions') &&
                          (jurisdiction.status === 'inactive' ? (
                            <DropdownMenuItem onClick={() => handleActivate(jurisdiction)}>Activate</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className='text-destructive' onClick={() => setDeleteTarget(jurisdiction)}>
                              Deactivate
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <TaxJurisdictionDialog open={dialogOpen} onOpenChange={setDialogOpen} jurisdiction={current} allJurisdictions={allJurisdictions} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate tax jurisdiction?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks <strong>{deleteTarget?.name}</strong> as inactive — it stops being selectable for new tax
              rates, but existing rates and historical invoices/purchases that already reference it keep working
              unchanged. You can reactivate it later.
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
