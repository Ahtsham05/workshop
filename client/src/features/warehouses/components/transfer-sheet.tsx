import { useState } from 'react'
import { ArrowRight, CheckCircle2, Loader2, Pencil, Printer, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { getErrorMessage } from '@/lib/get-error-message'
import {
  useCancelTransferMutation,
  useDeleteTransferMutation,
  useGetTransferQuery,
  useValidateTransferMutation,
  type WarehouseTransfer,
} from '@/stores/warehouse.api'
import { TRANSFER_STATUS_META, WAREHOUSE_PERMS, fmtDate, fmtDateTime, fmtQty } from '../lib/labels'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** Printable transfer slip: what to pick, from where, to where, with sign-off lines. */
export function printTransfer(tr: WarehouseTransfer, t: (k: string) => string) {
  const place = (wh: { name: string; code?: string } | null | undefined, loc?: { path: string } | null) =>
    `${esc(wh?.code || '')} — ${esc(wh?.name || '')}${loc?.path ? ` / ${esc(loc.path)}` : ''}`
  const rows = tr.lines
    .map((l, i) => {
      const fromLoc = typeof l.fromLocationId === 'object' && l.fromLocationId ? l.fromLocationId.path : tr.fromLocationId?.path || ''
      const toLoc = typeof l.toLocationId === 'object' && l.toLocationId ? l.toLocationId.path : tr.toLocationId?.path || ''
      return `<tr><td>${i + 1}</td><td>${esc(l.productName)}<div class="sub">${esc(l.sku || '')}</div></td><td>${esc(fromLoc || '—')}</td><td>${esc(toLoc || '—')}</td><td class="num">${esc(fmtQty(l.quantity))} ${esc(l.unit || '')}</td><td class="chk"></td></tr>`
    })
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(tr.number)}</title><style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:24px;font-size:13px}
    h1{font-size:20px;margin:0}.muted{color:#666}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
    .box{border:1px solid #ccc;border-radius:6px;padding:10px}.lbl{font-size:11px;text-transform:uppercase;color:#666;letter-spacing:.04em}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f3f3f3;font-size:11px;text-transform:uppercase}.num{text-align:right;white-space:nowrap}.chk{width:40px}.sub{font-size:11px;color:#666}
    .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:48px}.sign div{border-top:1px solid #333;padding-top:4px;text-align:center;font-size:12px}
  </style></head><body>
  <h1>${esc(t('Internal Transfer'))} ${esc(tr.number)}</h1>
  <div class="muted">${esc(t('Status'))}: ${esc(t(TRANSFER_STATUS_META[tr.status].label))} · ${esc(t('Date'))}: ${esc(fmtDate(tr.date))}${tr.reference ? ` · ${esc(t('Reference'))}: ${esc(tr.reference)}` : ''}</div>
  <div class="grid"><div class="box"><div class="lbl">${esc(t('From'))}</div>${place(tr.fromWarehouseId, tr.fromLocationId)}</div>
  <div class="box"><div class="lbl">${esc(t('To'))}</div>${place(tr.toWarehouseId, tr.toLocationId)}</div></div>
  <table><thead><tr><th>#</th><th>${esc(t('Product'))}</th><th>${esc(t('From bin'))}</th><th>${esc(t('To bin'))}</th><th class="num">${esc(t('Quantity'))}</th><th>✓</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><th colspan="4" class="num">${esc(t('Total'))}</th><th class="num">${esc(fmtQty(tr.totalQuantity))}</th><th></th></tr></tfoot></table>
  ${tr.notes ? `<p><b>${esc(t('Notes'))}:</b> ${esc(tr.notes)}</p>` : ''}
  <div class="sign"><div>${esc(t('Prepared by'))}</div><div>${esc(t('Issued by'))}</div><div>${esc(t('Received by'))}</div></div>
  <script>window.onload=()=>{window.print()}</script></body></html>`
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    toast.error(t('Allow pop-ups to print'))
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}

interface Props {
  transferId: string | null
  onOpenChange: (open: boolean) => void
  onEdit: (t: WarehouseTransfer) => void
}

export function TransferSheet({ transferId, onOpenChange, onEdit }: Props) {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canTransfer = hasAnyPermission(...WAREHOUSE_PERMS.transfer)
  const { data: tr, isFetching } = useGetTransferQuery(transferId || '', { skip: !transferId })
  const [validate, { isLoading: validating }] = useValidateTransferMutation()
  const [cancel, { isLoading: cancelling }] = useCancelTransferMutation()
  const [remove, { isLoading: removing }] = useDeleteTransferMutation()
  const [confirm, setConfirm] = useState<null | 'cancel' | 'delete'>(null)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Something went wrong')))
    }
  }

  const status = tr ? TRANSFER_STATUS_META[tr.status] : null

  return (
    <Sheet open={Boolean(transferId)} onOpenChange={onOpenChange}>
      <SheetContent className='flex w-full flex-col gap-0 p-0 sm:max-w-xl'>
        <SheetHeader className='shrink-0 border-b p-4'>
          <SheetTitle className='flex items-center gap-2'>
            {tr?.number || t('Transfer')}
            {status ? (
              <Badge variant='outline' className={status.className}>
                {t(status.label)}
              </Badge>
            ) : null}
          </SheetTitle>
          <SheetDescription>{t('Internal transfer inside this branch')}</SheetDescription>
        </SheetHeader>

        {!tr ? (
          <div className='flex flex-1 items-center justify-center'>{isFetching ? <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' /> : null}</div>
        ) : (
          <>
            <div className='min-h-0 flex-1 space-y-4 overflow-y-auto p-4'>
              <div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2'>
                <PlaceCard label={t('From')} name={tr.fromWarehouseId?.name} code={tr.fromWarehouseId?.code} bin={tr.fromLocationId?.path} />
                <ArrowRight className='h-4 w-4 text-muted-foreground' />
                <PlaceCard label={t('To')} name={tr.toWarehouseId?.name} code={tr.toWarehouseId?.code} bin={tr.toLocationId?.path} />
              </div>

              <dl className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
                <Info label={t('Date')} value={fmtDate(tr.date)} />
                <Info label={t('Reference')} value={tr.reference || '—'} />
                <Info label={t('Created by')} value={`${tr.createdBy?.name || '—'} · ${fmtDateTime(tr.createdAt)}`} />
                {tr.doneAt ? <Info label={t('Posted by')} value={`${tr.doneBy?.name || '—'} · ${fmtDateTime(tr.doneAt)}`} /> : null}
                {tr.cancelledAt ? <Info label={t('Cancelled by')} value={`${tr.cancelledBy?.name || '—'} · ${fmtDateTime(tr.cancelledAt)}`} /> : null}
              </dl>
              {tr.notes ? <p className='rounded-md bg-muted/50 p-3 text-sm'>{tr.notes}</p> : null}

              <div className='overflow-hidden rounded-lg border'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted/50 text-xs text-muted-foreground'>
                    <tr>
                      <th className='px-3 py-2 text-left font-medium'>{t('Product')}</th>
                      <th className='px-3 py-2 text-right font-medium'>{t('Quantity')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tr.lines.map((l, i) => (
                      <tr key={l.id || i} className='border-t'>
                        <td className='px-3 py-2'>
                          <p className='font-medium'>{l.productName}</p>
                          {l.sku ? <p className='text-xs text-muted-foreground'>{l.sku}</p> : null}
                        </td>
                        <td className='px-3 py-2 text-right tabular-nums'>
                          {fmtQty(l.quantity)} {l.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className='border-t bg-muted/30 font-medium'>
                    <tr>
                      <td className='px-3 py-2'>{t('Total')}</td>
                      <td className='px-3 py-2 text-right tabular-nums'>{fmtQty(tr.totalQuantity)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className='flex shrink-0 flex-wrap justify-end gap-2 border-t p-4'>
              <Button variant='outline' onClick={() => printTransfer(tr, t)}>
                <Printer className='mr-2 h-4 w-4' />
                {t('Print')}
              </Button>
              {canTransfer && tr.status === 'draft' ? (
                <>
                  <Button variant='outline' className='text-destructive' disabled={removing} onClick={() => setConfirm('delete')}>
                    <Trash2 className='mr-2 h-4 w-4' />
                    {t('Delete')}
                  </Button>
                  <Button variant='outline' onClick={() => onEdit(tr)}>
                    <Pencil className='mr-2 h-4 w-4' />
                    {t('Edit')}
                  </Button>
                  <Button disabled={validating} onClick={() => run(() => validate(tr.id).unwrap(), t('Stock moved'))}>
                    {validating ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <CheckCircle2 className='mr-2 h-4 w-4' />}
                    {t('Post transfer')}
                  </Button>
                </>
              ) : null}
              {canTransfer && tr.status === 'done' ? (
                <Button variant='outline' className='text-destructive' disabled={cancelling} onClick={() => setConfirm('cancel')}>
                  <XCircle className='mr-2 h-4 w-4' />
                  {t('Cancel transfer')}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'delete' ? t('Delete this draft?') : t('Cancel this transfer?')}
        desc={
          confirm === 'delete'
            ? t('The draft is removed. No stock has moved yet.')
            : t('The stock goes back to where it came from. The transfer stays in the list as cancelled.')
        }
        destructive
        confirmText={confirm === 'delete' ? t('Delete') : t('Cancel transfer')}
        handleConfirm={async () => {
          if (!tr) return
          if (confirm === 'delete') {
            await run(() => remove(tr.id).unwrap(), t('Draft deleted'))
            onOpenChange(false)
          } else {
            await run(() => cancel(tr.id).unwrap(), t('Transfer cancelled — stock returned'))
          }
          setConfirm(null)
        }}
      />
    </Sheet>
  )
}

function PlaceCard({ label, name, code, bin }: { label: string; name?: string; code?: string; bin?: string }) {
  return (
    <div className='rounded-lg border p-3'>
      <p className='text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'>{label}</p>
      <p className='truncate font-medium'>{name || '—'}</p>
      <p className='truncate text-xs text-muted-foreground'>
        <span className='font-mono'>{code}</span>
        {bin ? ` · ${bin}` : ''}
      </p>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='truncate'>{value}</dd>
    </div>
  )
}
