import { useState } from 'react';
import { Upload, Download, X, AlertCircle, CheckCircle2, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/context/language-context';

interface SupplierImport {
  name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  balance?: number;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface SupplierImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (suppliers: SupplierImport[]) => void;
}

export default function SupplierImportDialog({ open, onClose, onImport }: SupplierImportDialogProps) {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierImport[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [importing, setImporting] = useState(false);

  const downloadTemplate = () => {
    const template = [
      {
        name: 'ABC Company',
        email: 'abc@example.com',
        phone: '+923001234567',
        whatsapp: '+923001234567',
        address: '123 Main St, City',
        balance: 0
      },
      {
        name: 'XYZ Suppliers',
        email: 'xyz@example.com',
        phone: '+923009876543',
        whatsapp: '+923009876543',
        address: '456 Market Rd',
        balance: 0
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    
    // Set column widths
    const columnWidths = [
      { wch: 20 }, // name
      { wch: 25 }, // email
      { wch: 15 }, // phone
      { wch: 15 }, // whatsapp
      { wch: 30 }, // address
      { wch: 10 }  // balance
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Suppliers');
    XLSX.writeFile(workbook, 'supplier_import_template.xlsx');
  };

  const validateSupplier = (supplier: any, rowIndex: number): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (!supplier.name || supplier.name.trim() === '') {
      errors.push({
        row: rowIndex,
        field: 'name',
        message: t('supplier_name_required') || 'Supplier name is required'
      });
    }

    // Validate email format if provided
    if (supplier.email && supplier.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(supplier.email)) {
        errors.push({
          row: rowIndex,
          field: 'email',
          message: t('invalid_email_format') || 'Invalid email format'
        });
      }
    }

    // Validate balance if provided
    if (supplier.balance !== undefined && supplier.balance !== null && supplier.balance !== '') {
      const balanceNum = Number(supplier.balance);
      if (isNaN(balanceNum)) {
        errors.push({
          row: rowIndex,
          field: 'balance',
          message: t('balance_must_be_number') || 'Balance must be a number'
        });
      }
    }

    return errors;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrors([]);
    setSuppliers([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Find the header row
        let headerRowIndex = 0;
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i] as any;
          // Check if this row has the 'name' field (required field)
          if (row.name !== undefined && row.name !== null && String(row.name).trim() !== '') {
            headerRowIndex = i;
            break;
          }
        }

        // Process data starting from header row
        const parsedSuppliers: SupplierImport[] = [];
        const validationErrors: ValidationError[] = [];

        for (let i = headerRowIndex; i < jsonData.length; i++) {
          const row = jsonData[i] as any;
          
          const supplier: SupplierImport = {
            name: row.name ? String(row.name).trim() : '',
            email: row.email ? String(row.email).trim() : '',
            phone: row.phone ? String(row.phone).trim() : '',
            whatsapp: row.whatsapp ? String(row.whatsapp).trim() : '',
            address: row.address ? String(row.address).trim() : '',
            balance: row.balance !== undefined && row.balance !== null && row.balance !== '' 
              ? Number(row.balance) 
              : 0,
          };

          const rowErrors = validateSupplier(supplier, i + 1);
          
          if (rowErrors.length > 0) {
            validationErrors.push(...rowErrors);
          } else if (supplier.name) { // Only add if name exists
            parsedSuppliers.push(supplier);
          }
        }

        setSuppliers(parsedSuppliers);
        setErrors(validationErrors);
      } catch (error) {
        console.error('Error parsing file:', error);
        setErrors([{
          row: 0,
          field: 'file',
          message: t('error_parsing_file') || 'Error parsing file. Please check the file format.'
        }]);
      }
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handleImport = async () => {
    if (suppliers.length === 0) return;

    setImporting(true);

    try {
      await onImport(suppliers);
      
      // Close dialog after successful import
      setTimeout(() => {
        handleClose();
      }, 500);
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setSuppliers([]);
    setErrors([]);
    setImporting(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {t('import_suppliers_from_excel') || 'Import Suppliers from Excel'}
          </DialogTitle>
          <DialogDescription>
            {t('upload_excel_file_to_import_suppliers') || 'Upload an Excel file to import multiple suppliers at once'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Download Template Button */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{t('download_template') || 'Download Template'}</p>
                <p className="text-sm text-muted-foreground">
                  {t('get_excel_template') || 'Get the Excel template with sample data'}
                </p>
              </div>
            </div>
            <Button onClick={downloadTemplate} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              {t('download') || 'Download'}
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label htmlFor="file-upload" className="block text-sm font-medium">
              {t('select_file') || 'Select File'}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="file-upload"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              {file && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setFile(null);
                    setSuppliers([]);
                    setErrors([]);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">
                  {t('validation_errors')} ({errors.length})
                </div>
                <ul className="list-disc list-inside space-y-1 text-sm max-h-40 overflow-y-auto">
                  {errors.slice(0, 10).map((error, index) => (
                    <li key={index}>
                      {t('row')} {error.row}, {error.field}: {error.message}
                    </li>
                  ))}
                  {errors.length > 10 && (
                    <li className="text-muted-foreground">
                      {t('and_more')} {errors.length - 10} {t('more_errors')}
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Success Summary */}
          {suppliers.length > 0 && errors.length === 0 && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <div className="font-medium">
                  {t('ready_to_import')} {suppliers.length} {t('suppliers_plural')}
                </div>
                <p className="text-sm mt-1">
                  {t('click_import_to_continue')}
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview Table */}
          {suppliers.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 font-medium text-sm">
                {t('preview')} ({suppliers.length} {t('suppliers_plural')})
              </div>
              <ScrollArea className="max-h-60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">{t('name')}</th>
                      <th className="text-left p-2 font-medium">{t('email')}</th>
                      <th className="text-left p-2 font-medium">{t('phone')}</th>
                      <th className="text-left p-2 font-medium">{t('address')}</th>
                      <th className="text-right p-2 font-medium">{t('balance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.slice(0, 10).map((supplier, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2">{supplier.name}</td>
                        <td className="p-2 text-muted-foreground">{supplier.email || '-'}</td>
                        <td className="p-2 text-muted-foreground">{supplier.phone || '-'}</td>
                        <td className="p-2 text-muted-foreground">{supplier.address || '-'}</td>
                        <td className="p-2 text-right">{supplier.balance || 0}</td>
                      </tr>
                    ))}
                    {suppliers.length > 10 && (
                      <tr className="border-t">
                        <td colSpan={5} className="p-2 text-center text-muted-foreground">
                          {t('and_more')} {suppliers.length - 10}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}

          {/* Importing Indicator */}
          {importing && (
            <div className="flex items-center justify-center gap-2 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">{t('importing_suppliers')}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={suppliers.length === 0 || errors.length > 0 || importing}
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('importing')}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {t('import')} ({suppliers.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
