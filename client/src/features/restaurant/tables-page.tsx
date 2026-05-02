import { useMemo, useState } from 'react'
import { RestaurantShell } from '@/features/restaurant/shell'
import {
  useGetFloorsQuery,
  useCreateFloorMutation,
  useDeleteFloorMutation,
  useGetTablesQuery,
  useCreateTableMutation,
  useRegenerateTableQrMutation,
} from '@/stores/restaurant.api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

export default function RestaurantTablesPage() {
  const { data: floors = [], refetch: refetchFloors } = useGetFloorsQuery()
  const [floorId, setFloorId] = useState<string>('')
  const { data: tables = [], refetch: refetchTables } = useGetTablesQuery(
    floorId ? { floorId } : undefined,
  )

  const [newFloor, setNewFloor] = useState('')
  const [tableLabel, setTableLabel] = useState('')
  const [capacity, setCapacity] = useState(4)

  const [createFloor, { isLoading: creatingFloor }] = useCreateFloorMutation()
  const [deleteFloor] = useDeleteFloorMutation()
  const [createTable, { isLoading: creatingTable }] = useCreateTableMutation()
  const [regenQr] = useRegenerateTableQrMutation()

  const selectedFloor = useMemo(
    () => floors.find((f) => f.id === floorId),
    [floors, floorId],
  )

  const orderBaseUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/order`

  return (
    <RestaurantShell
      title='Floors & tables'
      description='Define dining areas, table numbers, and stable QR links for guest ordering.'
    >
      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Floors</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex gap-2'>
              <Input
                placeholder='New floor name (e.g. Ground, Rooftop)'
                value={newFloor}
                onChange={(e) => setNewFloor(e.target.value)}
              />
              <Button
                disabled={!newFloor.trim() || creatingFloor}
                onClick={async () => {
                  try {
                    await createFloor({ name: newFloor.trim() }).unwrap()
                    setNewFloor('')
                    refetchFloors()
                    toast.success('Floor created')
                  } catch {
                    toast.error('Could not create floor')
                  }
                }}
              >
                Add
              </Button>
            </div>
            <ul className='space-y-2'>
              {floors.map((f) => (
                <li
                  key={f.id}
                  className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'
                >
                  <button
                    type='button'
                    className='text-left font-medium hover:underline'
                    onClick={() => setFloorId(f.id)}
                  >
                    {f.name}
                  </button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-destructive'
                    onClick={async () => {
                      try {
                        await deleteFloor(f.id).unwrap()
                        if (floorId === f.id) setFloorId('')
                        refetchFloors()
                        refetchTables()
                        toast.success('Floor removed')
                      } catch {
                        toast.error('Remove tables first')
                      }
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Tables & QR tokens</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <label className='text-sm text-muted-foreground'>Floor</label>
              <Select value={floorId || undefined} onValueChange={setFloorId}>
                <SelectTrigger>
                  <SelectValue placeholder='Choose floor' />
                </SelectTrigger>
                <SelectContent>
                  {floors.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Input
                placeholder='Table label'
                value={tableLabel}
                onChange={(e) => setTableLabel(e.target.value)}
                className='max-w-[140px]'
              />
              <Input
                type='number'
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className='w-24'
              />
              <Button
                disabled={!floorId || !tableLabel.trim() || creatingTable}
                onClick={async () => {
                  try {
                    await createTable({
                      floorId,
                      label: tableLabel.trim(),
                      capacity,
                    }).unwrap()
                    setTableLabel('')
                    refetchTables()
                    toast.success('Table added')
                  } catch {
                    toast.error('Could not add table')
                  }
                }}
              >
                Add table
              </Button>
            </div>
            {selectedFloor ? (
              <p className='text-xs text-muted-foreground'>
                Showing tables on <strong>{selectedFloor.name}</strong>. Guest links use{' '}
                <code className='rounded bg-muted px-1'>{orderBaseUrl}/&lt;token&gt;</code>
              </p>
            ) : null}
            <ul className='space-y-2'>
              {tables.map((t) => {
                const url = `${orderBaseUrl}/${t.qrToken}`
                return (
                  <li
                    key={t.id}
                    className='flex flex-col gap-2 rounded-md border px-3 py-2 text-sm md:flex-row md:items-center md:justify-between'
                  >
                    <div>
                      <div className='font-medium'>Table {t.label}</div>
                      <div className='break-all text-xs text-muted-foreground'>{url}</div>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant={t.status === 'occupied' ? 'default' : 'secondary'}>
                        {t.status}
                      </Badge>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={async () => {
                          try {
                            await regenQr(t.id).unwrap()
                            refetchTables()
                            toast.success('QR token rotated')
                          } catch {
                            toast.error('Failed')
                          }
                        }}
                      >
                        New QR
                      </Button>
                      <Button
                        size='sm'
                        variant='secondary'
                        onClick={async () => {
                          await navigator.clipboard.writeText(url)
                          toast.success('Link copied')
                        }}
                      >
                        Copy link
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </RestaurantShell>
  )
}
