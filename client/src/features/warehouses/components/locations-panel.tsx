import { useMemo, useState } from 'react'
import { Boxes, Layers, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { getErrorMessage } from '@/lib/get-error-message'
import {
  useCreateLocationMutation,
  useCreateLocationsBulkMutation,
  useDeleteLocationMutation,
  useGetLocationsQuery,
  useUpdateLocationMutation,
  type LocationType,
  type WarehouseLocation,
} from '@/stores/warehouse.api'
import { LOCATION_TYPE_LABELS, WAREHOUSE_PERMS } from '../lib/labels'

const NONE = '__none__'

/** Zones / aisles / racks / shelves / bins inside one warehouse, as an indented tree. */
export function LocationsPanel({ warehouseId }: { warehouseId: string }) {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canManage = hasAnyPermission(...WAREHOUSE_PERMS.manage)
  const { data: locations = [], isLoading } = useGetLocationsQuery(warehouseId)
  const [editing, setEditing] = useState<WarehouseLocation | 'new' | null>(null)
  const [bulk, setBulk] = useState(false)
  const [deleting, setDeleting] = useState<WarehouseLocation | null>(null)
  const [remove] = useDeleteLocationMutation()

  // Depth-first order so children sit under their parent.
  const ordered = useMemo(() => {
    const byParent = new Map<string, WarehouseLocation[]>()
    locations.forEach((l) => {
      const key = l.parentId || ''
      byParent.set(key, [...(byParent.get(key) || []), l])
    })
    const out: { loc: WarehouseLocation; depth: number }[] = []
    const walk = (parent: string, depth: number) => {
      ;(byParent.get(parent) || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).forEach((l) => {
        out.push({ loc: l, depth })
        walk(l.id, depth + 1)
      })
    }
    walk('', 0)
    return out
  }, [locations])

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-sm text-muted-foreground'>
          {t('Bins tell staff exactly where an item sits (e.g. Rack A → Shelf 2). Optional — stock without a bin is kept at warehouse level.')}
        </p>
        {canManage ? (
          <div className='flex shrink-0 gap-2'>
            <Button variant='outline' onClick={() => setBulk(true)}>
              <Layers className='mr-2 h-4 w-4' />
              {t('Add many')}
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus className='mr-2 h-4 w-4' />
              {t('Add location')}
            </Button>
          </div>
        ) : null}
      </div>

      <Card className='overflow-hidden p-0'>
        {isLoading ? (
          <div className='py-10 text-center'>
            <Loader2 className='mx-auto h-5 w-5 animate-spin text-muted-foreground' />
          </div>
        ) : ordered.length === 0 ? (
          <div className='flex flex-col items-center gap-2 py-12 text-center text-muted-foreground'>
            <Boxes className='h-8 w-8' />
            <p>{t('No bins yet.')}</p>
          </div>
        ) : (
          <ul className='divide-y'>
            {ordered.map(({ loc, depth }) => (
              <li key={loc.id} className='flex items-center gap-3 px-4 py-2.5'>
                <span style={{ paddingLeft: depth * 20 }} className='flex min-w-0 flex-1 items-center gap-2'>
                  {depth > 0 ? <span className='text-muted-foreground/60'>└</span> : null}
                  <span className='truncate font-medium'>{loc.name}</span>
                  <Badge variant='outline' className='text-[10px] font-normal'>
                    {t(LOCATION_TYPE_LABELS[loc.type])}
                  </Badge>
                  {!loc.isActive ? (
                    <Badge variant='secondary' className='text-[10px]'>
                      {t('Archived')}
                    </Badge>
                  ) : null}
                  {loc.barcode ? <span className='truncate font-mono text-xs text-muted-foreground'>{loc.barcode}</span> : null}
                </span>
                <span className='hidden truncate text-xs text-muted-foreground md:block'>{loc.path}</span>
                {canManage ? (
                  <span className='flex shrink-0 gap-1'>
                    <Button variant='ghost' size='icon' className='h-8 w-8' onClick={() => setEditing(loc)}>
                      <Pencil className='h-4 w-4' />
                    </Button>
                    <Button variant='ghost' size='icon' className='h-8 w-8 text-muted-foreground hover:text-destructive' onClick={() => setDeleting(loc)}>
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <LocationDialog
        warehouseId={warehouseId}
        location={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        locations={locations}
      />
      <BulkDialog warehouseId={warehouseId} open={bulk} onOpenChange={setBulk} locations={locations} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('Delete this location?')}
        desc={t('Only an empty location can be removed. One that has been used is archived instead, so its history stays readable.')}
        destructive
        confirmText={t('Delete')}
        handleConfirm={async () => {
          if (!deleting) return
          try {
            const res = await remove({ id: deleting.id, warehouseId }).unwrap()
            toast.success(res.archived ? t('Location archived') : t('Location deleted'))
          } catch (err) {
            toast.error(getErrorMessage(err, t('Could not delete the location')))
          }
          setDeleting(null)
        }}
      />
    </div>
  )
}

function ParentSelect({ value, onChange, locations, exclude }: { value: string; onChange: (v: string) => void; locations: WarehouseLocation[]; exclude?: string }) {
  const { t } = useLanguage()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className='w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('Top level')}</SelectItem>
        {locations
          .filter((l) => l.id !== exclude && !(exclude && l.path.includes(`${locations.find((x) => x.id === exclude)?.path} /`)))
          .map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.path}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}

function TypeSelect({ value, onChange }: { value: LocationType; onChange: (v: LocationType) => void }) {
  const { t } = useLanguage()
  return (
    <Select value={value} onValueChange={(v) => onChange(v as LocationType)}>
      <SelectTrigger className='w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(LOCATION_TYPE_LABELS).map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {t(label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function LocationDialog({
  warehouseId,
  location,
  open,
  onOpenChange,
  locations,
}: {
  warehouseId: string
  location: WarehouseLocation | null
  open: boolean
  onOpenChange: (o: boolean) => void
  locations: WarehouseLocation[]
}) {
  const { t } = useLanguage()
  const [create, { isLoading: creating }] = useCreateLocationMutation()
  const [update, { isLoading: updating }] = useUpdateLocationMutation()
  const [name, setName] = useState('')
  const [type, setType] = useState<LocationType>('bin')
  const [parent, setParent] = useState(NONE)
  const [barcode, setBarcode] = useState('')
  const [active, setActive] = useState(true)
  const [lastOpen, setLastOpen] = useState(false)

  if (open && !lastOpen) {
    setLastOpen(true)
    setName(location?.name || '')
    setType(location?.type || 'bin')
    setParent(location?.parentId || NONE)
    setBarcode(location?.barcode || '')
    setActive(location ? location.isActive : true)
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const body = { name: name.trim(), type, parentId: parent === NONE ? null : parent, barcode: barcode.trim(), isActive: active }
    try {
      if (location) await update({ id: location.id, warehouseId, body }).unwrap()
      else await create({ warehouseId, body }).unwrap()
      toast.success(location ? t('Location updated') : t('Location added'))
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not save the location')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{location ? t('Edit location') : t('Add location')}</DialogTitle>
          <DialogDescription>{t('A zone, aisle, rack, shelf or bin. Put it inside another location to build a path like A / R1 / S2.')}</DialogDescription>
        </DialogHeader>
        <form id='loc-form' onSubmit={save} className='space-y-3'>
          <div className='grid grid-cols-[1fr_140px] gap-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='loc-name'>{t('Name')}</Label>
              <Input id='loc-name' autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder='A-01' />
            </div>
            <div className='space-y-1.5'>
              <Label>{t('Type')}</Label>
              <TypeSelect value={type} onChange={setType} />
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Inside')}</Label>
            <ParentSelect value={parent} onChange={setParent} locations={locations} exclude={location?.id} />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='loc-barcode'>{t('Barcode label')}</Label>
            <Input id='loc-barcode' value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={t('Optional')} />
          </div>
          {location ? (
            <label className='flex items-center gap-2 text-sm'>
              <input type='checkbox' checked={active} onChange={(e) => setActive(e.target.checked)} />
              {t('Active')}
            </label>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button type='submit' form='loc-form' disabled={creating || updating || !name.trim()}>
            {(creating || updating) && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BulkDialog({
  warehouseId,
  open,
  onOpenChange,
  locations,
}: {
  warehouseId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  locations: WarehouseLocation[]
}) {
  const { t } = useLanguage()
  const [createBulk, { isLoading }] = useCreateLocationsBulkMutation()
  const [prefix, setPrefix] = useState('A-')
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState('10')
  const [pad, setPad] = useState('2')
  const [type, setType] = useState<LocationType>('bin')
  const [parent, setParent] = useState(NONE)

  const preview = useMemo(() => {
    const a = Number(from)
    const b = Number(to)
    if (!(b >= a)) return ''
    const fmt = (n: number) => `${prefix}${String(n).padStart(Number(pad) || 0, '0')}`
    return b - a > 2 ? `${fmt(a)}, ${fmt(a + 1)} … ${fmt(b)}` : Array.from({ length: b - a + 1 }, (_, i) => fmt(a + i)).join(', ')
  }, [prefix, from, to, pad])
  const count = Math.max(0, Number(to) - Number(from) + 1)

  const save = async () => {
    try {
      const res = await createBulk({
        warehouseId,
        body: { prefix, from: Number(from), to: Number(to), pad: Number(pad) || 0, type, parentId: parent === NONE ? null : parent },
      }).unwrap()
      toast.success(t('{{n}} locations added').replace('{{n}}', String(res.length)))
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not add the locations')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Add many locations')}</DialogTitle>
          <DialogDescription>{t('Number a whole rack in one go, e.g. A-01 to A-20.')}</DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='grid grid-cols-4 gap-2'>
            <div className='col-span-1 space-y-1.5'>
              <Label>{t('Prefix')}</Label>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            </div>
            <div className='space-y-1.5'>
              <Label>{t('From')}</Label>
              <Input type='number' min={0} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className='space-y-1.5'>
              <Label>{t('To')}</Label>
              <Input type='number' min={0} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className='space-y-1.5'>
              <Label>{t('Digits')}</Label>
              <Input type='number' min={0} max={5} value={pad} onChange={(e) => setPad(e.target.value)} />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label>{t('Type')}</Label>
              <TypeSelect value={type} onChange={setType} />
            </div>
            <div className='space-y-1.5'>
              <Label>{t('Inside')}</Label>
              <ParentSelect value={parent} onChange={setParent} locations={locations} />
            </div>
          </div>
          <p className='rounded-md bg-muted/50 p-2 text-sm'>
            <span className='text-muted-foreground'>{t('Will create')}:</span> {preview || '—'} {count > 0 ? `(${count})` : ''}
          </p>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={save} disabled={isLoading || count < 1 || count > 200}>
            {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Create')} {count > 0 ? count : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
