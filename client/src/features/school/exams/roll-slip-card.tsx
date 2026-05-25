import StudentAvatar from '../components/student-avatar';
import type { RollSlipStudent, RollSlipSubjectLine } from './roll-slip-print';
import { buildSlipNote } from './roll-slip-print';

export interface RollSlipCardProps {
  student: RollSlipStudent;
  schoolName: string;
  schoolLogo?: string;
  examName: string;
  className?: string;
  branchName?: string;
  customNote?: string;
  subjects?: RollSlipSubjectLine[];
  variant?: 'preview' | 'print';
}

function InfoLine({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div style={{ marginBottom: compact ? '6px' : '8px', fontSize: compact ? '11px' : '12pt' }}>
      <span style={{ fontWeight: 600 }}>{label}:</span>{' '}
      <span
        style={{
          display: 'inline-block',
          minWidth: compact ? '140px' : '180px',
          borderBottom: '1px solid #000',
          paddingBottom: '1px',
          fontWeight: 700,
        }}
      >
        {value || '—'}
      </span>
    </div>
  );
}

export default function RollSlipCard({
  student,
  schoolName,
  examName,
  className,
  branchName,
  customNote,
  subjects = [],
  variant = 'preview',
}: RollSlipCardProps) {
  const name = `${student.firstName} ${student.lastName || ''}`.trim();
  const classLabel = student.sectionName
    ? `${student.className || className || '—'} — ${student.sectionName}`
    : student.className || className || '—';
  const isPrint = variant === 'print';
  const compact = !isPrint;
  const noteText = buildSlipNote(customNote);
  const rollNo = student.rollNumber || student.admissionNumber || '—';
  const photoUrl = typeof student.photoUrl === 'string' ? student.photoUrl : student.photoUrl?.url;

  return (
    <div
      className="roll-slip-board bg-white text-black"
      style={{
        width: isPrint ? '190mm' : '100%',
        maxWidth: isPrint ? '190mm' : '680px',
        minHeight: isPrint ? '270mm' : undefined,
        padding: isPrint ? '10mm 12mm' : '20px 24px',
        fontFamily: "'Times New Roman', Times, serif",
        pageBreakAfter: isPrint ? 'always' : undefined,
        breakAfter: isPrint ? 'page' : undefined,
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
        margin: isPrint ? '0 auto' : undefined,
        border: compact ? '1px solid #cbd5e1' : undefined,
        boxShadow: compact ? '0 1px 4px rgba(0,0,0,0.08)' : undefined,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: isPrint ? '8mm' : '16px' }}>
        <div
          style={{
            fontSize: isPrint ? '18pt' : '22px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {schoolName}
        </div>
        <div style={{ fontSize: isPrint ? '10pt' : '12px', marginTop: '4px' }}>(Examination Branch)</div>
        {branchName ? (
          <div style={{ fontSize: isPrint ? '10pt' : '12px', marginTop: '2px' }}>{branchName}</div>
        ) : null}
        <div
          style={{
            fontSize: isPrint ? '13pt' : '15px',
            fontWeight: 700,
            textDecoration: 'underline',
            marginTop: isPrint ? '5mm' : '12px',
            textTransform: 'uppercase',
          }}
        >
          Roll No Slip for {examName}
        </div>
      </div>

      {/* Student info + photo */}
      <div style={{ display: 'flex', gap: isPrint ? '8mm' : '16px', alignItems: 'flex-start', marginBottom: isPrint ? '6mm' : '14px' }}>
        <div style={{ flex: 1 }}>
          <InfoLine label="Roll / Registration #" value={rollNo} compact={compact} />
          <InfoLine label="Student Name" value={name} compact={compact} />
          <InfoLine label="Father Name" value={student.fatherName || '—'} compact={compact} />
          <InfoLine label="Class" value={classLabel} compact={compact} />
          <InfoLine label="Examination" value={examName} compact={compact} />
        </div>
        <div
          style={{
            width: isPrint ? '32mm' : '96px',
            height: isPrint ? '40mm' : '120px',
            border: '3px double #b45309',
            padding: '2px',
            flexShrink: 0,
            background: '#fff',
          }}
        >
          <StudentAvatar
            photoUrl={photoUrl}
            gender={student.gender}
            style={{ width: '100%', height: '100%', borderRadius: 0, border: 'none' }}
          />
        </div>
      </div>

      {/* Date sheet */}
      <div style={{ marginBottom: isPrint ? '5mm' : '12px' }}>
        <div
          style={{
            textAlign: 'center',
            fontWeight: 700,
            textDecoration: 'underline',
            fontSize: isPrint ? '12pt' : '14px',
            marginBottom: isPrint ? '3mm' : '8px',
            textTransform: 'uppercase',
          }}
        >
          Date Sheet
        </div>
        {subjects.length ? (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: isPrint ? '11pt' : '13px',
            }}
          >
            <thead>
              <tr>
                <th style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '6px 8px', width: '12%', textAlign: 'center' }}>Sr. No</th>
                <th style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '6px 8px', textAlign: 'left' }}>Subject</th>
                <th style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '6px 8px', width: '28%', textAlign: 'center' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((sub, idx) => (
                <tr key={sub.sr}>
                  <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: idx === subjects.length - 1 ? '1px solid #000' : 'none' }}>
                    {sub.sr}.
                  </td>
                  <td style={{ padding: '5px 8px', borderBottom: idx === subjects.length - 1 ? '1px solid #000' : 'none' }}>
                    {sub.name}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: idx === subjects.length - 1 ? '1px solid #000' : 'none' }}>
                    {sub.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ textAlign: 'center', fontSize: isPrint ? '10pt' : '12px', fontStyle: 'italic', color: '#444' }}>
            No subjects configured for this exam.
          </p>
        )}
      </div>

      {/* Signatures */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: isPrint ? '8mm' : '20px',
          marginBottom: isPrint ? '5mm' : '12px',
          fontSize: isPrint ? '10pt' : '12px',
        }}
      >
        <div style={{ textAlign: 'center', width: '40%' }}>
          <div style={{ borderTop: '1px solid #000', marginBottom: '4px', marginTop: '24px' }} />
          (Signature of Student)
        </div>
        <div style={{ textAlign: 'center', width: '40%' }}>
          <div style={{ borderTop: '1px solid #000', marginBottom: '4px', marginTop: '24px' }} />
          In-Charge Exam Section
        </div>
      </div>

      {/* Note — default exam rules always shown; optional extra from user above them */}
      <div style={{ fontSize: isPrint ? '9pt' : '11px', lineHeight: 1.45, fontStyle: 'italic' }}>
        <div style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: '4px', fontStyle: 'normal' }}>Note:</div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{noteText}</div>
      </div>
    </div>
  );
}
