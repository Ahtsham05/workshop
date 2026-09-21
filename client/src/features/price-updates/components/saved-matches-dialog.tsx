import { toast } from 'sonner'
import { BookmarkCheck, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useDeleteSavedMatchMutation, useGetSavedMatchesQuery } from '@/stores/priceUpdate.api'

export function SavedMatchesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useLanguage()
  const { data, isLoading } = useGetSavedMatchesQuery(undefined, { skip: !open })
  const [remove, { isLoading: removing }] = useDeleteSavedMatchMutation()
  const matches = data?.results || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Header / scrolling body / footer as a flex column, with the `sm:` width pair (see dialog.tsx). */}
      <DialogContent className='flex max-h-[85vh] max-w-2xl flex-col sm:max-w-2xl'>
        <DialogHeader className='shrink-0'>
          <DialogTitle className='flex items-center gap-2'>
            <BookmarkCheck className='h-5 w-5 text-emerald-600' /> {t('Saved matches')}
          </DialogTitle>
          <DialogDescription>
            {t('Names from supplier lists that you’ve linked to a product. They match automatically next time. Delete one if it was wrong.')}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className='min-h-0 flex-1'>
          {isLoading ? (
            <div className='space-y-2 p-1'>
              <Skeleton className='h-12 w-full' />
              <Skeleton className='h-12 w-full' />
            </div>
          ) : matches.length === 0 ? (
            <p className='px-2 py-10 text-center text-sm text-muted-foreground'>
              {t('Nothing saved yet. When you confirm or pick a product for a line in a list, it appears here.')}
            </p>
          ) : (
            <ul className='divide-y'>
              {matches.map((m) => (
                <li key={m.id} className='flex items-center justify-between gap-3 py-2.5'>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>“{m.aliasText}”</p>
                    <p className='truncate text-xs text-muted-foreground'>
                      → {m.productName} · {t('used')} {m.hits} {t(m.hits === 1 ? 'time' : 'times')}
                    </p>
                  </div>
                  <Can permission='managePriceUpdates'>
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label={`${t('Delete saved match')} ${m.aliasText}`}
                      disabled={removing}
                      onClick={async () => {
                        try {
                          await remove(m.id).unwrap()
                        } catch (err) {
                          toast.error(getErrorMessage(err, t('Could not delete')))
                        }
                      }}
                    >
                      <Trash2 className='h-4 w-4 text-muted-foreground' />
                    </Button>
                  </Can>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
