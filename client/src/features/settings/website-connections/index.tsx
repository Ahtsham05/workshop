import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Eye, Globe, ImageOff, KeyRound, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import ContentSection from '../components/content-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import {
  useCreateWebsiteConnectionMutation,
  useDeleteWebsiteConnectionMutation,
  useGetWebsiteConnectionsQuery,
  usePreviewWebsiteConnectionQuery,
  useRotateWebsiteKeyMutation,
  useUpdateWebsiteConnectionMutation,
  type WebsiteConnection,
  type WebsiteConnectionInput,
} from '@/stores/websiteConnection.api'
import { formatAppDateTime } from '@/lib/date-format'

const API_BASE = (import.meta.env.VITE_BACKEND_URL || `${window.location.origin}/v1`).replace(/\/+$/, '')

// --- key shown once ------------------------------------------------------------------------

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      className='shrink-0 gap-1.5'
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
      {label}
    </Button>
  )
}

const examples = (key: string) => ({
  curl: `curl -H "X-Api-Key: ${key}" \\\n  "${API_BASE}/storefront/products?page=1&limit=50"`,
  javascript: `// Run on your website's server — keep the key out of browser code.
const res = await fetch('${API_BASE}/storefront/stock?codes=SKU-1,SKU-2', {
  headers: { 'X-Api-Key': process.env.LOGIX_API_KEY },
})
const { results } = await res.json() // [{ id, sku, available, inStock }]

// Product cards with the same photos as in the app:
const list = await (await fetch('${API_BASE}/storefront/products?limit=50', {
  headers: { 'X-Api-Key': process.env.LOGIX_API_KEY },
})).json()
const html = list.results.map((p) =>
  \`<img src="\${p.image}" alt="\${p.name}"> <h3>\${p.name}</h3> <b>\${p.price}</b>\`)`,
  php: `$ch = curl_init('${API_BASE}/storefront/products?page=1&limit=50');
curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Api-Key: ' . getenv('LOGIX_API_KEY')]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$data = json_decode(curl_exec($ch), true);`,
})

function KeyRevealDialog({ apiKey, onClose }: { apiKey: string | null; onClose: () => void }) {
  const { t } = useLanguage()
  const code = apiKey ? examples(apiKey) : null
  return (
    <Dialog open={!!apiKey} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-w-2xl sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <KeyRound className='size-4' /> {t('Your website API key')}
          </DialogTitle>
          <DialogDescription>
            {t('Copy it now — for your security it is never shown again. If it is lost, rotate the key to get a new one.')}
          </DialogDescription>
        </DialogHeader>
        {apiKey && code && (
          <div className='min-w-0 space-y-4'>
            <div className='flex items-center gap-2'>
              <code className='bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-xs' data-testid='api-key'>
                {apiKey}
              </code>
              <CopyButton value={apiKey} label={t('Copy')} />
            </div>
            <div className='space-y-2'>
              <p className='text-sm font-medium'>{t('Connect your website')}</p>
              <Tabs defaultValue='curl'>
                <TabsList>
                  <TabsTrigger value='curl'>cURL</TabsTrigger>
                  <TabsTrigger value='javascript'>JavaScript</TabsTrigger>
                  <TabsTrigger value='php'>PHP</TabsTrigger>
                </TabsList>
                {(Object.keys(code) as (keyof typeof code)[]).map((lang) => (
                  <TabsContent key={lang} value={lang} className='relative'>
                    <pre className='bg-muted max-h-48 overflow-auto rounded-md p-3 pr-20 text-xs'>{code[lang]}</pre>
                    <div className='absolute top-2 right-2'>
                      <CopyButton value={code[lang]} label={t('Copy')} />
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
              <ul className='text-muted-foreground list-disc space-y-1 pl-5 text-xs'>
                <li>{t('GET /storefront/products — your catalog with price and available stock (paged, ?search, ?inStock=true).')}</li>
                <li>{t('Every product carries its photos: image (the main one) and images (the whole gallery) — the same pictures as in the app, ready to put on the website.')}</li>
                <li>{t('GET /storefront/stock — availability only; call it at checkout, before taking payment.')}</li>
                <li>{t('Send back the ETag you received as If-None-Match: when nothing changed you get an empty 304.')}</li>
              </ul>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t("I've saved the key")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- create / edit ---------------------------------------------------------------------------

function ConnectionFormDialog({
  open,
  editing,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  editing: WebsiteConnection | null
  onOpenChange: (open: boolean) => void
  onCreated: (apiKey: string) => void
}) {
  const { t } = useLanguage()
  const { data: branches = [] } = useGetMyBranchesQuery()
  const [createConnection, { isLoading: creating }] = useCreateWebsiteConnectionMutation()
  const [updateConnection, { isLoading: updating }] = useUpdateWebsiteConnectionMutation()
  const [form, setForm] = useState<WebsiteConnectionInput>({ name: '', websiteUrl: '', branchIds: [], safetyStock: 0, activeProductsOnly: true })
  const [openedFor, setOpenedFor] = useState<string | null>(null)

  // Fill the form each time the dialog opens (for a new connection: every branch ticked).
  const key = open ? (editing?.id ?? 'new') : null
  if (key !== openedFor) {
    setOpenedFor(key)
    if (open) {
      setForm(
        editing
          ? {
              name: editing.name,
              websiteUrl: editing.websiteUrl,
              branchIds: editing.branchIds.map(String),
              priceBranchId: editing.priceBranchId ? String(editing.priceBranchId) : null,
              safetyStock: editing.safetyStock,
              activeProductsOnly: editing.activeProductsOnly,
            }
          : { name: '', websiteUrl: '', branchIds: branches.map((b) => b.id), safetyStock: 0, activeProductsOnly: true }
      )
    }
  }

  const priceBranchId = form.priceBranchId && form.branchIds.includes(form.priceBranchId) ? form.priceBranchId : form.branchIds[0]
  const toggleBranch = (id: string, checked: boolean) =>
    setForm((f) => ({ ...f, branchIds: checked ? [...f.branchIds, id] : f.branchIds.filter((b) => b !== id) }))
  const canSave = form.name.trim() && form.branchIds.length > 0 && !creating && !updating

  const save = async () => {
    const body = { ...form, name: form.name.trim(), websiteUrl: form.websiteUrl?.trim() || '', priceBranchId, safetyStock: Number(form.safetyStock) || 0 }
    try {
      if (editing) {
        await updateConnection({ id: editing.id, ...body }).unwrap()
        toast.success(t('Website connection saved'))
      } else {
        const { apiKey } = await createConnection(body).unwrap()
        onCreated(apiKey)
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(getErrorMessage(error, t('Could not save the website connection')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{editing ? t('Edit website connection') : t('Connect a website')}</DialogTitle>
          <DialogDescription>{t('Your website will show these branches’ products and live stock. It can only read — never change anything.')}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='wc-name'>{t('Name')}</Label>
              <Input id='wc-name' value={form.name} placeholder={t('e.g. Online store')} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='wc-url'>{t('Website address')} <span className='text-muted-foreground'>({t('optional')})</span></Label>
              <Input id='wc-url' value={form.websiteUrl} placeholder='https://myshop.com' onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))} />
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Sell stock from')}</Label>
            <ul className='divide-y rounded-lg border'>
              {branches.map((branch) => (
                <li key={branch.id} className='flex items-center gap-3 px-3 py-2'>
                  <Checkbox
                    id={`wc-branch-${branch.id}`}
                    checked={form.branchIds.includes(branch.id)}
                    onCheckedChange={(checked) => toggleBranch(branch.id, checked === true)}
                  />
                  <Label htmlFor={`wc-branch-${branch.id}`} className='flex-1 cursor-pointer font-normal'>{branch.name}</Label>
                  {form.branchIds.includes(branch.id) && (
                    priceBranchId === branch.id ? (
                      <Badge variant='secondary' className='font-normal'>{t('Prices from here')}</Badge>
                    ) : (
                      <Button type='button' variant='link' size='sm' className='h-auto p-0 text-xs' onClick={() => setForm((f) => ({ ...f, priceBranchId: branch.id }))}>
                        {t('Use its prices')}
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
            <p className='text-muted-foreground text-xs'>{t('The same product in several branches appears once, with their stock added together.')}</p>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='wc-safety'>{t('Safety stock')}</Label>
              <Input id='wc-safety' type='number' min={0} value={form.safetyStock ?? 0} onChange={(e) => setForm((f) => ({ ...f, safetyStock: Math.max(0, Number(e.target.value) || 0) }))} />
              <p className='text-muted-foreground text-xs'>{t('Units per product kept for the shop counter, so the website never sells the last pieces.')}</p>
            </div>
            <div className='flex items-start gap-3 pt-6'>
              <Switch id='wc-active' checked={form.activeProductsOnly !== false} onCheckedChange={(v) => setForm((f) => ({ ...f, activeProductsOnly: v }))} />
              <Label htmlFor='wc-active' className='cursor-pointer font-normal leading-snug'>{t('Hide products switched off in the shop')}</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={save} disabled={!canSave}>
            {(creating || updating) && <Loader2 className='mr-2 size-4 animate-spin' />}
            {editing ? t('Save') : t('Create & get API key')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- preview ---------------------------------------------------------------------------------

function PreviewDialog({ connection, onClose }: { connection: WebsiteConnection | null; onClose: () => void }) {
  const { t } = useLanguage()
  const { data, isFetching, error } = usePreviewWebsiteConnectionQuery(connection?.id ?? '', { skip: !connection })
  return (
    <Dialog open={!!connection} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-w-2xl sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('What the website sees')}</DialogTitle>
          <DialogDescription>
            {data ? t('First {{shown}} of {{total}} products, live.', { shown: data.results.length, total: data.totalResults }) : t('Loading…')}
          </DialogDescription>
        </DialogHeader>
        {isFetching ? (
          <div className='flex justify-center py-10'><Loader2 className='size-6 animate-spin' /></div>
        ) : error ? (
          <p className='text-destructive text-sm'>{getErrorMessage(error, t('Could not load the preview'))}</p>
        ) : (
          <div className='max-h-[60vh] overflow-auto rounded-md border'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50 text-left text-xs'>
                <tr><th className='w-14 p-2'>{t('Photo')}</th><th className='p-2'>{t('Product')}</th><th className='p-2'>SKU</th><th className='p-2 text-right'>{t('Price')}</th><th className='p-2 text-right'>{t('Available')}</th></tr>
              </thead>
              <tbody>
                {data?.results.map((p) => (
                  <tr key={p.id} className='border-t'>
                    <td className='p-2'>
                      {p.image ? (
                        <a href={p.image} target='_blank' rel='noreferrer' className='relative block size-10' title={t('Open photo')}>
                          <img src={p.image} alt={p.name} loading='lazy' className='size-10 rounded-md border object-cover' />
                          {p.images.length > 1 && (
                            <span className='bg-background/90 absolute -right-1 -bottom-1 rounded-full border px-1 text-[10px] leading-4 tabular-nums'>
                              {p.images.length}
                            </span>
                          )}
                        </a>
                      ) : (
                        <div className='bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-md border' title={t('No photo')}>
                          <ImageOff className='size-4' />
                        </div>
                      )}
                    </td>
                    <td className='p-2'>{p.name}{p.hasVariants ? <span className='text-muted-foreground'> · {p.variants?.length ?? 0} {t('variants')}</span> : null}</td>
                    <td className='text-muted-foreground p-2'>{p.sku ?? p.barcode ?? '—'}</td>
                    <td className='p-2 text-right tabular-nums'>{p.price}</td>
                    <td className={`p-2 text-right tabular-nums ${p.inStock ? '' : 'text-destructive'}`}>{p.available}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- page ------------------------------------------------------------------------------------

function ConnectionCard({
  connection,
  branchNames,
  onEdit,
  onPreview,
  onRotate,
  onDelete,
}: {
  connection: WebsiteConnection
  branchNames: Map<string, string>
  onEdit: () => void
  onPreview: () => void
  onRotate: () => void
  onDelete: () => void
}) {
  const { t } = useLanguage()
  const [updateConnection] = useUpdateWebsiteConnectionMutation()
  const toggle = async (isActive: boolean) => {
    try {
      await updateConnection({ id: connection.id, isActive }).unwrap()
      toast.success(isActive ? t('Website connection turned on') : t('Website connection turned off — its key no longer works'))
    } catch (error) {
      toast.error(getErrorMessage(error, t('Could not update the connection')))
    }
  }
  return (
    <div className='space-y-3 rounded-lg border p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-3'>
          <div className='bg-primary/10 text-primary mt-0.5 rounded-full p-1.5'><Globe className='size-4' /></div>
          <div className='min-w-0'>
            <p className='truncate font-medium'>{connection.name}</p>
            {connection.websiteUrl && <p className='text-muted-foreground truncate text-xs'>{connection.websiteUrl}</p>}
          </div>
        </div>
        <Switch checked={connection.isActive} onCheckedChange={toggle} aria-label={t('Connection on')} />
      </div>
      <div className='flex flex-wrap gap-1.5'>
        {connection.branchIds.map((id) => (
          <Badge key={id} variant='outline' className='font-normal'>{branchNames.get(String(id)) ?? t('Branch')}</Badge>
        ))}
        {connection.safetyStock > 0 && <Badge variant='secondary' className='font-normal'>{t('Safety stock {{count}}', { count: connection.safetyStock })}</Badge>}
      </div>
      <p className='text-muted-foreground text-xs'>
        {t('Key')} <code className='font-mono'>{connection.keyPrefix}…</code> ·{' '}
        {connection.lastUsedAt ? t('Last used {{when}}', { when: formatAppDateTime(new Date(connection.lastUsedAt)) }) : t('Not used yet')}
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button size='sm' variant='outline' className='gap-1.5' onClick={onPreview}><Eye className='size-3.5' />{t('Preview')}</Button>
        <Button size='sm' variant='outline' className='gap-1.5' onClick={onEdit}><Pencil className='size-3.5' />{t('Edit')}</Button>
        <Button size='sm' variant='outline' className='gap-1.5' onClick={onRotate}><KeyRound className='size-3.5' />{t('New key')}</Button>
        <Button size='sm' variant='ghost' className='text-destructive gap-1.5' onClick={onDelete}><Trash2 className='size-3.5' />{t('Delete')}</Button>
      </div>
    </div>
  )
}

export default function WebsiteConnectionsSettings() {
  const { t } = useLanguage()
  const { data: connections = [], isLoading } = useGetWebsiteConnectionsQuery()
  const { data: branches = [] } = useGetMyBranchesQuery()
  const branchNames = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches])
  const [rotateKey, { isLoading: rotating }] = useRotateWebsiteKeyMutation()
  const [deleteConnection, { isLoading: deleting }] = useDeleteWebsiteConnectionMutation()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<WebsiteConnection | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<WebsiteConnection | null>(null)
  const [rotatingFor, setRotatingFor] = useState<WebsiteConnection | null>(null)
  const [deletingFor, setDeletingFor] = useState<WebsiteConnection | null>(null)

  return (
    <ContentSection
      title={t('Website Connections')}
      desc={t("Let your online store show your branches' products, prices and live stock — kept up to date automatically.")}
    >
      <div className='space-y-4'>
        <Button className='gap-1.5' onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus className='size-4' /> {t('Connect a website')}
        </Button>
        {isLoading ? (
          <div className='flex justify-center py-10'><Loader2 className='size-6 animate-spin' /></div>
        ) : connections.length === 0 ? (
          <div className='text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm'>
            {t('No website connected yet. Connect one to give it an API key that reads your inventory.')}
          </div>
        ) : (
          connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              branchNames={branchNames}
              onEdit={() => { setEditing(connection); setFormOpen(true) }}
              onPreview={() => setPreviewing(connection)}
              onRotate={() => setRotatingFor(connection)}
              onDelete={() => setDeletingFor(connection)}
            />
          ))
        )}
      </div>

      <ConnectionFormDialog open={formOpen} editing={editing} onOpenChange={setFormOpen} onCreated={setRevealedKey} />
      <KeyRevealDialog apiKey={revealedKey} onClose={() => setRevealedKey(null)} />
      <PreviewDialog connection={previewing} onClose={() => setPreviewing(null)} />
      <ConfirmDialog
        open={!!rotatingFor}
        onOpenChange={(open) => !open && setRotatingFor(null)}
        title={t('Replace this key?')}
        desc={t('The current key stops working immediately. Update your website with the new key straight away.')}
        confirmText={t('Replace key')}
        isLoading={rotating}
        handleConfirm={async () => {
          try {
            const { apiKey } = await rotateKey(rotatingFor!.id).unwrap()
            setRotatingFor(null)
            setRevealedKey(apiKey)
          } catch (error) {
            toast.error(getErrorMessage(error, t('Could not replace the key')))
          }
        }}
      />
      <ConfirmDialog
        open={!!deletingFor}
        onOpenChange={(open) => !open && setDeletingFor(null)}
        title={t('Delete this website connection?')}
        desc={t('Its key stops working immediately and the website can no longer read your inventory.')}
        confirmText={t('Delete')}
        destructive
        isLoading={deleting}
        handleConfirm={async () => {
          try {
            await deleteConnection(deletingFor!.id).unwrap()
            setDeletingFor(null)
            toast.success(t('Website connection deleted'))
          } catch (error) {
            toast.error(getErrorMessage(error, t('Could not delete the connection')))
          }
        }}
      />
    </ContentSection>
  )
}
