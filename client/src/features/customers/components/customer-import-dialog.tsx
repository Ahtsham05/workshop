import { useState, useCallback } from 'react'
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
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Upload, Download, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import * as XLSX from 'xlsx'

interface CustomerImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (customers: any[]) => Promise<void>
}

interface ImportCustomer {
  name: string
  email?: string
  phone?: string
  whatsapp?: string
  address?: string
  balance?: number
}

interface ValidationError {
  row: number
  field: string
  message: string
}

export function CustomerImportDialog({ open, onOpenChange, onImport }: CustomerImportDialogProps) {
  const { t } = useLanguage()
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [parsedData, setParsedData] = useState<ImportCustomer[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [parseSuccess, setParseSuccess] = useState(false)

  const downloadTemplate = useCallback(() => {
    const template = [
      {
        name: 'Sample Customer 1',
        email: 'customer1@example.com',
        phone: '+923001234567',
        whatsapp: '+923001234567',
        address: '123 Main Street, City',
        balance: 0
      },
      {
        name: 'Sample Customer 2',
        email: 'customer2@example.com',
        phone: '+923007654321',
        whatsapp: '+923007654321',
        address: '456 Park Avenue, City',
        balance: 0
      }
    ]

    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    
    // Auto-size columns
    const colWidths = [
      { wch: 30 }, // name
      { wch: 30 }, // email
      { wch: 18 }, // phone
      { wch: 18 }, // whatsapp
      { wch: 40 }, // address
      { wch: 12 }  // balance
    ]
    ws['!cols'] = colWidths

    XLSX.writeFile(wb, 'customers-import-template.xlsx')
    toast.success(t('template_downloaded'))
  }, [t])

  const validateCustomer = (customer: any, rowIndex: number): ValidationError[] => {
    const errors: ValidationError[] = []

    // Required field - name
    if (!customer.name || customer.name.toString().trim() === '') {
      errors.push({ row: rowIndex, field: 'name', message: t('customer_name_required') })
    }

    // Optional email validation
    if (customer.email && customer.email.toString().trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(customer.email.toString().trim())) {
        errors.push({ row: rowIndex, field: 'email', message: t('invalid_email_format') })
      }
    }

    // Optional balance validation
    if (customer.balance !== undefined && customer.balance !== null && customer.balance !== '') {
      if (isNaN(Number(customer.balance))) {
        errors.push({ row: rowIndex, field: 'balance', message: t('balance_must_be_number') })
      }
    }

    return errors
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // Check file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ]
    
    if (!validTypes.includes(selectedFile.type) && 
        !selectedFile.name.endsWith('.xlsx') && 
        !selectedFile.name.endsWith('.xls') && 
        !selectedFile.name.endsWith('.csv')) {
      toast.error(t('invalid_file_type'))
      return
    }

    setFile(selectedFile)
    setParseSuccess(false)
    setParsedData([])
    setErrors([])
  }

  const parseFile = useCallback(async () => {
    if (!file) {
      toast.error(t('please_select_file'))
      return
    }

    try {
      setImporting(true)
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

      if (jsonData.length === 0) {
        toast.error(t('file_is_empty'))
        setImporting(false)
        return
      }

      // Skip header rows
      let dataToProcess = jsonData
      let rowOffset = 1
      
      if (jsonData[0]) {
        const firstRow = jsonData[0] as any
        const firstRowName = firstRow.name?.toString().toLowerCase() || ''
        const emailValue = firstRow.email?.toString().toLowerCase() || ''
        
        const isHeaderByName = firstRowName === 'name' || 
                               firstRowName.includes('customer name') || 
                               firstRowName.includes('required')
        const isHeaderByValues = emailValue === 'email'
        
        if (isHeaderByName || isHeaderByValues) {
          dataToProcess = jsonData.slice(1)
          rowOffset = 2
        }
      }

      // Validate and parse customers
      const customers: ImportCustomer[] = []
      const allErrors: ValidationError[] = []

      dataToProcess.forEach((row: any, index: number) => {
        // Skip completely empty rows
        const hasAnyData = Object.values(row).some(val => val !== '' && val !== null && val !== undefined)
        if (!hasAnyData) {
          return
        }
        
        // Skip rows that don't have at least a name
        if (!row.name || row.name.toString().trim() === '') {
          return
        }
        
        const rowErrors = validateCustomer(row, index + rowOffset)
        
        if (rowErrors.length > 0) {
          allErrors.push(...rowErrors)
        } else {
          const customer: ImportCustomer = {
            name: row.name.toString().trim(),
          }
          
          // Add optional fields only if they have values
          if (row.email?.toString().trim()) {
            customer.email = row.email.toString().trim()
          }
          if (row.phone?.toString().trim()) {
            customer.phone = row.phone.toString().trim()
          }
          if (row.whatsapp?.toString().trim()) {
            customer.whatsapp = row.whatsapp.toString().trim()
          }
          if (row.address?.toString().trim()) {
            customer.address = row.address.toString().trim()
          }
          if (row.balance && !isNaN(Number(row.balance))) {
            customer.balance = Number(row.balance)
          }
          
          customers.push(customer)
        }
      })

      if (allErrors.length > 0) {
        setErrors(allErrors)
        toast.error(`${t('validation_errors')}: ${allErrors.length} errors found`)
      } else {
        setParsedData(customers)
        setParseSuccess(true)
        toast.success(`${t('file_parsed_successfully')}: ${customers.length} customers ready to import`)
      }

      setImporting(false)
    } catch (error) {
      console.error('Error parsing file:', error)
      toast.error(t('error_parsing_file'))
      setImporting(false)
    }
  }, [file, t])

  const handleImport = useCallback(async () => {
    if (parsedData.length === 0) {
      toast.error(t('no_customers_to_import'))
      return
    }

    try {
      setImporting(true)
      await onImport(parsedData)
      toast.success(`${t('import_successful')}: ${parsedData.length} customers imported`)
      
      // Reset state
      setFile(null)
      setParsedData([])
      setErrors([])
      setParseSuccess(false)
      onOpenChange(false)
    } catch (error) {
      console.error('Error importing customers:', error)
      toast.error(t('error_importing_customers'))
    } finally {
      setImporting(false)
    }
  }, [parsedData, onImport, onOpenChange, t])

  const resetDialog = () => {
    setFile(null)
    setParsedData([])
    setErrors([])
    setParseSuccess(false)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetDialog()
      onOpenChange(open)
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t('import_customers_from_excel')}</DialogTitle>
          <DialogDescription>
            {t('upload_excel_file_to_import_customers')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{t('download_template_first')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
              >
                <Download className="h-4 w-4 mr-2" />
                {t('download_template')}
              </Button>
            </AlertDescription>
          </Alert>

          {/* File Upload */}
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="excel-file">{t('select_excel_file')}</Label>
            <Input
              id="excel-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              disabled={importing}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                {t('selected_file')}: {file.name}
              </p>
            )}
          </div>

          {/* Parse Button */}
          {file && !parseSuccess && errors.length === 0 && (
            <Button
              onClick={parseFile}
              disabled={importing}
              className="w-full"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('parsing')}...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t('parse_and_validate')}
                </>
              )}
            </Button>
          )}

          {/* Validation Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">{t('validation_errors')} ({errors.length} {t('found_in_excel_file')})</div>
                <ScrollArea className="h-40">
                  <div className="space-y-1">
                    {errors.map((error, index) => (
                      <div key={index} className="text-xs">
                        {t('row')} {error.row}, {t('field')}: {error.field} - {error.message}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {/* Success Preview */}
          {parseSuccess && parsedData.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="font-semibold mb-2 text-green-600">
                  {t('ready_to_import')}: {parsedData.length} customers
                </div>
                <ScrollArea className="h-40">
                  <div className="space-y-2">
                    {parsedData.slice(0, 10).map((customer, index) => (
                      <div key={index} className="text-xs border-b pb-1">
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-muted-foreground">
                          {customer.email && `Email: ${customer.email}`}
                          {customer.phone && ` | Phone: ${customer.phone}`}
                          {customer.address && ` | Address: ${customer.address}`}
                        </div>
                      </div>
                    ))}
                    {parsedData.length > 10 && (
                      <div className="text-xs text-muted-foreground">
                        ... and {parsedData.length - 10} more customers
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {/* Warning */}
          {parseSuccess && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('warning_importing_customers')}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            {t('cancel')}
          </Button>
          {parseSuccess && (
            <Button
              onClick={handleImport}
              disabled={importing || parsedData.length === 0}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('importing')}...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t('import')} ({parsedData.length})
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
