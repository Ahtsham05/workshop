import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useGetBranchesQuery, useCreateBranchMutation, useUpdateBranchMutation, useDeleteBranchMutation, Branch, CreateBranchRequest } from '@/stores/branch.api'
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
import { Label } from '@/components/ui/label'
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

export default function BranchesPage() {
  const [page] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null)
  const [formData, setFormData] = useState<CreateBranchRequest>({
    name: '',
    location: { address: '', city: '', country: '' },
    phone: '',
    email: '',
  })

  const { data, isLoading, refetch } = useGetBranchesQuery({ page, limit: 20 })
  const [createBranch, { isLoading: isCreating }] = useCreateBranchMutation()
  const [updateBranch, { isLoading: isUpdating }] = useUpdateBranchMutation()
  const [deleteBranch, { isLoading: isDeleting }] = useDeleteBranchMutation()

  const {
    branchesUsed,
    maxBranches,
    branchLimitReached,
    planLabel,
    isLoading: limitsLoading,
  } = usePlanLimits()

  const handleCreate = () => {
    setSelectedBranch(null)
    setFormData({ name: '', location: { address: '', city: '', country: '' }, phone: '', email: '' })
    setDialogOpen(true)
  }

  const handleEdit = (branch: Branch) => {
    setSelectedBranch(branch)
    setFormData({
      name: branch.name,
      location: branch.location || { address: '', city: '', country: '' },
      phone: branch.phone || '',
      email: branch.email || '',
    })
    setDialogOpen(true)
  }

  const handleDeleteClick = (branch: Branch) => {
    setBranchToDelete(branch)
    setDeleteDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Branch name is required')
      return
    }
    try {
      if (selectedBranch) {
        await updateBranch({ branchId: selectedBranch.id, body: formData }).unwrap()
        toast.success('Branch updated successfully')
      } else {
        await createBranch(formData).unwrap()
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
                    <TableCell className="font-medium">{branch.name}</TableCell>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedBranch ? 'Edit Branch' : 'Create Branch'}</DialogTitle>
            <DialogDescription>
              {selectedBranch ? 'Update branch details' : 'Add a new branch to your organization'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Branch Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Downtown Branch"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City</Label>
                <Input
                  value={formData.location?.city || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, location: { ...prev.location, city: e.target.value } }))}
                  placeholder="City"
                />
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={formData.location?.country || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, location: { ...prev.location, country: e.target.value } }))}
                  placeholder="Country"
                />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={formData.location?.address || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, location: { ...prev.location, address: e.target.value } }))}
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input
                  value={formData.phone || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="+1 555 000 0000"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={formData.email || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="branch@company.com"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isCreating || isUpdating}>
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
