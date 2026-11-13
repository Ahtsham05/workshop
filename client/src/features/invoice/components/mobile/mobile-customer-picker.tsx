import { Briefcase, Check, Loader2, MapPin, Phone, Plus, Search, Truck, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { getTextClasses } from '@/utils/urdu-text-utils'
import { MobileScreen } from './mobile-screen'
import { formatCustomerAddress, initialTileColor, type ApiRecord } from './mobile-utils'

interface MobileCustomerPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  customers: ApiRecord[]
  totalMatches: number
  loading: boolean
  selectedId?: string
  walkInAllowed: boolean
  showUrdu: boolean
  onSelect: (customer: ApiRecord | 'walk-in') => void
  onCreate?: () => void
}

/** "Search: Customer" — the full-screen partner list from Odoo's phone app. */
export function MobileCustomerPicker({
  open,
  onOpenChange,
  query,
  onQueryChange,
  customers,
  totalMatches,
  loading,
  selectedId,
  walkInAllowed,
  showUrdu,
  onSelect,
  onCreate,
}: MobileCustomerPickerProps) {
  const { t } = useLanguage()

  return (
    <MobileScreen
      open={open}
      onOpenChange={onOpenChange}
      title={t('Search: Customer') || 'Search: Customer'}
      headerRight={
        query ? (
          <Button type='button' variant='ghost' size='sm' className='h-9 text-sm text-primary' onClick={() => onQueryChange('')}>
            {t('Clear')}
          </Button>
        ) : null
      }
      subHeader={
        <div className='px-3 py-2.5'>
          <div className='relative'>
            <Search className='pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              type='search'
              enterKeyHint='search'
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t('search_customers_by_name_or_phone') || 'Search name or phone…'}
              className='h-11 rounded-xl bg-muted/50 pl-9 text-[15px]'
            />
          </div>
        </div>
      }
      footer={
        <div className='grid grid-cols-2 gap-2'>
          {onCreate ? (
            <Button type='button' className='h-11 gap-1.5 text-[15px]' onClick={onCreate}>
              <Plus className='h-4 w-4' />
              {t('New')}
            </Button>
          ) : (
            <span />
          )}
          <Button type='button' variant='secondary' className='h-11 gap-1.5 text-[15px]' onClick={() => onOpenChange(false)}>
            <X className='h-4 w-4' />
            {t('Close')}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className='flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground'>
          <Loader2 className='h-6 w-6 animate-spin' />
          {t('Loading customers...')}
        </div>
      ) : (
        <ul className='divide-y'>
          {walkInAllowed && !query.trim() && (
            <li>
              <button
                type='button'
                onClick={() => onSelect('walk-in')}
                className='flex w-full items-center gap-3 px-3 py-3 text-left active:bg-muted'
              >
                <span className='flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-500 text-white'>
                  <User className='h-6 w-6' />
                </span>
                <span className='min-w-0 flex-1 text-[15px] font-semibold'>{t('walk_in_customer')}</span>
                {selectedId === 'walk-in' && <Check className='h-5 w-5 shrink-0 text-primary' />}
              </button>
            </li>
          )}
          {customers.map((customer) => {
            const id = String(customer._id || customer.id)
            const name = String(customer.name || '')
            const address = formatCustomerAddress(customer)
            const city = customer.billingAddress?.city || customer.city
            const urdu = showUrdu ? customer.nameUrdu?.trim() : ''
            const photo = customer.picture?.url?.trim()
            const selected = selectedId === id
            return (
              <li key={id}>
                <button
                  type='button'
                  onClick={() => onSelect(customer)}
                  className={cn('flex w-full items-start gap-3 px-3 py-3 text-left active:bg-muted', selected && 'bg-primary/5')}
                >
                  {photo ? (
                    <img src={photo} alt='' className='h-14 w-14 shrink-0 rounded-md object-cover' />
                  ) : (
                    <span
                      className={cn(
                        'flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-2xl font-medium text-white',
                        initialTileColor(name),
                      )}
                      aria-hidden
                    >
                      {name.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                  )}
                  <span className='min-w-0 flex-1'>
                    <span className='flex items-start gap-2'>
                      <span className={getTextClasses(name, 'min-w-0 flex-1 text-[15px] leading-snug font-semibold break-words')}>
                        {name}
                        {address ? <span className='font-normal text-foreground/80'> {address}</span> : null}
                      </span>
                      {selected && <Check className='mt-0.5 h-5 w-5 shrink-0 text-primary' />}
                    </span>
                    {urdu ? (
                      <span dir='auto' className='mt-0.5 block truncate text-sm text-muted-foreground'>
                        {urdu}
                      </span>
                    ) : null}
                    <span className='mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground'>
                      {customer.phone ? (
                        <span className='inline-flex items-center gap-1'>
                          <Phone className='h-3.5 w-3.5' />
                          {customer.phone}
                        </span>
                      ) : null}
                      {city ? (
                        <span className='inline-flex items-center gap-1'>
                          <MapPin className='h-3.5 w-3.5' />
                          {city}
                        </span>
                      ) : null}
                    </span>
                    {(customer.isEmployeeAccount || customer.isSupplierAccount) && (
                      <span className='mt-1.5 flex flex-wrap gap-1.5'>
                        {customer.isEmployeeAccount ? (
                          <span className='inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'>
                            <Briefcase className='h-3 w-3' />
                            {t('Employee')}
                          </span>
                        ) : null}
                        {customer.isSupplierAccount ? (
                          <span className='inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'>
                            <Truck className='h-3 w-3' />
                            {t('Supplier')}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
          {customers.length === 0 && (
            <li className='px-6 py-14 text-center'>
              <p className='text-sm font-medium'>{t('no_customers_found')}</p>
              {onCreate && query.trim() ? (
                <Button type='button' variant='link' className='mt-1' onClick={onCreate}>
                  <Plus className='mr-1 h-4 w-4' />
                  {t('add_customer')} “{query.trim()}”
                </Button>
              ) : null}
            </li>
          )}
        </ul>
      )}
      {totalMatches > customers.length && (
        <p className='px-4 py-3 text-center text-xs text-muted-foreground'>
          {t('Showing {{shown}} of {{total}} — keep typing to narrow', { shown: customers.length, total: totalMatches })}
        </p>
      )}
    </MobileScreen>
  )
}
