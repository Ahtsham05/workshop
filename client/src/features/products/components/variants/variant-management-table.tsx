import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { VariantDraftRow } from './generate-variant-combinations'

interface Props {
  rows: VariantDraftRow[]
  onChange: (rows: VariantDraftRow[]) => void
}

/** Editable SKU / barcode / cost / price / opening-stock grid for generated variant combinations. */
export function VariantManagementTable({ rows, onChange }: Props) {
  const updateRow = (key: string, patch: Partial<VariantDraftRow>) => {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const removeRow = (key: string) => {
    onChange(rows.filter((row) => row.key !== key))
  }

  if (rows.length === 0) return null

  return (
    <div className='overflow-x-auto rounded-lg border border-border/60'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Variant</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Barcode</TableHead>
            <TableHead>Cost price</TableHead>
            <TableHead>Sale price</TableHead>
            <TableHead>Opening stock</TableHead>
            <TableHead className='w-10' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className='whitespace-nowrap font-medium'>{row.label}</TableCell>
              <TableCell>
                <Input
                  showVoiceInput={false}
                  className='h-8 w-28'
                  value={row.sku}
                  onChange={(e) => updateRow(row.key, { sku: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  showVoiceInput={false}
                  className='h-8 w-32'
                  value={row.barcode}
                  onChange={(e) => updateRow(row.key, { barcode: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  type='number'
                  min={0}
                  showVoiceInput={false}
                  className='h-8 w-24'
                  value={row.cost}
                  onChange={(e) => updateRow(row.key, { cost: Number(e.target.value) || 0 })}
                />
              </TableCell>
              <TableCell>
                <Input
                  type='number'
                  min={0}
                  showVoiceInput={false}
                  className='h-8 w-24'
                  value={row.price}
                  onChange={(e) => updateRow(row.key, { price: Number(e.target.value) || 0 })}
                />
              </TableCell>
              <TableCell>
                <Input
                  type='number'
                  min={0}
                  showVoiceInput={false}
                  className='h-8 w-24'
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) || 0 })}
                />
              </TableCell>
              <TableCell>
                <Button type='button' size='icon' variant='ghost' onClick={() => removeRow(row.key)}>
                  <X className='h-4 w-4' />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
