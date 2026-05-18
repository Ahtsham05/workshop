import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Loader2,
  Sparkles,
  Camera,
  Upload,
  Plus,
  Trash2,
  AlertCircle,
  PenLine,
} from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Alert, AlertDescription } from '@/components/ui/alert'
import CameraCapture from '@/components/camera-capture'
import {
  fetchEnglishNameSuggestion,
  fetchUrduNameSuggestion,
} from '@/hooks/use-auto-urdu-name-from-english'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface SupplierAiScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (suppliers: Record<string, string | number>[]) => Promise<void>
}

interface ScannedSupplier {
  id: string
  name: string
  nameUrdu: string
  email: string
  phone: string
  whatsapp: string
  address: string
  balance: string
}

const URDU_SCRIPT = /[\u0600-\u06FF\u0750-\u077F]/

const FULLSCREEN_DIALOG_CLASS = cn(
  '!fixed !inset-0 !top-0 !left-0 z-[100] flex h-[100dvh] w-[100vw] !max-w-none flex-col gap-0',
  '!translate-x-0 !translate-y-0 rounded-none border-0 p-0 shadow-lg overflow-hidden',
  'sm:!max-w-none data-[state=open]:!zoom-in-100 data-[state=closed]:!zoom-out-100',
)

function createEmptyRow(): ScannedSupplier {
  return {
    id: crypto.randomUUID(),
    name: '',
    nameUrdu: '',
    email: '',
    phone: '',
    whatsapp: '',
    address: '',
    balance: '',
  }
}

function splitScannedNames(rawName: string, rawNameUrdu: string) {
  let name = rawName.trim()
  let nameUrdu = rawNameUrdu.trim()
  if (!nameUrdu && name && URDU_SCRIPT.test(name)) {
    nameUrdu = name
    name = ''
  }
  return { name, nameUrdu }
}

function mapApiSupplier(c: Record<string, unknown>, index: number): ScannedSupplier {
  const { name, nameUrdu } = splitScannedNames(
    String(c.name || ''),
    String(c.nameUrdu || ''),
  )
  return {
    id: `scan-${index}-${Date.now()}`,
    name,
    nameUrdu,
    email: String(c.email || '').trim(),
    phone: String(c.phone || '').trim(),
    whatsapp: String(c.whatsapp || '').trim(),
    address: String(c.address || '').trim(),
    balance:
      c.balance !== undefined && c.balance !== null && c.balance !== ''
        ? String(c.balance)
        : '',
  }
}

function rowHasName(row: ScannedSupplier) {
  return Boolean(row.name.trim() || row.nameUrdu.trim())
}

const ROW_NAV_FIELDS: (keyof ScannedSupplier)[] = [
  'name',
  'nameUrdu',
  'balance',
  'email',
  'phone',
  'whatsapp',
  'address',
]

const MANUAL_START_ROW_COUNT = 5

async function enrichRowsWithEnglish(rows: ScannedSupplier[]): Promise<ScannedSupplier[]> {
  const next = rows.map((row) => ({ ...row }))
  await Promise.all(
    next.map(async (row, index) => {
      if (row.name.trim() || !row.nameUrdu.trim()) return
      const english = await fetchEnglishNameSuggestion(row.nameUrdu)
      if (english) {
        next[index] = { ...row, name: english }
      }
    }),
  )
  return next
}

export function SupplierAiScanDialog({
  open,
  onOpenChange,
  onImport,
}: SupplierAiScanDialogProps) {
  const { t } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const translateTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingFocusRef = useRef<{ rowId: string; field: keyof ScannedSupplier } | null>(
    null,
  )
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [translatingRowId, setTranslatingRowId] = useState<string | null>(null)
  const [rows, setRows] = useState<ScannedSupplier[]>([])
  const [step, setStep] = useState<'upload' | 'review'>('upload')

  const setImage = useCallback((file: File) => {
    setImageFile(file)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setRows([])
    setStep('upload')
  }, [])

  const resetDialog = useCallback(() => {
    Object.values(translateTimersRef.current).forEach(clearTimeout)
    translateTimersRef.current = {}
    setImageFile(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setRows([])
    setStep('upload')
    setScanning(false)
    setImporting(false)
    setTranslatingRowId(null)
  }, [])

  const handleScan = useCallback(async () => {
    if (!imageFile) {
      toast.error(t('please_select_image'))
      return
    }

    try {
      setScanning(true)
      const formData = new FormData()
      formData.append('image', imageFile)

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/suppliers/scan-image`,
        {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        },
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const msg =
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : t('ai_scan_failed')
        throw new Error(msg)
      }

      const suppliers = Array.isArray(data.suppliers) ? data.suppliers : []
      if (suppliers.length === 0) {
        toast.error(t('no_suppliers_found_in_image'))
        return
      }

      const mapped = suppliers.map(mapApiSupplier)
      setRows(await enrichRowsWithEnglish(mapped))
      setStep('review')
      toast.success(
        `${t('ai_scan_success')}: ${suppliers.length} ${t('suppliers_found')}`,
      )
    } catch (error) {
      console.error('AI scan error:', error)
      toast.error(
        error instanceof Error ? error.message : t('ai_scan_failed'),
      )
    } finally {
      setScanning(false)
    }
  }, [imageFile, t])

  const updateRow = (id: string, field: keyof ScannedSupplier, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    )
  }

  const handleEnglishNameChange = (id: string, value: string) => {
    updateRow(id, 'name', value)

    if (translateTimersRef.current[id]) {
      clearTimeout(translateTimersRef.current[id])
    }

    translateTimersRef.current[id] = setTimeout(async () => {
      const trimmed = value.trim()
      if (trimmed.length < 2 || !/[A-Za-z]/.test(trimmed)) {
        setTranslatingRowId(null)
        return
      }
      setTranslatingRowId(id)
      const translated = await fetchUrduNameSuggestion(trimmed)
      if (translated) {
        updateRow(id, 'nameUrdu', translated)
      }
      setTranslatingRowId((current) => (current === id ? null : current))
    }, 450)
  }

  const removeRow = (id: string) => {
    if (translateTimersRef.current[id]) {
      clearTimeout(translateTimersRef.current[id])
      delete translateTimersRef.current[id]
    }
    setRows((prev) => prev.filter((row) => row.id !== id))
  }

  const focusRowField = useCallback((rowId: string, field: keyof ScannedSupplier) => {
    const el = document.querySelector(
      `[data-scan-row="${rowId}"][data-scan-field="${field}"]`,
    ) as HTMLInputElement | null
    el?.focus()
    el?.select()
  }, [])

  useEffect(() => {
    if (!pendingFocusRef.current) return
    const target = pendingFocusRef.current
    pendingFocusRef.current = null
    requestAnimationFrame(() => focusRowField(target.rowId, target.field))
  }, [rows, focusRowField])

  const addRow = useCallback((focusName = false) => {
    const newRow = createEmptyRow()
    setRows((prev) => [...prev, newRow])
    if (focusName) {
      pendingFocusRef.current = { rowId: newRow.id, field: 'name' }
    }
    return newRow
  }, [])

  const startManualEntry = useCallback(() => {
    const initial = Array.from({ length: MANUAL_START_ROW_COUNT }, () => createEmptyRow())
    setRows(initial)
    setStep('review')
    pendingFocusRef.current = { rowId: initial[0].id, field: 'name' }
  }, [])

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: keyof ScannedSupplier,
  ) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()

    const fieldIndex = ROW_NAV_FIELDS.indexOf(field)
    const isLastRow = rowIndex === rows.length - 1

    if (isLastRow) {
      addRow(true)
      return
    }

    if (fieldIndex < ROW_NAV_FIELDS.length - 1) {
      focusRowField(rows[rowIndex].id, ROW_NAV_FIELDS[fieldIndex + 1])
      return
    }

    focusRowField(rows[rowIndex + 1].id, 'name')
  }

  const buildSupplierImportPayload = (): Record<string, string | number>[] | null => {
    const valid: Record<string, string | number>[] = []
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!rowHasName(row)) continue

      const name = row.name.trim() || row.nameUrdu.trim()

      if (row.email.trim() && !emailRegex.test(row.email.trim())) {
        toast.error(`${t('row')} ${i + 1}: ${t('invalid_email_format')}`)
        return null
      }

      if (row.balance.trim() && Number.isNaN(Number(row.balance))) {
        toast.error(`${t('row')} ${i + 1}: ${t('balance_must_be_number')}`)
        return null
      }

      const payload: Record<string, string | number> = { name }
      if (row.nameUrdu.trim()) payload.nameUrdu = row.nameUrdu.trim()
      if (row.email.trim()) payload.email = row.email.trim()
      if (row.phone.trim()) payload.phone = row.phone.trim()
      if (row.whatsapp.trim()) payload.whatsapp = row.whatsapp.trim()
      if (row.address.trim()) payload.address = row.address.trim()
      if (row.balance.trim() && !Number.isNaN(Number(row.balance))) {
        payload.balance = Number(row.balance)
      }
      valid.push(payload)
    }

    if (valid.length === 0) {
      toast.error(t('no_suppliers_to_import'))
      return null
    }

    return valid
  }

  const handleImport = useCallback(async () => {
    const customers = buildSupplierImportPayload()
    if (!customers) return

    try {
      setImporting(true)
      await onImport(customers)
      toast.success(
        `${t('import_successful')}: ${customers.length} ${t('suppliers_imported')}`,
      )
      resetDialog()
      onOpenChange(false)
    } catch (error) {
      console.error('Import error:', error)
      toast.error(t('error_importing_suppliers'))
    } finally {
      setImporting(false)
    }
  }, [rows, onImport, onOpenChange, resetDialog, t])

  const importCount = rows.filter(rowHasName).length

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetDialog()
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className={FULLSCREEN_DIALOG_CLASS}>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-4">
          <DialogHeader className="shrink-0 space-y-1 text-left pb-2">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('ai_scan_suppliers')}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {t('ai_scan_suppliers_description')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {step === 'upload' && (
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 overflow-y-auto">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{t('ai_scan_suppliers_tip')}</AlertDescription>
                </Alert>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={scanning}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t('upload_image')}
                  </Button>
                  <CameraCapture
                    onCapture={setImage}
                    trigger={
                      <Button type="button" variant="outline" disabled={scanning}>
                        <Camera className="mr-2 h-4 w-4" />
                        {t('take_photo')}
                      </Button>
                    }
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setImage(file)
                      if (e.target) e.target.value = ''
                    }}
                  />
                </div>

                {previewUrl && (
                  <div className="rounded-lg border overflow-hidden max-h-64">
                    <img
                      src={previewUrl}
                      alt={t('supplier_list_preview')}
                      className="w-full object-contain max-h-64 bg-muted"
                    />
                  </div>
                )}

                {imageFile && (
                  <p className="text-sm text-muted-foreground">
                    {t('selected_file')}: {imageFile.name}
                  </p>
                )}

                {imageFile && (
                  <Button onClick={handleScan} disabled={scanning} className="w-full">
                    {scanning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('ai_scanning')}...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t('scan_with_ai')}
                      </>
                    )}
                  </Button>
                )}

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={scanning}
                  onClick={startManualEntry}
                >
                  <PenLine className="mr-2 h-4 w-4" />
                  {t('add_suppliers_manually')}
                </Button>
              </div>
            )}

            {step === 'review' && (
              <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {t('review_and_edit_suppliers')}: {rows.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('name_in_urdu_hint')} · {t('bulk_entry_enter_hint')}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => addRow(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    {t('add_row')}
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
                  <Table className="w-full min-w-[920px] text-sm">
                    <TableHeader className="sticky top-0 z-10 bg-muted">
                      <TableRow>
                        <TableHead className="min-w-[150px] whitespace-nowrap px-2 py-2">
                          {t('supplier_name')} (English) *
                        </TableHead>
                        <TableHead className="min-w-[150px] whitespace-nowrap px-2 py-2">
                          {t('name_in_urdu')}
                        </TableHead>
                        <TableHead className="min-w-[88px] whitespace-nowrap px-2 py-2">
                          {t('balance')}
                        </TableHead>
                        <TableHead className="min-w-[120px] whitespace-nowrap px-2 py-2">
                          {t('email')}
                        </TableHead>
                        <TableHead className="min-w-[108px] whitespace-nowrap px-2 py-2">
                          {t('phone')}
                        </TableHead>
                        <TableHead className="min-w-[108px] whitespace-nowrap px-2 py-2">
                          {t('whatsapp')}
                        </TableHead>
                        <TableHead className="min-w-[120px] whitespace-nowrap px-2 py-2">
                          {t('address')}
                        </TableHead>
                        <TableHead className="w-10 px-1 py-2" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, rowIndex) => (
                        <TableRow key={row.id} className="hover:bg-muted/30">
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.name}
                              data-scan-row={row.id}
                              data-scan-field="name"
                              onChange={(e) =>
                                handleEnglishNameChange(row.id, e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'name')}
                              placeholder={t('supplier_name')}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <div className="relative">
                              <Input
                                value={row.nameUrdu}
                                data-scan-row={row.id}
                                data-scan-field="nameUrdu"
                                onChange={(e) =>
                                  updateRow(row.id, 'nameUrdu', e.target.value)
                                }
                                onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'nameUrdu')}
                                placeholder={t('name_in_urdu_placeholder')}
                                dir="rtl"
                                className={cn('h-8 text-right text-sm font-medium')}
                              />
                              {translatingRowId === row.id && (
                                <Loader2 className="absolute left-1.5 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              type="number"
                              value={row.balance}
                              data-scan-row={row.id}
                              data-scan-field="balance"
                              onChange={(e) =>
                                updateRow(row.id, 'balance', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'balance')}
                              placeholder="0"
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.email}
                              data-scan-row={row.id}
                              data-scan-field="email"
                              onChange={(e) =>
                                updateRow(row.id, 'email', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'email')}
                              placeholder={t('email')}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.phone}
                              data-scan-row={row.id}
                              data-scan-field="phone"
                              onChange={(e) =>
                                updateRow(row.id, 'phone', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'phone')}
                              placeholder={t('phone')}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.whatsapp}
                              data-scan-row={row.id}
                              data-scan-field="whatsapp"
                              onChange={(e) =>
                                updateRow(row.id, 'whatsapp', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'whatsapp')}
                              placeholder={t('whatsapp')}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.address}
                              data-scan-row={row.id}
                              data-scan-field="address"
                              onChange={(e) =>
                                updateRow(row.id, 'address', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'address')}
                              placeholder={t('address')}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-1 py-1 align-middle">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeRow(row.id)}
                              aria-label={t('delete')}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <p className="shrink-0 text-[11px] text-muted-foreground">
                  {t('ai_scan_suppliers_balance_ledger_note')}
                </p>
              </>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t pt-3 sm:justify-end">
            {step === 'review' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('upload')}
                disabled={importing}
              >
                {t('back')}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={importing || scanning}
            >
              {t('cancel')}
            </Button>
            {step === 'review' && (
              <Button onClick={handleImport} disabled={importing || importCount === 0}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('importing')}...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {t('import')} ({importCount})
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
