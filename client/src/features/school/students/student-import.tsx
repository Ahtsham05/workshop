import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBulkImportStudentsMutation } from '@/stores/school.api';
import {
  Upload, FileSpreadsheet, Download, CheckCircle, XCircle,
  AlertTriangle, Users, Loader2, RotateCcw,
} from 'lucide-react';

interface PreviewRow {
  rowNum: number;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  class: string;
  section: string;
  parentPhone: string;
  fatherName: string;
  valid: boolean;
  errors: string[];
}

interface ImportResult {
  success: Array<{ row: number; admissionNumber: string; rollNumber: string; name: string }>;
  failed: Array<{ row: number; errors: string[] }>;
  totalRows: number;
}

const REQUIRED_COLS = ['First Name', 'Gender', 'Class'];

const TEMPLATE_ROWS = [
  {
    'First Name': 'Ahmed',
    'Last Name': 'Ali',
    'Gender': 'male',
    'Date of Birth': '2010-05-20',
    'Class': 'Class 1',
    'Section': 'A',
    'Parent Phone': '03001234567',
    'Father Name': 'Mr Ali',
    'Monthly Fee': 3000,
    'Transport Fee': 500,
    'Admission Fee': 5000,
    'Discount': 0,
  },
  {
    'First Name': 'Sara',
    'Last Name': 'Khan',
    'Gender': 'female',
    'Date of Birth': '2011-08-15',
    'Class': 'Class 2',
    'Section': 'B',
    'Parent Phone': '03009876543',
    'Father Name': 'Mr Khan',
    'Monthly Fee': 3500,
    'Transport Fee': 0,
    'Admission Fee': 5000,
    'Discount': 500,
  },
];

function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_ROWS);
  ws['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 16 },
    { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, 'student_import_template.xlsx');
}

function previewRows(json: any[]): PreviewRow[] {
  return json.map((row, i) => {
    const get = (...keys: string[]) => {
      for (const k of Object.keys(row)) {
        if (keys.some((key) => k.toLowerCase().replace(/\s+/g, '') === key.toLowerCase().replace(/\s+/g, ''))) {
          return String(row[k] ?? '').trim();
        }
      }
      return '';
    };

    const firstName = get('firstname', 'first name');
    const lastName = get('lastname', 'last name');
    const gender = get('gender').toLowerCase();
    const dob = get('dateofbirth', 'date of birth', 'dob', 'birthdate');
    const cls = get('class', 'classname');
    const section = get('section', 'sectionname');
    const phone = get('parentphone', 'parent phone', 'phone');
    const fatherName = get('fathername', 'father name', 'father');

    const errors: string[] = [];
    if (!firstName) errors.push('First Name required');
    if (!['male', 'female', 'other'].includes(gender)) errors.push(`Gender must be male/female/other (got "${gender || 'empty'}")`);
    if (!cls) errors.push('Class required');

    return {
      rowNum: i + 2,
      firstName, lastName, gender, dateOfBirth: dob,
      class: cls, section, parentPhone: phone, fatherName,
      valid: errors.length === 0,
      errors,
    };
  });
}

export default function StudentImportPage() {
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkImport, { isLoading: isImporting }] = useBulkImportStudentsMutation();

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setImportResult(null);
    setParseError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws);
        if (!json.length) { setParseError('File is empty — no data rows found.'); return; }
        setPreview(previewRows(json));
      } catch {
        setParseError('Could not read file. Make sure it is a valid .xlsx or .xls file.');
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const validRows = preview.filter((r) => r.valid);
  const invalidRows = preview.filter((r) => !r.valid);

  const handleImport = async () => {
    if (!file || !validRows.length) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const result = await bulkImport(fd).unwrap();
      setImportResult(result);
      setPreview([]);
      setFile(null);
    } catch (err: any) {
      setParseError(err?.data?.message || 'Import failed. Please try again.');
    }
  };

  const reset = () => {
    setPreview([]);
    setFile(null);
    setImportResult(null);
    setParseError('');
  };

  return (
    <div className="h-full w-full p-4 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-green-600" />
            Import Students
          </h1>
          <p className="text-sm text-muted-foreground">Upload an Excel file to bulk-import students</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate} className="gap-2">
          <Download className="h-4 w-4" /> Download Template
        </Button>
      </div>

      {/* Success result */}
      {importResult && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-green-700 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" /> Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="text-green-700 font-medium">{importResult.success.length} imported successfully</span>
              {importResult.failed.length > 0 && (
                <span className="text-red-600 font-medium">{importResult.failed.length} failed</span>
              )}
            </div>
            {importResult.success.length > 0 && (
              <div className="text-sm text-green-800 space-y-1 max-h-40 overflow-auto">
                {importResult.success.map((s) => (
                  <div key={s.row} className="flex gap-3">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-green-600">{s.admissionNumber}</span>
                    <span className="text-green-600">{s.rollNumber}</span>
                  </div>
                ))}
              </div>
            )}
            {importResult.failed.length > 0 && (
              <div className="text-sm text-red-700 space-y-1 max-h-32 overflow-auto">
                {importResult.failed.map((f) => (
                  <div key={f.row}>Row {f.row}: {f.errors.join(', ')}</div>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={reset} className="gap-2 mt-2">
              <RotateCcw className="h-3.5 w-3.5" /> Import Another File
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Parse error */}
      {parseError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      {/* Upload zone */}
      {!importResult && !preview.length && (
        <Card
          className="border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors cursor-pointer"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="py-14 flex flex-col items-center gap-3 text-center">
            <Upload className="h-10 w-10 text-gray-400" />
            <div>
              <p className="font-medium text-gray-700">Drop .xlsx / .xls file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                Required columns: {REQUIRED_COLS.join(', ')} · Optional: Last Name, Date of Birth, Section, Parent Phone, Father Name
              </p>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
          </CardContent>
        </Card>
      )}

      {/* Preview table */}
      {preview.length > 0 && !importResult && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Badge variant="default" className="bg-green-600 gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> {validRows.length} valid
              </Badge>
              {invalidRows.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3.5 w-3.5" /> {invalidRows.length} with errors
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">{preview.length} rows total</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>Change File</Button>
              <Button
                onClick={handleImport}
                disabled={!validRows.length || isImporting}
                className="gap-2 bg-green-700 hover:bg-green-800"
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                {isImporting ? 'Importing…' : `Import ${validRows.length} Student${validRows.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Row', 'Status', 'First Name', 'Last Name', 'Gender', 'DOB', 'Class', 'Section', 'Phone', 'Father'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.rowNum} className={row.valid ? 'hover:bg-gray-50' : 'bg-red-50 hover:bg-red-100'}>
                    <td className="px-3 py-2 text-gray-500">{row.rowNum}</td>
                    <td className="px-3 py-2">
                      {row.valid ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <div title={row.errors.join('\n')}>
                          <XCircle className="h-4 w-4 text-red-500 cursor-help" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{row.firstName || <span className="text-red-500 italic">missing</span>}</td>
                    <td className="px-3 py-2">{row.lastName}</td>
                    <td className="px-3 py-2">
                      <Badge variant={row.gender === 'male' || row.gender === 'female' || row.gender === 'other' ? 'outline' : 'destructive'} className="text-xs">
                        {row.gender || 'missing'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.dateOfBirth}</td>
                    <td className="px-3 py-2 font-medium">{row.class || <span className="text-red-500 italic">missing</span>}</td>
                    <td className="px-3 py-2">{row.section}</td>
                    <td className="px-3 py-2">{row.parentPhone}</td>
                    <td className="px-3 py-2">{row.fatherName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invalidRows.length > 0 && (
            <Alert variant="destructive" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {invalidRows.length} row{invalidRows.length !== 1 ? 's have' : ' has'} errors and will be skipped during import.
                Fix the Excel file and re-upload to import all rows.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
