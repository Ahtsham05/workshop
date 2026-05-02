import { useState } from 'react'
import { RestaurantShell } from '@/features/restaurant/shell'
import {
  useGetReservationsQuery,
  useCreateReservationMutation,
  useUpdateReservationMutation,
} from '@/stores/restaurant.api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

export default function RestaurantReservationsPage() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 14)

  const { data: rows = [], refetch } = useGetReservationsQuery({
    from: from.toISOString(),
    to: to.toISOString(),
  })
  const [createRes, { isLoading }] = useCreateReservationMutation()
  const [patchRes] = useUpdateReservationMutation()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [party, setParty] = useState(2)
  const [when, setWhen] = useState(() => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
    return d.toISOString().slice(0, 16)
  })

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Guest name required')
      return
    }
    try {
      await createRes({
        customerName: name.trim(),
        phone: phone || undefined,
        partySize: party,
        startAt: new Date(when).toISOString(),
      }).unwrap()
      setName('')
      setPhone('')
      refetch()
      toast.success('Reservation saved')
    } catch {
      toast.error('Could not save')
    }
  }

  return (
    <RestaurantShell
      title='Reservations'
      description='Hold tables for VIP covers — confirm or seat parties when they arrive.'
    >
      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>New booking</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <Input placeholder='Guest name' value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder='Phone' value={phone} onChange={(e) => setPhone(e.target.value)} />
            <div className='flex gap-2'>
              <Input
                type='number'
                min={1}
                value={party}
                onChange={(e) => setParty(Number(e.target.value))}
                className='w-24'
              />
              <Input
                type='datetime-local'
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className='flex-1'
              />
            </div>
            <Button onClick={submit} disabled={isLoading}>
              Confirm reservation
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Upcoming</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {rows.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No reservations in this window.</p>
            ) : (
              <ul className='space-y-2 text-sm'>
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className='flex flex-col gap-2 rounded-md border px-3 py-2 md:flex-row md:items-center md:justify-between'
                  >
                    <div>
                      <div className='font-medium'>{r.customerName}</div>
                      <div className='text-xs text-muted-foreground'>
                        {new Date(r.startAt).toLocaleString()} · party {r.partySize}
                      </div>
                      {r.phone ? (
                        <div className='text-xs text-muted-foreground'>{r.phone}</div>
                      ) : null}
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant='outline'>{r.status}</Badge>
                      {r.status === 'pending' ? (
                        <Button
                          size='sm'
                          variant='secondary'
                          onClick={async () => {
                            try {
                              await patchRes({
                                reservationId: r.id,
                                body: { status: 'confirmed' },
                              }).unwrap()
                              refetch()
                            } catch {
                              toast.error('Update failed')
                            }
                          }}
                        >
                          Confirm
                        </Button>
                      ) : null}
                      {['pending', 'confirmed'].includes(r.status) ? (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={async () => {
                            try {
                              await patchRes({
                                reservationId: r.id,
                                body: { status: 'seated' },
                              }).unwrap()
                              refetch()
                            } catch {
                              toast.error('Update failed')
                            }
                          }}
                        >
                          Seat
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </RestaurantShell>
  )
}
