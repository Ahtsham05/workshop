import { useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useBulkUpdateProductionOrdersMutation,
  useGetOperatorsQuery,
  type OrderType,
  type ProductionPriority,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PRIORITIES, PRIORITY_META, statusLabel } from '../lib/constants'

const KEEP = '__keep__'
const CLEAR = '__clear__'
const STATUSES = ['planned', 'released', 'paused', 'cancelled'] as const

type Result = {
  updated: { id: string; orderNumber: string }[]
  failed: { id: string; orderNumber: string; message: string }[]
}

/**
 * One change applied to many orders. Each order still goes through its own rules (a
 * completed order refuses edits, a draft can't be paused), so the result lists exactly
 * which orders changed and why any were refused.
 */
export function BulkUpdateDialog({
  orderIds,
  orderType,
  onClose,
  onDone,
}: {
  orderIds: string[]
  orderType: OrderType
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useLanguage()
  // The page clears its selection once this succeeds; keep the set this dialog was opened for.
  const [ids] = useState(orderIds)
  const { data: operators } = useGetOperatorsQuery()
  const [update, { isLoading }] = useBulkUpdateProductionOrdersMutation()
  const [priority, setPriority] = useState(KEEP)
  const [operator, setOperator] = useState(KEEP)
  const [status, setStatus] = useState(KEEP)
  const [start, setStart] = useState('')
  const [due, setDue] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const nothing =
    priority === KEEP && operator === KEEP && status === KEEP && !start && !due

  const submit = async () => {
    try {
      const res = await update({
        orderIds: ids,
        ...(priority !== KEEP
          ? { priority: priority as ProductionPriority }
          : {}),
        ...(operator !== KEEP
          ? { operatorId: operator === CLEAR ? null : operator }
          : {}),
        ...(status !== KEEP
          ? { status: status as (typeof STATUSES)[number] }
          : {}),
        ...(start ? { plannedStartDate: start } : {}),
        ...(due ? { plannedCompletionDate: due } : {}),
      }).unwrap()
      setResult(res)
      if (!res.failed.length) {
        toast.success(
          t('{{n}} order(s) updated').replace(
            '{{n}}',
            String(res.updated.length)
          )
        )
        onDone()
        onClose()
      } else {
        onDone()
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t('Bulk update failed')))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {t('Update {{n}} order(s)').replace(
              '{{n}}',
              String(ids.length)
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Only the fields you change are applied. Each order follows its normal rules, so some may be refused.'
            )}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className='space-y-3 text-sm'>
            <p className='flex items-center gap-2'>
              <CheckCircle2 className='h-4 w-4 text-emerald-600 dark:text-emerald-400' />
              {t('{{n}} updated').replace(
                '{{n}}',
                String(result.updated.length)
              )}
            </p>
            <div className='space-y-1.5'>
              <p className='flex items-center gap-2 font-medium'>
                <AlertTriangle className='h-4 w-4 text-amber-600 dark:text-amber-400' />
                {t('{{n}} not changed').replace(
                  '{{n}}',
                  String(result.failed.length)
                )}
              </p>
              <ul className='max-h-56 divide-y overflow-auto rounded-md border'>
                {result.failed.map((f) => (
                  <li key={f.id} className='px-3 py-2'>
                    <span className='font-mono text-xs'>{f.orderNumber}</span>
                    <p className='text-muted-foreground text-xs'>{f.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='bulk-status'>{t('Status')}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id='bulk-status'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>{t("Don't change")}</SelectItem>
                  {STATUSES.filter(
                    (s) => !(orderType === 'assembly' && s === 'planned')
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(statusLabel(s, orderType))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='bulk-priority'>{t('Priority')}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id='bulk-priority'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>{t("Don't change")}</SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(PRIORITY_META[p].label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='bulk-operator'>{t('Operator')}</Label>
              <Select value={operator} onValueChange={setOperator}>
                <SelectTrigger id='bulk-operator'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>{t("Don't change")}</SelectItem>
                  <SelectItem value={CLEAR}>{t('Unassigned')}</SelectItem>
                  {(operators || []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div />
            <div className='grid gap-1.5'>
              <Label htmlFor='bulk-start'>{t('Production date')}</Label>
              <Input
                id='bulk-start'
                type='date'
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='bulk-due'>{t('Due date')}</Label>
              <Input
                id='bulk-due'
                type='date'
                value={due}
                min={start || undefined}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>{t('Done')}</Button>
          ) : (
            <>
              <Button variant='outline' onClick={onClose}>
                {t('Cancel')}
              </Button>
              <Button onClick={submit} disabled={nothing || isLoading}>
                {isLoading
                  ? t('Updating…')
                  : t('Apply to {{n}} order(s)').replace(
                      '{{n}}',
                      String(ids.length)
                    )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
