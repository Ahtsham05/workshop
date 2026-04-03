import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pencil, Trash2, Plus } from 'lucide-react'
import {
  useGetUtilityCompaniesQuery,
  useCreateUtilityCompanyMutation,
  useUpdateUtilityCompanyMutation,
  useDeleteUtilityCompanyMutation,
  type UtilityCompanyRecord,
  BILL_TYPES,
} from '@/stores/mobile-shop.api'

type FormState = {
  name: string
  billType: string
  defaultServiceCharge: string
  isActive: boolean
}

const makeInitialForm = (): FormState => ({
  name: '',
  billType: 'electricity',
  defaultServiceCharge: '0',
  isActive: true,
})

const BILL_TYPE_LABELS: Record<string, string> = {
  electricity: 'Electricity',
  gas: 'Gas',
  water: 'Water',
  internet: 'Internet',
  other: 'Other',
}

export function UtilityCompanyManager() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UtilityCompanyRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UtilityCompanyRecord | null>(null)
  const [form, setForm] = useState<FormState>(makeInitialForm())

  const { data, isLoading } = useGetUtilityCompaniesQuery()
  const [createCompany, { isLoading: isCreating }] = useCreateUtilityCompanyMutation()
  const [updateCompany, { isLoading: isUpdating }] = useUpdateUtilityCompanyMutation()
  const [deleteCompany, { isLoading: isDeleting }] = useDeleteUtilityCompanyMutation()

  const companies = data?.results ?? []

  const openCreate = () => {
    setEditTarget(null)
    setForm(makeInitialForm())
    setDialogOpen(true)
  }

  const openEdit = (company: UtilityCompanyRecord) => {
    setEditTarget(company)
    setForm({
      name: company.name,
      billType: company.billType,
      defaultServiceCharge: String(company.defaultServiceCharge),
      isActive: company.isActive,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Company name is required')
    if (!form.billType) return toast.error('Bill type is required')
    const charge = parseFloat(form.defaultServiceCharge)
    if (isNaN(charge) || charge < 0) return toast.error('Service charge must be ≥ 0')

    try {
      const payload = {
        name: form.name.trim(),
        billType: form.billType as UtilityCompanyRecord['billType'],
        defaultServiceCharge: charge,
        isActive: form.isActive,
      }
      if (editTarget) {
        await updateCompany({ id: editTarget.id, body: payload }).unwrap()
        toast.success('Company updated')
      } else {
        await createCompany(payload).unwrap()
        toast.success('Company added')
      }
      setDialogOpen(false)
    } catch {
      toast.error('Failed to save company')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteCompany(deleteTarget.id).unwrap()
      toast.success('Company deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete company')
    }
  }

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between'>
        <CardTitle>Utility Companies</CardTitle>
        <Button size='sm' onClick={openCreate}>
          <Plus className='mr-1 h-4 w-4' />
          Add Company
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className='text-muted-foreground text-sm'>Loading…</p>
        ) : companies.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No companies yet. Add one to get started.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Service Charge</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className='font-medium'>{company.name}</TableCell>
                  <TableCell>{BILL_TYPE_LABELS[company.billType] ?? company.billType}</TableCell>
                  <TableCell>Rs. {company.defaultServiceCharge.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={company.isActive ? 'default' : 'secondary'}>
                      {company.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right space-x-1'>
                    <Button size='icon' variant='ghost' onClick={() => openEdit(company)}>
                      <Pencil className='h-4 w-4' />
                    </Button>
                    <Button size='icon' variant='ghost' onClick={() => setDeleteTarget(company)}>
                      <Trash2 className='h-4 w-4 text-destructive' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Company' : 'Add Company'}</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label>Company Name *</Label>
              <Input
                placeholder='e.g. FESCO, SNGPL, PTCL'
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Bill Type *</Label>
              <Select value={form.billType} onValueChange={(v) => setForm((f) => ({ ...f, billType: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {BILL_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Service Charge (Rs.) *</Label>
              <Input
                type='number'
                min='0'
                step='1'
                value={form.defaultServiceCharge}
                onChange={(e) => setForm((f) => ({ ...f, defaultServiceCharge: e.target.value }))}
              />
            </div>
            <div className='flex items-center gap-2'>
              <input
                type='checkbox'
                id='isActive'
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <Label htmlFor='isActive'>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isCreating || isUpdating}>
              {editTarget ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
          </DialogHeader>
          <p>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={handleDelete} disabled={isDeleting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
