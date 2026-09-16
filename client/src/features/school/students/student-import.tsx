import { useState, useRef, useCallback } from 'react';
import {
  downloadTemplate as downloadTemplateWorkbook,
  IMPORT_FILE_ACCEPT,
  isSupportedSpreadsheet,
  parseDate,
  parseNumeric,
  parseSheet,
  parseText,
  pickBestSheet,
  readWorkbook,
  SpreadsheetError,
  summarizeSheets,
  type CellValue,
  type ImportFieldSpec,
} from '@/lib/excel-import';
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
    firstName: 'Ahmed',
    lastName: 'Ali',
    gender: 'male',
    dateOfBirth: '2010-05-20',
    class: 'Class 1',
    section: 'A',
    parentPhone: '03001234567',
    fatherName: 'Mr Ali',
    monthlyFee: 3000,
    transportFee: 500,
    admissionFee: 5000,
    discount: 0,
  },
  {
    firstName: 'Sara',
    lastName: 'Khan',
    gender: 'female',
    dateOfBirth: '2011-08-15',
    class: 'Class 2',
    section: 'B',
    parentPhone: '03009876543',
    fatherName: 'Mr Khan',
    monthlyFee: 3500,
    transportFee: 0,
    admissionFee: 5000,
    discount: 500,
  },
];

function downloadTemplate() {
  // Built from the same field list the parser matches against, so the template and the
  // accepted column names can never drift apart. Required columns are marked in the
  // header, and that marker is ignored when the file comes back in.
  downloadTemplateWorkbook(STUDENT_FIELDS, TEMPLATE_ROWS, 'student_import_template.xlsx', 'Students');
}

/**
 * Columns the import understands, with the spellings people actually use. This mirrors
 * STUDENT_IMPORT_FIELDS in the server's student.controller.js — the server parses the
 * uploaded file itself, so the two lists have to agree or the preview would promise
 * something the import doesn't deliver.
 */
const STUDENT_FIELDS: ImportFieldSpec[] = [
  { key: 'firstName', label: 'First Name', required: true, aliases: ['Name', 'Student Name', 'Student', 'Given Name'] },
  { key: 'lastName', label: 'Last Name', aliases: ['Surname', 'Family Name'] },
  { key: 'gender', label: 'Gender', required: true, aliases: ['Sex', 'M/F'] },
  { key: 'dateOfBirth', label: 'Date of Birth', type: 'date', aliases: ['DOB', 'Birth Date', 'Birthday'] },
  { key: 'class', label: 'Class', required: true, aliases: ['Class Name', 'Grade', 'Standard'] },
  { key: 'section', label: 'Section', aliases: ['Section Name', 'Sec'] },
  { key: 'parentPhone', label: 'Parent Phone', type: 'code', aliases: ['Phone', 'Contact Number', 'Mobile', 'Guardian Phone', 'Father Phone'] },
  { key: 'fatherName', label: 'Father Name', aliases: ['Father', "Father's Name", 'Guardian Name', 'Parent Name'] },
  { key: 'monthlyFee', label: 'Monthly Fee', type: 'number', aliases: ['Tuition Fee', 'Fee', 'Fees'] },
  { key: 'transportFee', label: 'Transport Fee', type: 'number', aliases: ['Transport', 'Van Fee', 'Bus Fee'] },
  { key: 'admissionFee', label: 'Admission Fee', type: 'number', aliases: ['Admission'] },
  { key: 'discount', label: 'Discount', type: 'number', aliases: ['Concession', 'Rebate'] },
];

// male/female/other plus the short forms people type — the same set the server accepts.
const GENDER_WORDS: Record<string, string> = {
  m: 'male', male: 'male', boy: 'male', b: 'male',
  f: 'female', female: 'female', girl: 'female', g: 'female',
  o: 'other', other: 'other',
};

const FEE_LABELS: Record<string, string> = {
  monthlyFee: 'Monthly fee',
  transportFee: 'Transport fee',
  admissionFee: 'Admission fee',
  discount: 'Discount',
};

function buildPreviewRow(values: Record<string, CellValue>, excelRow: number): PreviewRow {
  const firstName = parseText(values.firstName);
  const lastName = parseText(values.lastName);
  const genderRaw = parseText(values.gender).toLowerCase();
  const gender = GENDER_WORDS[genderRaw] || '';
  const cls = parseText(values.class);
  const section = parseText(values.section);
  const phone = parseText(values.parentPhone, { code: true });
  const fatherName = parseText(values.fatherName);

  const errors: string[] = [];
  if (!firstName) errors.push('First Name required');
  if (!gender) errors.push(`Gender must be male/female/other (got "${genderRaw || 'empty'}")`);
  if (!cls) errors.push('Class required');

  const dob = parseDate(values.dateOfBirth ?? null);
  if (!dob.ok) errors.push(`Date of birth "${parseText(values.dateOfBirth ?? null)}" could not be read`);

  Object.keys(FEE_LABELS).forEach((key) => {
    const parsed = parseNumeric(values[key] ?? null);
    if (!parsed.empty && !parsed.ok) errors.push(`${FEE_LABELS[key]} "${parsed.raw}" is not a number`);
  });

  return {
    rowNum: excelRow,
    firstName,
    lastName,
    gender,
    dateOfBirth: dob.value ? dob.value.toISOString().slice(0, 10) : '',
    class: cls,
    section,
    parentPhone: phone,
    fatherName,
    valid: errors.length === 0,
    errors,
  };
}

export default function StudentImportPage() {
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState('');
  // Which sheet and header row the file was read from — shown so the row numbers in the
  // preview and in any error line up with what the user sees in Excel.
  const [sheetNote, setSheetNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkImport, { isLoading: isImporting }] = useBulkImportStudentsMutation();

  const handleFile = useCallback(async (f: File) => {
    setImportResult(null);
    setParseError('');
    setPreview([]);

    if (!isSupportedSpreadsheet(f)) {
      setFile(null);
      setParseError(`"${f.name}" is not a spreadsheet. Choose an Excel file (.xlsx, .xls) or a .csv file.`);
      return;
    }

    setFile(f);
    try {
      // Shared reader: finds the header row wherever it is (a school name or a blank row
      // above it is normal), matches columns however they're spelled, and picks the sheet
      // that actually holds data. The server repeats exactly this on the uploaded file.
      const workbook = await readWorkbook(f);
      const sheets = summarizeSheets(workbook, STUDENT_FIELDS);
      const sheetName = pickBestSheet(sheets);
      if (!sheetName) {
        setParseError('This file has no sheets with any data in them.');
        setFile(null);
        return;
      }

      const parsed = parseSheet(workbook, sheetName, STUDENT_FIELDS);
      if (!parsed.rows.length) {
        setParseError(
          parsed.missingFields.length
            ? `No student rows found. These columns are needed: ${parsed.missingFields.map((field) => field.label).join(', ')}.`
            : 'No student rows found in this file.'
        );
        setFile(null);
        return;
      }

      setSheetNote(
        parsed.headerRow
          ? `Reading sheet "${sheetName}", headers on row ${parsed.headerRow}.`
          : `Reading sheet "${sheetName}". No header row was recognised, so columns were read in template order.`
      );
      setPreview(parsed.rows.map((row) => buildPreviewRow(row.values, row.excelRow)));
    } catch (err) {
      setFile(null);
      setParseError(
        err instanceof SpreadsheetError
          ? err.message
          : 'Could not read file. Save it as .xlsx or .csv in Excel and try again.'
      );
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
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
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message;
      setParseError(message || 'Import failed. Please try again.');
    }
  };

  const reset = () => {
    setPreview([]);
    setFile(null);
    setImportResult(null);
    setParseError('');
    setSheetNote('');
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
              <p className="font-medium text-gray-700">Drop an Excel or CSV file here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                Required columns: {REQUIRED_COLS.join(', ')} · Optional: Last Name, Date of Birth, Section, Parent Phone, Father Name
              </p>
            </div>
            <input ref={fileInputRef} type="file" accept={IMPORT_FILE_ACCEPT} className="hidden" onChange={onFileChange} />
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
              {sheetNote && <span className="text-xs text-muted-foreground">{sheetNote}</span>}
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
