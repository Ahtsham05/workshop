import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

type MenuProduct = {
  id: string
  name: string
  price: number
  description?: string
  image?: { url?: string }
}

type MenuPayload = {
  venue: { name?: string; logo?: { url?: string }; branchName?: string }
  table: { id: string; label: string; floorName?: string }
  products: MenuProduct[]
}

export const Route = createFileRoute('/order/$qrToken')({
  component: GuestOrderPage,
})

function GuestOrderPage() {
  const { qrToken } = Route.useParams()
  const [menu, setMenu] = useState<MenuPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<{ product: MenuProduct; qty: number }[]>([])
  const [name, setName] = useState('')
  const [guests, setGuests] = useState(2)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${baseUrl}/public/restaurant/${qrToken}/menu`)
        if (!res.ok) throw new Error('bad')
        const data = await res.json()
        if (!cancelled) setMenu(data)
      } catch {
        if (!cancelled) toast.error('Table link expired or invalid.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [qrToken])

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.qty * l.product.price, 0),
    [cart],
  )

  const add = (p: MenuProduct) => {
    setCart((c) => {
      const i = c.findIndex((x) => x.product.id === p.id)
      if (i >= 0) {
        const n = [...c]
        n[i] = { ...n[i], qty: n[i].qty + 1 }
        return n
      }
      return [...c, { product: p, qty: 1 }]
    })
  }

  const submit = async () => {
    if (!cart.length) {
      toast.error('Choose at least one item')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`${baseUrl}/public/restaurant/${qrToken}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: cart.map((l) => ({
            productId: l.product.id,
            quantity: l.qty,
          })),
          customerName: name || undefined,
          guestCount: guests,
        }),
      })
      if (!res.ok) throw new Error('fail')
      const order = await res.json()
      toast.success(`Order ${order.orderNumber || ''} sent to the kitchen`)
      setCart([])
    } catch {
      toast.error('Could not submit — try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background'>
        <p className='text-muted-foreground'>Loading menu…</p>
      </div>
    )
  }

  if (!menu) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background px-4'>
        <Card className='w-full max-w-md'>
          <CardHeader>
            <CardTitle>Link unavailable</CardTitle>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            Ask your server for a fresh QR code — this table token may have been rotated.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-gradient-to-b from-background to-muted/40'>
      <header className='border-b bg-card/80 backdrop-blur px-4 py-6'>
        <div className='mx-auto max-w-lg text-center space-y-1'>
          {menu.venue.logo?.url ? (
            <img
              src={menu.venue.logo.url}
              alt=''
              className='mx-auto h-14 w-14 rounded-full object-cover'
            />
          ) : null}
          <h1 className='text-2xl font-semibold tracking-tight'>{menu.venue.name}</h1>
          {menu.venue.branchName ? (
            <p className='text-sm text-muted-foreground'>{menu.venue.branchName}</p>
          ) : null}
          <p className='text-sm'>
            Table <strong>{menu.table.label}</strong>
            {menu.table.floorName ? (
              <>
                {' '}
                · {menu.table.floorName}
              </>
            ) : null}
          </p>
        </div>
      </header>

      <main className='mx-auto max-w-lg space-y-6 px-4 py-6'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>Your details</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-3'>
            <Input
              placeholder='Name (optional)'
              value={name}
              onChange={(e) => setName(e.target.value)}
              className='min-w-[140px] flex-1'
            />
            <Input
              type='number'
              min={1}
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              className='w-24'
            />
          </CardContent>
        </Card>

        <div>
          <h2 className='mb-3 text-lg font-medium'>Menu</h2>
          <ScrollArea className='h-[56vh]'>
            <div className='grid gap-2 pr-3'>
              {menu.products.map((p) => (
                <button
                  key={p.id}
                  type='button'
                  onClick={() => add(p)}
                  className='flex gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent'
                >
                  {p.image?.url ? (
                    <img src={p.image.url} alt='' className='h-16 w-16 rounded-md object-cover' />
                  ) : (
                    <div className='h-16 w-16 rounded-md bg-muted' />
                  )}
                  <div className='flex-1 min-w-0'>
                    <div className='font-medium leading-snug'>{p.name}</div>
                    {p.description ? (
                      <div className='text-xs text-muted-foreground line-clamp-2'>{p.description}</div>
                    ) : null}
                    <div className='text-sm font-semibold mt-1'>
                      {p.price.toLocaleString(undefined, {
                        style: 'currency',
                        currency: 'PKR',
                      })}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <Card className='sticky bottom-4 border-primary/30 shadow-lg'>
          <CardContent className='space-y-3 pt-6'>
            <div className='space-y-1 text-sm'>
              {cart.map((l) => (
                <div key={l.product.id} className='flex justify-between gap-2'>
                  <span>
                    {l.qty}× {l.product.name}
                  </span>
                  <span>
                    {(l.qty * l.product.price).toLocaleString(undefined, {
                      style: 'currency',
                      currency: 'PKR',
                    })}
                  </span>
                </div>
              ))}
            </div>
            <div className='flex justify-between border-t pt-3 font-semibold'>
              <span>Total</span>
              <span>
                {total.toLocaleString(undefined, {
                  style: 'currency',
                  currency: 'PKR',
                })}
              </span>
            </div>
            <Button className='w-full' size='lg' disabled={submitting} onClick={submit}>
              Send order to kitchen
            </Button>
            <p className='text-center text-[11px] text-muted-foreground'>
              Orders route straight to the kitchen display — pay with your server when you are finished.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
