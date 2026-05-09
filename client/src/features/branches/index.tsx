import { ChangeEvent, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useGetBranchesQuery, useCreateBranchMutation, useUpdateBranchMutation, useDeleteBranchMutation, Branch } from '@/stores/branch.api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit, Trash2, MapPin, Lock, ArrowUpRight } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePlanLimits } from '@/hooks/use-plan-limits'
import { useGetMyOrganizationQuery, useUpdateOrganizationMutation } from '@/stores/organization.api'
import { fetchUrduNameSuggestion, useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'
import { cn } from '@/lib/utils'
import { getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'

const branchDialogSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  nameUrdu: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  invoiceNote: z.string().optional(),
  location: z.object({
    address: z.string().optional(),
    addressUrdu: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
  }),
})

type BranchDialogValues = z.infer<typeof branchDialogSchema>

export default function BranchesPage() {
  const [page] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null)

  const branchForm = useForm<BranchDialogValues>({
    resolver: zodResolver(branchDialogSchema),
    defaultValues: {
      name: '',
      nameUrdu: '',
      location: { address: '', addressUrdu: '', city: '', country: '' },
      phone: '',
      email: '',
      invoiceNote: '',
    },
  })

  useAutoUrduNameFromEnglish(branchForm, 'name', 'nameUrdu')
  useAutoUrduNameFromEnglish(branchForm, 'location.address', 'location.addressUrdu')

  const { data, isLoading, refetch } = useGetBranchesQuery({ page, limit: 20 })
  const [createBranch, { isLoading: isCreating }] = useCreateBranchMutation()
  const [updateBranch, { isLoading: isUpdating }] = useUpdateBranchMutation()
  const [deleteBranch, { isLoading: isDeleting }] = useDeleteBranchMutation()
  const { data: orgData } = useGetMyOrganizationQuery()
  const [updateOrganization, { isLoading: isUpdatingOrganization }] = useUpdateOrganizationMutation()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const {
    branchesUsed,
    maxBranches,
    branchLimitReached,
    planLabel,
    isLoading: limitsLoading,
  } = usePlanLimits()

  useEffect(() => {
    if (!dialogOpen) return

    if (selectedBranch) {
      branchForm.reset({
        name: selectedBranch.name,
        nameUrdu: selectedBranch.nameUrdu || '',
        location: {
          address: selectedBranch.location?.address || '',
          addressUrdu: selectedBranch.location?.addressUrdu || '',
          city: selectedBranch.location?.city || '',
          country: selectedBranch.location?.country || '',
        },
        phone: selectedBranch.phone || '',
        email: selectedBranch.email || '',
        invoiceNote: selectedBranch.invoiceNote || '',
      })
    } else {
      branchForm.reset({
        name: '',
        nameUrdu: '',
        location: { address: '', addressUrdu: '', city: '', country: '' },
        phone: '',
        email: '',
        invoiceNote: '',
      })
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      if (cancelled) return
      const name = String(branchForm.getValues('name') ?? '').trim()
      const urdu = String(branchForm.getValues('nameUrdu') ?? '').trim()
      if (name.length < 2 || urdu) return
      const suggestion = await fetchUrduNameSuggestion(name)
      if (!cancelled && suggestion) {
        branchForm.setValue('nameUrdu', suggestion)
      }
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [dialogOpen, selectedBranch?.id])

  const handleCreate = () => {
    setSelectedBranch(null)
    setDialogOpen(true)
  }

  const handleEdit = (branch: Branch) => {
    setSelectedBranch(branch)
    setDialogOpen(true)
  }

  const handleDeleteClick = (branch: Branch) => {
    setBranchToDelete(branch)
    setDeleteDialogOpen(true)
  }

  const onBranchDialogSubmit = async (values: BranchDialogValues) => {
    try {
      if (selectedBranch) {
        await updateBranch({ branchId: selectedBranch.id, body: values }).unwrap()
        toast.success('Branch updated successfully')
      } else {
        await createBranch(values).unwrap()
        toast.success('Branch created successfully')
      }
      setDialogOpen(false)
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Operation failed')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!branchToDelete) return
    try {
      await deleteBranch(branchToDelete.id).unwrap()
      toast.success('Branch deleted successfully')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to delete branch')
    } finally {
      setDeleteDialogOpen(false)
      setBranchToDelete(null)
    }
  }

  const branches = data?.results || []
  const effectiveLogoPreview = logoPreview || orgData?.logo?.url || null

  const handleLogoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setLogoFile(file)
    if (file) {
      setLogoPreview(URL.createObjectURL(file))
    } else {
      setLogoPreview(null)
    }
  }

  const handleSaveSharedLogo = async () => {
    if (!orgData?.id || !logoFile) {
      toast.error('Please select a logo first')
      return
    }
    try {
      await updateOrganization({
        orgId: orgData.id,
        body: {},
        logoFile,
      }).unwrap()
      toast.success('Company logo updated. This shared logo will show for all branches.')
      setLogoFile(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update logo')
    }
  }

  const handleRemoveSharedLogo = async () => {
    if (!orgData?.id) return
    try {
      await updateOrganization({
        orgId: orgData.id,
        body: {},
        removeLogo: true,
      }).unwrap()
      toast.success('Company logo removed')
      setLogoFile(null)
      setLogoPreview(null)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to remove logo')
    }
  }

  const maxBranchesDisplay = maxBranches === Infinity ? '∞' : maxBranches

  return (
    <div className="p-6 space-y-6">
      {/* Plan limit banner */}
      {branchLimitReached && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Lock className="h-4 w-4 shrink-0" />
            <span>
              You have reached the branch limit for your <strong>{planLabel}</strong> ({branchesUsed}/{maxBranchesDisplay} branches).
              Upgrade to add more locations.
            </span>
          </div>
          <Link to="/subscription/pricing">
            <Button size="sm" variant="outline" className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/50">
              <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
              Upgrade Plan
            </Button>
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branch Management</h1>
          <p className="text-muted-foreground">Manage your company branches and locations</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Usage indicator */}
          {!limitsLoading && (
            <div className="text-sm text-muted-foreground tabular-nums">
              <span className={branchLimitReached ? 'text-amber-600 font-semibold' : ''}>
                {branchesUsed}
              </span>
              <span> / {maxBranchesDisplay} branches</span>
            </div>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button onClick={handleCreate} disabled={branchLimitReached}>
                    {branchLimitReached ? (
                      <Lock className="mr-2 h-4 w-4" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Add Branch
                  </Button>
                </span>
              </TooltipTrigger>
              {branchLimitReached && (
                <TooltipContent>
                  <p>Branch limit reached. Upgrade your plan to add more branches.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Logo (Shared)</CardTitle>
          <CardDescription>
            This is the main organization logo and is used across all branches. Branches do not use separate logos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
              {effectiveLogoPreview ? (
                <img src={effectiveLogoPreview} alt="Organization logo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">No logo</span>
              )}
            </div>
            <div className="flex-1">
              <Input type="file" accept="image/*" onChange={handleLogoFileChange} />
              <p className="text-xs text-muted-foreground mt-1">
                Upload your main branch/company logo once. It will appear on receipts for all branches.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSaveSharedLogo} disabled={!logoFile || isUpdatingOrganization}>
                {isUpdatingOrganization ? 'Saving...' : 'Save Shared Logo'}
              </Button>
              {orgData?.logo?.url && (
                <Button variant="destructive" onClick={handleRemoveSharedLogo} disabled={isUpdatingOrganization}>
                  Remove Logo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branches</CardTitle>
          <CardDescription>
            {data?.totalResults || 0} branch{(data?.totalResults || 0) !== 1 ? 'es' : ''} in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading branches...</div>
          ) : branches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No branches found. Create your first branch to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium max-w-[14rem]">
                      <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                        <span className="shrink-0">{branch.name}</span>
                        {branch.nameUrdu?.trim() ? (
                          <span
                            className={cn('min-w-0 truncate text-sm rtl', getUrduSecondaryNameClasses(branch.nameUrdu))}
                            dir="rtl"
                            title={branch.nameUrdu.trim()}
                          >
                            {branch.nameUrdu.trim()}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {branch.location?.city || branch.location?.country ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {[branch.location?.city, branch.location?.country].filter(Boolean).join(', ')}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {branch.phone || branch.email || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={branch.isActive ? 'default' : 'secondary'}>
                        {branch.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {branch.isDefault && (
                        <Badge variant="outline" className="text-xs">Default</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(branch)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!branch.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteClick(branch)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedBranch ? 'Edit Branch' : 'Create Branch'}</DialogTitle>
            <DialogDescription>
              {selectedBranch ? 'Update branch details' : 'Add a new branch to your organization'}
            </DialogDescription>
          </DialogHeader>
          <Form {...branchForm}>
            <form id="branch-dialog-form" onSubmit={branchForm.handleSubmit(onBranchDialogSubmit)} className="space-y-4">
              <FormField
                control={branchForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Downtown Branch" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={branchForm.control}
                name="nameUrdu"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch Name (Urdu)</FormLabel>
                    <FormControl>
                      <Input placeholder="اردو میں نام" dir="rtl" className="text-right" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={branchForm.control}
                name="location.address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Street, area…"
                        rows={2}
                        className="resize-y min-h-[72px]"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Urdu is suggested automatically when you type English (you can edit it below).
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={branchForm.control}
                name="location.addressUrdu"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (Urdu)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="اردو میں پتہ"
                        rows={2}
                        dir="rtl"
                        className="resize-y min-h-[72px] text-right"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={branchForm.control}
                  name="location.city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="City" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={branchForm.control}
                  name="location.country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input placeholder="Country" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={branchForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 555 000 0000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={branchForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="branch@company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={branchForm.control}
                name="invoiceNote"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="branch-invoice-note">Invoice / receipt note</FormLabel>
                    <FormControl>
                      <Textarea
                        id="branch-invoice-note"
                        placeholder="Optional message printed at the bottom of invoices and receipts for this branch (e.g. thank-you, terms, return policy)."
                        rows={4}
                        className="resize-y min-h-[88px]"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Shown on sales invoices, purchase slips, mobile shop receipts, repair tickets, bills, and restaurant prints when this branch is active.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="branch-dialog-form" disabled={isCreating || isUpdating}>
              {selectedBranch ? 'Save Changes' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{branchToDelete?.name}"? This will also remove all staff memberships for this branch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
