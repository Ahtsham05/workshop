import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { useAddCountLinesMutation } from '@/stores/stockCount.api'
import { apiError } from '../lib/labels'
import { filterAndRankBySearch } from '@/utils/urdu-text-utils'

/** Same identity the server uses (stockCount.service.js#itemKey); serialized products are counted per product. */
const itemKey = (item: PurchaseCatalogItem) =>
  item.trackImei || item.trackSerial || !item.variantId ? `p:${item.productId}` : `v:${item.variantId}`

interface AddItemDialogProps {
  countId: string
  open: boolean
  initialSearch?: string
  existingKeys: Set<string>
  onOpenChange: (open: boolean) => void
}

/** Something on the shelf that isn't on the sheet: put it on the count. */
export function AddItemDialog({ countId, open, initialSearch = '', existingKeys, onOpenChange }: AddItemDialogProps) {
  const { t } = useLanguage()
  const { data: catalog = [], isLoading } = useGetPurchasableCatalogQuery(undefined, { skip: !open })
  const [addLines, { isLoading: adding }] = useAddCountLinesMutation()
  const [search, setSearch] = useState(initialSearch)

  useEffect(() => {
    if (open) setSearch(initialSearch)
  }, [open, initialSearch])

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    const exact = catalog.filter((item) => item.barcode && item.barcode.toLowerCase() === q)
    const rest = filterAndRankBySearch(
      catalog.filter((item) => !exact.includes(item)),
      q,
      (item) => [item.name, item.barcode],
    )
    return [...exact, ...rest].slice(0, 30)
  }, [catalog, search])

  const add = async (item: PurchaseCatalogItem) => {
    try {
      await addLines({ id: countId, itemKeys: [itemKey(item)] }).unwrap()
      toast.success(t('{{name}} added to the count').replace('{{name}}', item.name))
      onOpenChange(false)
    } catch (err) {
      toast.error(apiError(err, t('Could not add the item')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader className='text-left'>
          <DialogTitle>{t('Add an item to this count')}</DialogTitle>
          <DialogDescription>{t('For something found on the shelf that isn’t on the list.')}</DialogDescription>
        </DialogHeader>
        <div className='relative'>
          <Search className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Name or barcode…')} className='pl-8' />
        </div>
        <div className='space-y-1'>
          {isLoading && <Loader2 className='mx-auto size-5 animate-spin text-muted-foreground' />}
          {results.map((item) => {
            const onCount = existingKeys.has(itemKey(item))
            return (
              <div key={`${item.productId}-${item.variantId ?? ''}`} className='flex items-center justify-between gap-2 rounded-md border px-2 py-1.5'>
                <div className='min-w-0'>
                  <div className='truncate text-sm font-medium'>{item.name}</div>
                  <div className='truncate text-xs text-muted-foreground'>{[item.barcode, item.unit].filter(Boolean).join(' · ')}</div>
                </div>
                <Button size='sm' variant='outline' disabled={onCount || adding} onClick={() => add(item)}>
                  {onCount ? t('On the count') : (
                    <>
                      <Plus className='mr-1 size-3.5' />
                      {t('Add')}
                    </>
                  )}
                </Button>
              </div>
            )
          })}
          {!isLoading && search.trim() && results.length === 0 && (
            <p className='py-4 text-center text-sm text-muted-foreground'>{t('No product matches in this branch')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
