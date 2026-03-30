import { useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import {
  useGetMembersByOrgQuery,
  useCreateStaffMutation,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useAddMemberMutation,
  Membership,
} from '@/stores/membership.api'
import { useGetMyBranchesQuery, Branch } from '@/stores/branch.api'
import { useGetUsersQuery } from '@/stores/users.api'
import { RootState } from '@/stores/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Shield, UserPlus, Link2 } from 'lucide-react'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

const ROLE_LABELS: Record<string, string> = {
  superAdmin: 'Super Admin',
  branchAdmin: 'Branch Admin',
  staff: 'Staff',
}

type DialogMode = 'create' | 'assign'

export default function StaffPage() {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const isSuperAdmin = user?.systemRole === 'superAdmin'

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<DialogMode>('create')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<Membership | null>(null)

  // Create new user + assign form
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    branchId: isSuperAdmin ? '' : (activeBranchId ?? ''),
    role: 'staff' as 'branchAdmin' | 'staff',
  })

  // Assign existing user form
  const [assignForm, setAssignForm] = useState({
    userId: '',
    branchId: isSuperAdmin ? '' : (activeBranchId ?? ''),
    role: 'staff' as 'branchAdmin' | 'staff',
  })

  // Data fetching
  const { data: orgMembers, isLoading: isMembersLoading, refetch: refetchMembers } = useGetMembersByOrgQuery()
  const { data: allUsersData, isLoading: isUsersLoading, refetch: refetchUsers } = useGetUsersQuery({ page: 1, limit: 200 })
  const { data: branches } = useGetMyBranchesQuery()

  const [createStaff, { isLoading: isCreating }] = useCreateStaffMutation()
  const [addMember, { isLoading: isAssigning }] = useAddMemberMutation()
  const [updateMemberRole] = useUpdateMemberRoleMutation()
  const [removeMember, { isLoading: isRemoving }] = useRemoveMemberMutation()

  // Build a userId → membership map
  const membershipByUserId = useMemo(() => {
    const map = new Map<string, Membership>()
    for (const m of (orgMembers ?? [])) {
      const uid = typeof m.userId === 'object' && m.userId !== null ? m.userId.id : String(m.userId)
      map.set(uid, m)
    }
    return map
  }, [orgMembers])

  // All org users — split into assigned and unassigned
  const allUsers = allUsersData?.results ?? []
  const assignedUsers = allUsers.filter((u) => membershipByUserId.has(u.id))
  const unassignedUsers = allUsers.filter((u) => !membershipByUserId.has(u.id))

  const openCreateDialog = () => {
    setCreateForm({ name: '', email: '', password: '', branchId: isSuperAdmin ? '' : (activeBranchId ?? ''), role: 'staff' })
    setDialogMode('create')
    setDialogOpen(true)
  }

  const openAssignDialog = (userId?: string) => {
    setAssignForm({ userId: userId ?? '', branchId: isSuperAdmin ? '' : (activeBranchId ?? ''), role: 'staff' })
    setDialogMode('assign')
    setDialogOpen(true)
  }

  const handleCreateStaff = async () => {
    if (!createForm.name || !createForm.email || !createForm.password || !createForm.branchId) {
      toast.error('Please fill in all required fields')
      return
    }
    try {
      await createStaff(createForm).unwrap()
      toast.success('Staff member created and assigned to branch')
      setDialogOpen(false)
      setCreateForm({ name: '', email: '', password: '', branchId: isSuperAdmin ? '' : (activeBranchId ?? ''), role: 'staff' })
      await Promise.all([refetchMembers(), refetchUsers()])
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to create staff member')
    }
  }

  const handleAssignUser = async () => {
    if (!assignForm.userId || !assignForm.branchId) {
      toast.error('Please select a user and a branch')
      return
    }
    try {
      await addMember({ userId: assignForm.userId, branchId: assignForm.branchId, role: assignForm.role }).unwrap()
      toast.success('User assigned to branch successfully')
      setDialogOpen(false)
      refetchMembers()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to assign user to branch')
    }
  }

  const handleRoleChange = async (membershipId: string, newRole: string) => {
    try {
      await updateMemberRole({ membershipId, role: newRole }).unwrap()
      toast.success('Role updated')
      refetchMembers()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update role')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!memberToDelete) return
    try {
      await removeMember(memberToDelete.id).unwrap()
      toast.success('Staff member removed from branch')
      refetchMembers()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to remove staff member')
    } finally {
      setDeleteDialogOpen(false)
      setMemberToDelete(null)
    }
  }

  const getMembershipForUser = (userId: string): Membership | undefined =>
    membershipByUserId.get(userId)

  const getBranchName = (branchId: Membership['branchId']) =>
    typeof branchId === 'object' && branchId !== null ? branchId.name : 'Unknown'

  const isLoading = isMembersLoading || isUsersLoading

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground">Manage your team members and their branch assignments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openAssignDialog()}>
            <Link2 className="mr-2 h-4 w-4" />
            Assign Existing User
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Staff
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            All Users
            <Badge variant="secondary" className="ml-2">{allUsers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="assigned">
            Assigned to Branch
            <Badge variant="secondary" className="ml-2">{assignedUsers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="unassigned">
            Unassigned
            {unassignedUsers.length > 0 && (
              <Badge variant="destructive" className="ml-2">{unassignedUsers.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ALL USERS TAB */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Team Members</CardTitle>
              <CardDescription>{allUsers.length} user{allUsers.length !== 1 ? 's' : ''} in your organization</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : allUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No users yet. Create your first team member.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Branch Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allUsers.map((u) => {
                      const membership = getMembershipForUser(u.id)
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell>
                            {membership ? (
                              getBranchName(membership.branchId)
                            ) : (
                              <span className="text-muted-foreground italic">Not assigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {membership ? (
                              membership.role === 'superAdmin' ? (
                                <Badge variant="default" className="gap-1">
                                  <Shield className="h-3 w-3" />
                                  {ROLE_LABELS[membership.role]}
                                </Badge>
                              ) : (
                                <Select
                                  value={membership.role}
                                  onValueChange={(val) => handleRoleChange(membership.id, val)}
                                >
                                  <SelectTrigger className="w-32 h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="branchAdmin">Branch Admin</SelectItem>
                                    <SelectItem value="staff">Staff</SelectItem>
                                  </SelectContent>
                                </Select>
                              )
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">—</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.isActive ? 'default' : 'secondary'}>
                              {u.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {!membership ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAssignDialog(u.id)}
                              >
                                <UserPlus className="mr-1 h-3.5 w-3.5" />
                                Assign Branch
                              </Button>
                            ) : (
                              membership.role !== 'superAdmin' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => { setMemberToDelete(membership); setDeleteDialogOpen(true) }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ASSIGNED TAB */}
        <TabsContent value="assigned">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Staff</CardTitle>
              <CardDescription>{assignedUsers.length} user{assignedUsers.length !== 1 ? 's' : ''} assigned to branches</CardDescription>
            </CardHeader>
            <CardContent>
              {assignedUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No assigned staff yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Branch Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignedUsers.map((u) => {
                      const membership = getMembershipForUser(u.id)!
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell>{getBranchName(membership.branchId)}</TableCell>
                          <TableCell>
                            {membership.role === 'superAdmin' ? (
                              <Badge variant="default" className="gap-1">
                                <Shield className="h-3 w-3" />
                                Super Admin
                              </Badge>
                            ) : (
                              <Select
                                value={membership.role}
                                onValueChange={(val) => handleRoleChange(membership.id, val)}
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
                            <Badge variant={u.isActive ? 'default' : 'secondary'}>
                              {u.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {membership.role !== 'superAdmin' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => { setMemberToDelete(membership); setDeleteDialogOpen(true) }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* UNASSIGNED TAB */}
        <TabsContent value="unassigned">
          <Card>
            <CardHeader>
              <CardTitle>Unassigned Users</CardTitle>
              <CardDescription>
                {unassignedUsers.length > 0
                  ? `${unassignedUsers.length} user${unassignedUsers.length !== 1 ? 's' : ''} not yet assigned to any branch`
                  : 'All users are assigned to branches'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unassignedUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">All users are already assigned to branches.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Business Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unassignedUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          {u.role ? (
                            <Badge variant="outline">{u.role.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.isActive ? 'default' : 'secondary'}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAssignDialog(u.id)}
                          >
                            <UserPlus className="mr-1 h-3.5 w-3.5" />
                            Assign Branch
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Staff / Assign User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Add New Staff Member' : 'Assign User to Branch'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'create'
                ? 'Create a new user account and assign them to a branch.'
                : 'Select an existing user and assign them to a branch.'}
            </DialogDescription>
          </DialogHeader>

          {dialogMode === 'create' ? (
            /* ── CREATE NEW STAFF ── */
            <div className="space-y-4">
              <div>
                <Label>Full Name *</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Ahmed Ali"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="ahmed@company.com"
                />
              </div>
              <div>
                <Label>Password *</Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Min. 8 characters"
                />
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Branch *</Label>
                  {isSuperAdmin ? (
                    <Select
                      value={createForm.branchId}
                      onValueChange={(val) => setCreateForm((p) => ({ ...p, branchId: val }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        {(branches || []).map((b: Branch) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm">
                      {branches?.find((b: Branch) => b.id === activeBranchId)?.name ?? 'Your branch'}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Branch Role *</Label>
                  <Select
                    value={createForm.role}
                    onValueChange={(val: 'branchAdmin' | 'staff') => setCreateForm((p) => ({ ...p, role: val }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="branchAdmin">Branch Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateStaff} disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create & Assign'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── ASSIGN EXISTING USER ── */
            <div className="space-y-4">
              <div>
                <Label>User *</Label>
                <Select
                  value={assignForm.userId}
                  onValueChange={(val) => setAssignForm((p) => ({ ...p, userId: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers
                      .filter((u) => !membershipByUserId.has(u.id))
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} — {u.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {allUsers.filter((u) => !membershipByUserId.has(u.id)).length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">All users are already assigned to a branch.</p>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Branch *</Label>
                  {isSuperAdmin ? (
                    <Select
                      value={assignForm.branchId}
                      onValueChange={(val) => setAssignForm((p) => ({ ...p, branchId: val }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        {(branches || []).map((b: Branch) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm">
                      {branches?.find((b: Branch) => b.id === activeBranchId)?.name ?? 'Your branch'}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Branch Role *</Label>
                  <Select
                    value={assignForm.role}
                    onValueChange={(val: 'branchAdmin' | 'staff') => setAssignForm((p) => ({ ...p, role: val }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="branchAdmin">Branch Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAssignUser} disabled={isAssigning}>
                  {isAssigning ? 'Assigning...' : 'Assign to Branch'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Branch Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the branch assignment for this user. The user account will still exist and can be reassigned later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Assignment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

