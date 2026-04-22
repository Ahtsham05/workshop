import { useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useGetStudentAdmissionFormQuery } from '@/stores/school.api';
import { Printer, Download, X } from 'lucide-react';
import jsPDF from 'jspdf';

interface Props {
  studentId: string;
  open: boolean;
  onClose: () => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(date?: string | Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function currency(n: number): string {
  return `Rs. ${n.toLocaleString('en-PK')}`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

// ─── A4 sheet component ──────────────────────────────────────────────────────

function A4Sheet({
  data,
  printRef,
}: {
  data: ReturnType<typeof useGetStudentAdmissionFormQuery>['data'];
  printRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!data) return null;

  const { student, parent, academic, fees, school } = data as any;
  const totalFee = (fees.monthlyFee ?? 0) + (fees.transportFee ?? 0) - (fees.discount ?? 0);

  return (
    <div
      ref={printRef}
      id="admission-form-a4"
      className="bg-white text-gray-900"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '12mm 14mm',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontSize: '12px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          borderBottom: '2px solid #1e40af',
          paddingBottom: '10px',
          marginBottom: '12px',
        }}
      >
        {school.logo ? (
          <img src={school.logo} alt="logo" style={{ height: '60px', width: '60px', objectFit: 'contain' }} />
        ) : (
          <div
            style={{
              height: '60px',
              width: '60px',
              borderRadius: '50%',
              background: '#1e40af',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e40af', lineHeight: 1.2 }}>{school.name}</div>
          {school.address && (
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{school.address}</div>
          )}
          {(school.phone || school.email) && (
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              {school.phone && `Tel: ${school.phone}`}
              {school.phone && school.email && '  |  '}
              {school.email && `Email: ${school.email}`}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              background: '#1e40af',
              color: 'white',
              padding: '4px 14px',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.5px',
            }}
          >
            ADMISSION FORM
          </div>
          <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
            No: <span style={{ fontWeight: 600 }}>{student.admissionNumber}</span>
          </div>
          <div style={{ fontSize: '10px', color: '#6b7280' }}>
            Date: {fmt(student.admissionDate)}
          </div>
        </div>
      </div>

      {/* ── Student + Photo row ── */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '14px' }}>
        {/* Left: student info */}
        <div style={{ flex: 1 }}>
          <SectionTitle>Student Information</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <InfoRow label="Full Name" value={`${student.firstName} ${student.lastName}`.trim()} />
            <InfoRow label="Roll Number" value={student.rollNumber || '—'} />
            <InfoRow label="Gender" value={capitalize(student.gender)} />
            <InfoRow label="Date of Birth" value={fmt(student.dateOfBirth)} />
            <InfoRow label="Blood Group" value={student.bloodGroup || '—'} />
            <InfoRow label="Nationality" value={student.nationality || '—'} />
            <InfoRow label="Religion" value={student.religion || '—'} />
            <InfoRow label="Status" value={capitalize(student.status)} />
          </div>
          <SectionTitle style={{ marginTop: '10px' }}>Academic Details</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <InfoRow label="Class" value={academic.className || '—'} />
            <InfoRow label="Section" value={academic.sectionName || '—'} />
            <InfoRow label="Previous School" value={student.previousSchool || '—'} />
          </div>
        </div>

        {/* Right: Photo box */}
        <div
          style={{
            width: '90px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <div
            style={{
              width: '90px',
              height: '110px',
              border: '1.5px solid #d1d5db',
              borderRadius: '4px',
              overflow: 'hidden',
              background: '#f9fafb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {student.photoUrl ? (
              <img src={student.photoUrl} alt="student" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-8 8-8s8 4 8 8" />
              </svg>
            )}
          </div>
          <div style={{ fontSize: '9px', color: '#9ca3af', textAlign: 'center' }}>Photograph</div>
        </div>
      </div>

      {/* ── Parent / Guardian ── */}
      <div style={{ marginBottom: '14px' }}>
        <SectionTitle>Parent / Guardian Information</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <InfoRow label="Father's Name" value={parent.fatherName || '—'} />
          <InfoRow label="Mother's Name" value={parent.motherName || '—'} />
          <InfoRow label="Phone" value={parent.phone || '—'} />
          <InfoRow label="Email" value={parent.email || '—'} />
        </div>
        <InfoRow label="Home Address" value={parent.address || '—'} />
      </div>

      {/* ── Fee Structure ── */}
      <div style={{ marginBottom: '14px' }}>
        <SectionTitle>Fee Structure</SectionTitle>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
          }}
        >
          <thead>
            <tr style={{ background: '#1e40af', color: 'white' }}>
              <th style={TH}>Fee Type</th>
              <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <FeeRow label="Monthly Tuition Fee" amount={fees.monthlyFee} />
            <FeeRow label="Transport Fee" amount={fees.transportFee} stripe />
            <FeeRow label="Admission Fee (One-time)" amount={fees.admissionFee} />
            {fees.discount > 0 && (
              <tr>
                <td style={{ ...TD, color: '#16a34a' }}>Discount</td>
                <td style={{ ...TD, textAlign: 'right', color: '#16a34a' }}>
                  - {currency(fees.discount)}
                </td>
              </tr>
            )}
            <tr style={{ background: '#eff6ff', fontWeight: 700 }}>
              <td style={{ ...TD, borderTop: '2px solid #1e40af' }}>Net Monthly Payable</td>
              <td style={{ ...TD, textAlign: 'right', borderTop: '2px solid #1e40af' }}>{currency(totalFee)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Declaration + Signatures ── */}
      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Declaration</SectionTitle>
        <p style={{ fontSize: '11px', color: '#4b5563', lineHeight: 1.6, borderLeft: '3px solid #1e40af', paddingLeft: '8px' }}>
          I/We hereby declare that the information provided above is true and correct to the best of my/our knowledge.
          I/We agree to abide by the school rules and regulations and consent to the processing of the information for
          administrative purposes.
        </p>
      </div>

      {/* ── Signature row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '30px' }}>
        <SignatureBox label="Parent / Guardian Signature" />
        <SignatureBox label="Student Signature" />
        <SignatureBox label="Admitting Officer" />
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          marginTop: '18px',
          paddingTop: '8px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '9px',
          color: '#9ca3af',
        }}
      >
        <span>Generated on {new Date().toLocaleDateString('en-PK')} — {school.name}</span>
        <span>Admission No: {student.admissionNumber}</span>
      </div>
    </div>
  );
}

// ─── small helpers ───────────────────────────────────────────────────────────

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        color: '#1e40af',
        background: '#eff6ff',
        padding: '3px 8px',
        borderRadius: '2px',
        marginBottom: '6px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '6px', borderBottom: '1px dashed #e5e7eb', padding: '3px 2px', alignItems: 'baseline' }}>
      <span style={{ fontSize: '10px', color: '#6b7280', width: '120px', flexShrink: 0 }}>{label}:</span>
      <span style={{ fontSize: '12px', fontWeight: 500, color: '#111827' }}>{value}</span>
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '6px 10px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.4px',
};

const TD: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '12px',
  borderBottom: '1px solid #e5e7eb',
};

function FeeRow({ label, amount, stripe }: { label: string; amount: number; stripe?: boolean }) {
  return (
    <tr style={{ background: stripe ? '#f9fafb' : 'white' }}>
      <td style={TD}>{label}</td>
      <td style={{ ...TD, textAlign: 'right' }}>{currency(amount)}</td>
    </tr>
  );
}

function SignatureBox({ label }: { label: string }) {
  return (
    <div style={{ borderTop: '1.5px solid #374151', paddingTop: '4px' }}>
      <div style={{ fontSize: '10px', color: '#6b7280', textAlign: 'center' }}>{label}</div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function AdmissionFormPrint({ studentId, open, onClose }: Props) {
  const { data, isLoading } = useGetStudentAdmissionFormQuery(studentId, { skip: !open });
  const printRef = useRef<HTMLDivElement | null>(null);

  const handlePrint = useCallback(() => {
    const el = document.getElementById('admission-form-a4');
    if (!el) return;

    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) return;

    // Gather all styles from the parent document
    const styles = Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules)
            .map((r) => r.cssText)
            .join('\n');
        } catch {
          return '';
        }
      })
      .join('\n');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Admission Form - ${(data as any)?.student?.admissionNumber ?? ''}</title>
          <style>
            ${styles}
            @page { size: A4; margin: 0; }
            body { margin: 0; background: white; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>${el.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
  }, [data]);

  const handleDownloadPDF = useCallback(async () => {
    const el = document.getElementById('admission-form-a4');
    if (!el) return;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    await pdf.html(el, {
      callback: (doc) => {
        doc.save(`admission-form-${(data as any)?.student?.admissionNumber ?? 'student'}.pdf`);
      },
      x: 0,
      y: 0,
      width: 210,
      windowWidth: el.scrollWidth,
    });
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[900px] w-full max-h-[95vh] flex flex-col gap-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between px-5 py-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">Admission Form Preview</DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPDF}
              disabled={isLoading || !data}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={isLoading || !data}
              className="gap-1.5 bg-blue-700 hover:bg-blue-800 text-white"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 bg-gray-100 p-4">
          {isLoading && (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Loading admission form…
            </div>
          )}
          {!isLoading && !data && (
            <div className="flex items-center justify-center h-64 text-destructive">
              Failed to load admission form data.
            </div>
          )}
          {!isLoading && data && (
            <div className="flex justify-center shadow-lg">
              <A4Sheet data={data} printRef={printRef} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
