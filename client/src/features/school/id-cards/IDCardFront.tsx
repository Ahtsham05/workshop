/**
 * IDCardFront — CR80 (85.6 × 54 mm) front face
 * For screen use: 323 × 204 px at 96 dpi
 */
export interface IdCardStudent {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName?: string;
  rollNumber?: string;
  gender?: string;
  photoUrl?: { url?: string };
  classId?: { name?: string } | null;
  sectionId?: { name?: string } | null;
  parent?: {
    phone?: string;
    guardianName?: string;
    fatherName?: string;
  } | null;
}

interface Props {
  student: IdCardStudent;
  schoolName?: string;
  schoolLogo?: string;
  design?: {
    headerStartColor?: string;
    headerEndColor?: string;
    titleText?: string;
    footerText?: string;
    footerStartColor?: string;
    footerEndColor?: string;
    footerTextColor?: string;
    backgroundImage?: string;
    showLogo?: boolean;
    showClass?: boolean;
    showRollNo?: boolean;
    showAdmissionNo?: boolean;
    showFatherName?: boolean;
    showGuardianName?: boolean;
    showGuardianPhone?: boolean;
    showGender?: boolean;
  };
}

import StudentAvatar from '../components/student-avatar';

export default function IDCardFront({
  student,
  schoolName = 'School Name',
  schoolLogo,
  design,
}: Props) {
  const fullName = `${student.firstName} ${student.lastName || ''}`.trim();
  const className = student.classId?.name ?? '—';
  const section = student.sectionId?.name;
  const classLabel = section ? `${className} - ${section}` : className;

  const titleText = design?.titleText || 'STUDENT IDENTITY CARD';
  const footerText = design?.footerText || 'Valid Academic Year 2025-26';
  const showLogo = design?.showLogo ?? true;
  const showClass = design?.showClass ?? true;
  const showRollNo = design?.showRollNo ?? true;
  const showAdmissionNo = design?.showAdmissionNo ?? true;
  const showFatherName = design?.showFatherName ?? true;
  const showGuardianName = design?.showGuardianName ?? false;
  const showGuardianPhone = design?.showGuardianPhone ?? true;
  const showGender = design?.showGender ?? false;
  const fatherName = student.parent?.fatherName || student.parent?.guardianName || '—';
  const guardianName = student.parent?.guardianName || student.parent?.fatherName || '—';

  return (
    <div
      className="id-card-front bg-white overflow-hidden flex flex-col"
      style={{
        width: '85.6mm',
        height: '54mm',
        fontFamily: "'Arial', sans-serif",
        border: '1px solid #bfdbfe',
        borderRadius: '3mm',
        boxSizing: 'border-box',
        backgroundImage: design?.backgroundImage ? `url(${design.backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* ── Header ────────────────────────────────────── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${design?.headerStartColor || '#1e3a8a'} 0%, ${design?.headerEndColor || '#3b82f6'} 100%)`,
          padding: '2.5mm 3mm',
          display: 'flex',
          alignItems: 'center',
          gap: '2mm',
          minHeight: '13mm',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        {showLogo && schoolLogo ? (
          <img
            src={schoolLogo}
            alt="logo"
            style={{ width: '9mm', height: '9mm', borderRadius: '50%', objectFit: 'cover', border: '0.5mm solid rgba(255,255,255,0.6)', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: '9mm', height: '9mm', borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 'bold', fontSize: '4.5mm', flexShrink: 0,
            }}
          >
            {schoolName.charAt(0)}
          </div>
        )}
        {/* School info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'white', fontWeight: '800', fontSize: '3.2mm', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
            {schoolName}
          </div>
          <div style={{ color: '#bfdbfe', fontSize: '2.2mm', letterSpacing: '0.3mm' }}>
            {titleText}
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', flex: 1,
          padding: '2mm 3mm', gap: '2.5mm',
          alignItems: 'flex-start',
        }}
      >
        {/* Photo box */}
        <StudentAvatar
          photoUrl={student.photoUrl?.url}
          gender={student.gender}
          style={{ width: '15mm', height: '19mm', borderRadius: '1.5mm', border: '0.5mm solid #cbd5e1', flexShrink: 0 }}
        />

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: '800', fontSize: '3.8mm', color: '#0f172a', marginBottom: '2mm', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
            {fullName}
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {showClass && <tr>
                <td style={{ fontSize: '2mm', color: '#94a3b8', textTransform: 'uppercase', paddingRight: '1.5mm', paddingBottom: '1mm', letterSpacing: '0.2mm', width: '20mm' }}>Class</td>
                <td style={{ fontSize: '2.6mm', fontWeight: '700', color: '#1e293b', paddingBottom: '1mm' }}>{classLabel}</td>
              </tr>}
              {showRollNo && <tr>
                <td style={{ fontSize: '2mm', color: '#94a3b8', textTransform: 'uppercase', paddingRight: '1.5mm', paddingBottom: '1mm', letterSpacing: '0.2mm' }}>Roll No.</td>
                <td style={{ fontSize: '2.6mm', fontWeight: '700', color: '#1e293b', paddingBottom: '1mm' }}>{student.rollNumber || '—'}</td>
              </tr>}
              {showAdmissionNo && <tr>
                <td style={{ fontSize: '2mm', color: '#94a3b8', textTransform: 'uppercase', paddingRight: '1.5mm', letterSpacing: '0.2mm' }}>Adm. No.</td>
                <td style={{ fontSize: '2.6mm', fontWeight: '700', color: '#2563eb' }}>{student.admissionNumber}</td>
              </tr>}
              {showFatherName && <tr>
                <td style={{ fontSize: '2mm', color: '#94a3b8', textTransform: 'uppercase', paddingRight: '1.5mm', letterSpacing: '0.2mm' }}>Father</td>
                <td style={{ fontSize: '2.4mm', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '0' }}>{fatherName}</td>
              </tr>}
              {showGuardianName && <tr>
                <td style={{ fontSize: '2mm', color: '#94a3b8', textTransform: 'uppercase', paddingRight: '1.5mm', letterSpacing: '0.2mm' }}>Guardian</td>
                <td style={{ fontSize: '2.4mm', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '0' }}>{guardianName}</td>
              </tr>}
              {showGuardianPhone && <tr>
                <td style={{ fontSize: '2mm', color: '#94a3b8', textTransform: 'uppercase', paddingRight: '1.5mm', letterSpacing: '0.2mm' }}>Guardian #</td>
                <td style={{ fontSize: '2.4mm', fontWeight: '700', color: '#1e293b' }}>{student.parent?.phone || '—'}</td>
              </tr>}
              {showGender && <tr>
                <td style={{ fontSize: '2mm', color: '#94a3b8', textTransform: 'uppercase', paddingRight: '1.5mm', letterSpacing: '0.2mm' }}>Gender</td>
                <td style={{ fontSize: '2.4mm', fontWeight: '700', color: '#1e293b' }}>{student.gender || '—'}</td>
              </tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer strip ──────────────────────────────── */}
      <div
        style={{
          background: `linear-gradient(90deg, ${design?.footerStartColor || '#1e3a8a'}, ${design?.footerEndColor || '#2563eb'})`,
          padding: '0.8mm 3mm',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ color: design?.footerTextColor || '#bfdbfe', fontSize: '1.8mm' }}>{footerText}</span>
        <span style={{ color: design?.footerTextColor || '#bfdbfe', fontSize: '1.8mm' }}>&#9679; &#9679; &#9679;</span>
      </div>
    </div>
  );
}
