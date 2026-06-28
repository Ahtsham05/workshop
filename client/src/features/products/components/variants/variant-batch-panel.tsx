import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useGetBatchesForVariantQuery,
  useCreateBatchMutation,
  useWriteOffBatchMutation,
} from '@/stores/batch.api'

const EXPIRY_WARNING_DAYS = 30

function expiryBadge(expiryDate?: string) {
  if (!expiryDate) return null
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return <Badge variant='destructive'>Expired</Badge>
  if (days <= EXPIRY_WARNING_DAYS) return <Badge className='bg-amber-500 text-white hover:bg-amber-500'>Expires in {days}d</Badge>
  return <Badge variant='outline'>{new Date(expiryDate).toLocaleDateString()}</Badge>
}

const emptyDraft = { batchNumber: '', quantity: '', costPerUnit: '', sellingPrice: '', expiryDate: '' }

/** Receive and track batches/lots for one batch- or expiry-tracked variant. */
export function VariantBatchPanel({ variantId, variantLabel }: { variantId: string; variantLabel: string }) {
  const { data: batches = [], isLoading } = useGetBatchesForVariantQuery(variantId)
  const [createBatch, { isLoading: isCreating }] = useCreateBatchMutation()
  const [writeOffBatch] = useWriteOffBatchMutation()
  const [draft, setDraft] = useState(emptyDraft)
  const [showForm, setShowForm] = useState(false)

  const activeBatches = batches.filter((b) => b.status === 'active')

  const handleCreate = async () => {
    const quantity = Number(draft.quantity)
    const costPerUnit = Number(draft.costPerUnit)
    if (!draft.batchNumber.trim() || !quantity || quantity <= 0) {
      toast.error('Batch number and a positive quantity are required')
      return
    }
    try {
      await createBatch({
        variantId,
        data: {
          batchNumber: draft.batchNumber.trim(),
          quantity,
          costPerUnit: costPerUnit || 0,
          sellingPrice: draft.sellingPrice ? Number(draft.sellingPrice) : undefined,
          expiryDate: draft.expiryDate || undefined,
        },
      }).unwrap()
      toast.success(`Batch "${draft.batchNumber}" received`)
      setDraft(emptyDraft)
      setShowForm(false)
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to create batch')
    }
  }

  const handleWriteOff = async (batchId: string, batchNumber: string) => {
    try {
      await writeOffBatch({ batchId, variantId }).unwrap()
      toast.success(`Batch "${batchNumber}" written off`)
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to write off batch')
    }
  }

  return (
    <div className='rounded-lg border border-border/60 p-3'>
      <div className='mb-2 flex items-center justify-between'>
        <p className='text-sm font-medium'>Batches — {variantLabel}</p>
        <Button type='button' size='sm' variant='outline' onClick={() => setShowForm((v) => !v)}>
          <Plus className='mr-1 h-3.5 w-3.5' />
          Receive batch
        </Button>
      </div>

      {showForm && (
        <div className='mb-3 grid grid-cols-2 gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-5'>
          <Input
            placeholder='Batch number'
            showVoiceInput={false}
            className='h-8'
            value={draft.batchNumber}
            onChange={(e) => setDraft((d) => ({ ...d, batchNumber: e.target.value }))}
          />
          <Input
            type='number'
            min={1}
            placeholder='Quantity'
            showVoiceInput={false}
            className='h-8'
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
          />
          <Input
            type='number'
            min={0}
            placeholder='Cost per unit'
            showVoiceInput={false}
            className='h-8'
            value={draft.costPerUnit}
            onChange={(e) => setDraft((d) => ({ ...d, costPerUnit: e.target.value }))}
          />
          <Input
            type='number'
            min={0}
            placeholder='Selling price'
            showVoiceInput={false}
            className='h-8'
            value={draft.sellingPrice}
            onChange={(e) => setDraft((d) => ({ ...d, sellingPrice: e.target.value }))}
          />
          <Input
            type='date'
            showVoiceInput={false}
            className='h-8'
            value={draft.expiryDate}
            onChange={(e) => setDraft((d) => ({ ...d, expiryDate: e.target.value }))}
          />
          <div className='col-span-2 sm:col-span-5'>
            <Button type='button' size='sm' disabled={isCreating} onClick={handleCreate}>
              Save batch
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className='text-sm text-muted-foreground'>Loading batches…</p>
      ) : activeBatches.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No batches received yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch #</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Cost/unit</TableHead>
              <TableHead>Selling price</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className='w-20' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeBatches.map((batch) => (
              <TableRow key={batch._id || batch.id}>
                <TableCell className='font-medium'>{batch.batchNumber}</TableCell>
                <TableCell>{batch.quantity}</TableCell>
                <TableCell>{batch.costPerUnit}</TableCell>
                <TableCell>{batch.sellingPrice ?? '-'}</TableCell>
                <TableCell>{expiryBadge(batch.expiryDate)}</TableCell>
                <TableCell>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    className='text-destructive'
                    onClick={() => handleWriteOff(batch._id || batch.id || '', batch.batchNumber)}
                  >
                    Write off
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
