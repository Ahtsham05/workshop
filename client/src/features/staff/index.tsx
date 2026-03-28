import { useState } from 'react'
import { useSelector } from 'react-redux'
import { useGetMembersByOrgQuery, useGetMembersByBranchQuery, useCreateStaffMutation, useUpdateMemberRoleMutation, useRemoveMemberMutation, Membership } from '@/stores/membership.api'
import { useGetMyBranchesQuery, Branch } from '@/stores/branch.api'
import { RootState } from '@/stores/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Shield } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

const ROLE_LABELS: Record<string, string> = {
  superAdmin: 'Super Admin',
  branchAdmin: 'Branch Admin',
  staff: 'Staff',
}


export default function StaffPage() {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const isSuperAdmin = user?.systemRole === 'superAdmin'

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<Membership | null>(null)
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    password: '',
    branchId: isSuperAdmin ? '' : (activeBranchId ?? ''),
    role: 'staff' as 'branchAdmin' | 'staff',
  })

  const { data: orgMembers, isLoading: isOrgLoading, refetch: refetchOrg } = useGetMembersByOrgQuery(undefined, { skip: !isSuperAdmin })
  const { data: branchMembers, isLoading: isBranchLoading, refetch: refetchBranch } = useGetMembersByBranchQuery(activeBranchId ?? '', { skip: isSuperAdmin || !activeBranchId })

  const members = isSuperAdmin ? orgMembers : branchMembers
  const isLoading = isSuperAdmin ? isOrgLoading : isBranchLoading
  const refetch = isSuperAdmin ? refetchOrg : refetchBranch

  const { data: branches } = useGetMyBranchesQuery()
  const [createStaff, { isLoading: isCreating }] = useCreateStaffMutation()
  const [updateMemberRole] = useUpdateMemberRoleMutation()
  const [removeMember, { isLoading: isRemoving }] = useRemoveMemberMutation()

  const handleCreateStaff = async () => {
    if (!staffForm.name || !staffForm.email || !staffForm.password || !staffForm.branchId) {
      toast.error('Please fill in all required fields')
      return
    }
    try {
      await createStaff(staffForm).unwrap()
      toast.success('Staff member created and invited successfully')
      setDialogOpen(false)
      setStaffForm({ name: '', email: '', password: '', branchId: isSuperAdmin ? '' : (activeBranchId ?? ''), role: 'staff' })
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to create staff member')
    }
  }

  const handleRoleChange = async (membershipId: string, newRole: string) => {
    try {
      await updateMemberRole({ membershipId, role: newRole }).unwrap()
      toast.success('Role updated successfully')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update role')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!memberToDelete) return
    try {
      await removeMember(memberToDelete.id).unwrap()
      toast.success('Staff member removed')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to remove staff member')
    } finally {
      setDeleteDialogOpen(false)
      setMemberToDelete(null)
    }
  }

  const membersList = Array.isArray(members) ? members : []

  const getUserName = (userId: Membership['userId']) =>
    typeof userId === 'object' && userId !== null ? userId.name : 'Unknown'
  const getUserEmail = (userId: Membership['userId']) =>
    typeof userId === 'object' && userId !== null ? userId.email : ''
  const getBranchName = (branchId: Membership['branchId']) =>
    typeof branchId === 'object' && branchId !== null ? branchId.name : 'Unknown'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground">Manage your team members and assign them to branches</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Staff
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            {membersList.length} member{membersList.length !== 1 ? 's' : ''} {isSuperAdmin ? 'across all branches' : `in this branch`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading staff...</div>
          ) : membersList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No staff members yet. Add your first team member.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersList.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{getUserName(member.userId)}</TableCell>
                    <TableCell className="text-muted-foreground">{getUserEmail(member.userId)}</TableCell>
                    <TableCell>{getBranchName(member.branchId)}</TableCell>
                    <TableCell>
                      {member.role === 'superAdmin' ? (
                        <Badge variant="default" className="gap-1">
                          <Shield className="h-3 w-3" />
                          {ROLE_LABELS[member.role]}
                        </Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(val) => handleRoleChange(member.id, val)}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="branchAdmin">Branch Admin</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.isActive ? 'default' : 'secondary'}>
                        {member.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {member.role !== 'superAdmin' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setMemberToDelete(member)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Staff Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>Create a new team member and assign them to a branch</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input
                value={staffForm.name}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={staffForm.email}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="john@company.com"
              />
            </div>
            <div>
              <Label>Password *</Label>
              <Input
                type="password"
                value={staffForm.password}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Minimum 8 characters"
              />
            </div>
            {isSuperAdmin ? (
              <div>
                <Label>Assign to Branch *</Label>
                <Select
                  value={staffForm.branchId}
                  onValueChange={(val) => setStaffForm((prev) => ({ ...prev, branchId: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {(branches || []).map((branch: Branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Branch</Label>
                <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm">
                  {branches?.find((b: Branch) => b.id === activeBranchId)?.name ?? activeBranchId ?? 'Your branch'}
                </div>
              </div>
            )}
            <div>
              <Label>Role *</Label>
              <Select
                value={staffForm.role}
                onValueChange={(val: 'branchAdmin' | 'staff') =>
                  setStaffForm((prev) => ({ ...prev, role: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="branchAdmin">Branch Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateStaff} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Add Staff Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToDelete ? getUserName(memberToDelete.userId) : ''} from this branch?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
