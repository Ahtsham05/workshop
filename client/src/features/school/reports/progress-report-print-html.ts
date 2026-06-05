/**
 * A4 portrait print for Student Progress Report.
 * Uses a hidden iframe so no popup permission is needed.
 */

const HABIT_ITEMS = [
  'PUNCTUAL',
  'REGULAR',
  'ISLAMIC MANNERS',
  'SPOKEN ENGLISH',
  'NEATNESS',
  'PRAYERS',
  'WELL BEHAVED',
  'ACTIVITIES\nPARTICIPATION',
  'ATTENTIVE IN CLASS',
  'SOCIAL',
  'CONFIDENT',
  'GET SIGN DIARY',
];

function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blank(width = '20mm'): string {
  return `<span class="blank" style="min-width:${width}"></span>`;
}

function ptmField(label: string, value?: string | number, filled?: boolean): string {
  const v =
    filled && value !== undefined && value !== ''
      ? `<b>${esc(value)}</b>`
      : blank('16mm');
  return `<div class="ptm-field"><span class="ptm-lbl">${esc(label)}:</span>&nbsp;${v}</div>`;
}

function infoCell(label: string, value?: string): string {
  const v = value && value.trim() ? `<span class="iv">${esc(value)}</span>` : blank('28mm');
  return `<div class="ic"><span class="ik">${esc(label)}</span>${v}</div>`;
}

export type ProgressReportPrintInput = {
  schoolName: string;
  campusName?: string | null;
  examTitle: string;
  schoolLogo?: string | null;
  student: {
    firstName: string;
    lastName?: string;
    admissionNumber: string;
    rollNumber?: string;
    gender?: string;
    photoUrl?: string | null;
    className: string;
    sectionName?: string;
    parent?: { fatherName?: string; phone?: string };
  };
  attendance: {
    total: number;
    present: number;
    hasRecords?: boolean;
  };
  classStrength?: number;
  exam: {
    subjects: Array<{
      subjectName: string;
      totalMarks: number;
      obtainedMarks: number | null;
      percentage: number | null;
      grade: string;
      isAbsent?: boolean;
    }>;
    totalMax: number;
    totalObtained: number;
    percentage: number;
    grade: string;
    highestPercentageInClass?: number | null;
  } | null;
};

function gradeColor(g: string): string {
  const map: Record<string, string> = {
    'A+': '#1b5e20', A: '#2e7d32', B: '#1565c0', C: '#e65100',
    D: '#bf360c', E: '#4a148c', F: '#b71c1c', AB: '#455a64',
  };
  return map[g] || '#263238';
}

export function buildProgressReportPrintHtml(data: ProgressReportPrintInput): string {
  const { campusName, examTitle, schoolLogo, student, attendance, exam } = data;
  const schoolName = (data.schoolName || '').replace(/\s+/g, ' ').trim();
  const campusLine = campusName?.trim()
    ? `<div class="school-campus">${esc(campusName.trim())}</div>`
    : '';
  const fullName = `${student.firstName} ${student.lastName || ''}`.trim();
  const classLabel = `${student.className}${student.sectionName ? ` — ${student.sectionName}` : ''}`;
  const attHas = (attendance.hasRecords ?? false) || attendance.total > 0;
  const classHas = (data.classStrength ?? 0) > 0;

  const subjects = exam?.subjects ?? [];
  const examPct = exam?.percentage ?? 0;
  const examGrade = exam?.grade ?? '—';
  const examObtained = exam?.totalObtained ?? 0;
  const examMax = exam?.totalMax ?? 0;
  const highestInClass = exam?.highestPercentageInClass ?? null;
  const highestInClassDisplay =
    highestInClass !== null && highestInClass !== undefined ? `${highestInClass}%` : blank('16mm');

  const subjectRows = subjects.map((sub, i) => {
    const bg = i % 2 === 0 ? '#fafff8' : '#fff';
    const gc = gradeColor(sub.grade);
    return `
    <tr style="background:${bg}">
      <td class="sn">${i + 1}</td>
      <td class="sname">${esc(sub.subjectName)}</td>
      <td class="tc">${sub.totalMarks}</td>
      <td class="tc">${sub.isAbsent ? 'ABS' : esc(sub.obtainedMarks ?? '—')}</td>
      <td class="tc">${sub.isAbsent || sub.percentage === null ? '—' : `${sub.percentage}%`}</td>
      <td class="tc grade-cell" style="color:${gc};font-weight:800">${esc(sub.grade)}</td>
    </tr>`;
  }).join('');

  const ptmRows = [1, 2, 3].map(n => `
    <tr>
      <td class="ptc">${n}</td>
      <td class="ptc">${blank('100%')}</td>
      <td class="ptc" style="font-size:6.5pt">Y ☐&nbsp; N ☐</td>
      <td class="ptc">${blank('100%')}</td>
    </tr>`).join('');

  const habitCells = HABIT_ITEMS.map(h => `
    <div class="habit">
      <div class="habit-h">${esc(h.replace('\n', ' '))}</div>
      <div class="habit-b"></div>
    </div>`).join('');

  const photoSrc: string | null = (() => {
    const u = student.photoUrl;
    if (!u) return null;
    if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('blob:')) return u;
    return u.startsWith('/') ? u : null;
  })();

  const photoBlock = photoSrc
    ? `<img src="${esc(photoSrc)}" class="photo-img" alt="Photo" />`
    : `<div class="photo-ph"><svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" width="36" height="36"><circle cx="12" cy="7" r="4"/><path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/></svg></div>`;

  const logoSrc: string | null = (() => {
    const u = schoolLogo;
    if (!u) return null;
    if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('blob:')) return u;
    return u.startsWith('/') ? u : null;
  })();

  const schoolLogoHtml = logoSrc
    ? `<img src="${esc(logoSrc)}" class="logo-img" alt="Logo" />`
    : `<svg class="logo-ph" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" width="40" height="40"><path d="M12 3L2 9l10 6 10-6-10-6z"/><path d="M2 17l10 6 10-6"/><path d="M2 13l10 6 10-6"/></svg>`;

  const css = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page {
  size: A4 portrait;
  margin: 10mm 6mm 6mm 6mm;
}

html, body {
  width: 210mm;
  margin: 0;
  padding: 0;
  background: #fff;
  font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
  font-size: 10pt;
  color: #111827;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 198mm;
  min-height: 281mm;
  margin: 0 auto;
  padding-top: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 3.5mm;
}

/* ── Header Banner ─────────────────────────────────────── */
.banner {
  background: linear-gradient(135deg, #064e1e 0%, #0f5e26 40%, #1a7a35 100%);
  color: #fff;
  padding: 5mm 7mm 5mm;
  border-radius: 2.5mm;
  position: relative;
  overflow: hidden;
  border-bottom: 4px solid #ca8a04;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.banner::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 70% at 70% 50%, rgba(255,255,255,0.04) 0%, transparent 65%);
  pointer-events: none;
}
.banner-inner { position: relative; z-index: 1; }

/* Logo (left) + text block (right) */
.banner-top {
  display: flex;
  align-items: center;
  gap: 3mm;
}
.banner-top .logo-img {
  height: 34mm;
  width: auto;
  max-width: 38mm;
  margin: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  display: block;
  flex-shrink: 0;
  object-fit: contain;
  object-position: center;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.banner-top .logo-img.logo-unprocessed {
  mix-blend-mode: darken;
}
.banner-top .logo-ph {
  height: 34mm;
  width: auto;
  margin: 0;
  padding: 0;
  flex-shrink: 0;
}

.school-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
}
.school-em {
  font-size: 26pt;
  font-weight: 900;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  line-height: 1.05;
  text-shadow: 0 2px 8px rgba(0,0,0,0.45);
  white-space: nowrap;
}
.school-campus {
  margin-top: 1mm;
  font-size: 11pt;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  opacity: 0.92;
  line-height: 1.2;
}

/* Thin gold divider with ◆ — centered in school-block */
.banner-divider {
  position: relative;
  width: 70%;
  height: 1.5px;
  background: linear-gradient(90deg, rgba(202,138,4,0.9), rgba(255,255,255,0.5), rgba(202,138,4,0.9));
  margin: 3mm auto 3mm;
}
.banner-diamond {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  color: #ca8a04;
  font-size: 8pt;
  line-height: 1;
  padding: 0 2mm;
  background: linear-gradient(135deg, #064e1e 0%, #0f5e26 40%, #1a7a35 100%);
}

/* Sub row: report title left, assessment pill right */
.banner-sub {
  display: flex;
  align-items: center;
  gap: 4mm;
}
.report-tag {
  font-size: 10.5pt;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  opacity: 0.93;
  white-space: nowrap;
  flex: 1;
}
.exam-pill {
  font-size: 10pt;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.3px;
  border: 1.8px solid rgba(202,138,4,0.9);
  padding: 1mm 5mm;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── PTM Section ───────────────────────────────────────── */
.ptm-wrap {
  display: flex;
  border: 1.5px solid #166534;
  border-radius: 1.5mm;
  overflow: hidden;
  font-size: 8pt;
}
.ptm-left {
  flex: 1;
  padding: 2mm 3mm;
  background: #f0fdf4;
  border-right: 1.5px solid #166534;
}
.ptm-title {
  text-align: center;
  font-weight: 700;
  font-size: 7.5pt;
  text-transform: uppercase;
  color: #14532d;
  margin-bottom: 2mm;
  letter-spacing: 0.5px;
}
.ptm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 4mm; }
.ptm-field { display: flex; align-items: center; gap: 1mm; }
.ptm-lbl { font-weight: 600; white-space: nowrap; color: #374151; }
.ptm-table { width: 44%; border-collapse: collapse; font-size: 8pt; background: #fff; }
.ptc {
  border: 1px solid #86efac;
  padding: 1px 3px;
  text-align: center;
  height: 7mm;
  vertical-align: middle;
}
.ptm-table thead .ptc {
  background: #166534;
  color: #fff;
  font-weight: 700;
  height: auto;
  padding: 2px 3px;
}

/* ── Student Info ──────────────────────────────────────── */
.student-box {
  display: flex;
  gap: 3mm;
  padding: 2.5mm;
  border: 1.5px solid #d1d5db;
  border-radius: 1.5mm;
  background: #f9fafb;
  align-items: center;
}
.photo-wrap {
  width: 19mm;
  height: 24mm;
  border: 2px solid #166534;
  border-radius: 1mm;
  overflow: hidden;
  flex-shrink: 0;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.photo-img { width: 100%; height: 100%; object-fit: cover; }
.photo-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.info-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5mm 6mm;
  font-size: 8.5pt;
}
.ic { display: flex; flex-direction: column; gap: 0.5mm; }
.ik { font-size: 7pt; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; }
.iv { font-weight: 700; color: #111827; }

/* ── Marks + Remarks ───────────────────────────────────── */
.main-row { display: flex; gap: 2mm; align-items: stretch; }
.results { flex: 1; min-width: 0; }

table.marks {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
  table-layout: fixed;
}
table.marks thead tr {
  background: linear-gradient(180deg, #15803d 0%, #166534 100%);
  color: #fff;
}
table.marks th {
  padding: 3px 4px;
  font-weight: 700;
  text-align: center;
  border: 1px solid #14532d;
  font-size: 9pt;
}
table.marks th:first-child, table.marks th:nth-child(2) { text-align: left; }
table.marks td {
  border: 1px solid #d1d5db;
  padding: 2.5px 4px;
  text-align: center;
  height: 7mm;
  vertical-align: middle;
}
table.marks td.sn { width: 6%; color: #6b7280; font-size: 8.5pt; }
table.marks td.sname { text-align: left; font-weight: 500; width: 35%; font-size: 9.5pt; }
table.marks td.tc { font-size: 9.5pt; }
table.marks td.grade-cell { font-size: 10pt; }
table.marks tr.total-row td {
  background: #dcfce7;
  font-weight: 800;
  border-color: #15803d;
  border-width: 1.5px;
  font-size: 10pt;
}

.summary {
  display: flex;
  gap: 2mm;
  margin-top: 2mm;
}
.sum-box {
  flex: 1;
  border: 1.5px solid #15803d;
  border-radius: 1.5mm;
  padding: 2mm 1mm;
  text-align: center;
  background: linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%);
}
.sum-lbl { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; color: #15803d; letter-spacing: 0.5px; }
.sum-val { font-size: 13pt; font-weight: 800; color: #14532d; margin-top: 1mm; }

.remarks {
  width: 30mm;
  flex-shrink: 0;
  border: 1.5px solid #15803d;
  border-radius: 1.5mm;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.rem-h {
  background: linear-gradient(180deg, #15803d 0%, #166534 100%);
  color: #fff;
  text-align: center;
  font-weight: 700;
  font-size: 8pt;
  padding: 2mm;
}
.rem-body {
  flex: 1;
  padding: 2mm;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: #fff;
}
.rem-line { flex: 1; border-bottom: 1px solid #d1d5db; min-height: 5mm; }
.rem-sigs { padding: 1.5mm; border-top: 1px solid #d1d5db; display: flex; flex-direction: column; gap: 2.5mm; }
.rem-sig { text-align: center; font-size: 6.5pt; color: #374151; }
.rem-sig::before { content: ''; display: block; border-top: 1px solid #374151; margin-bottom: 1mm; margin-top: 5mm; }

/* ── Habits ────────────────────────────────────────────── */
.habits {
  border: 1.5px solid #15803d;
  border-radius: 1.5mm;
  overflow: hidden;
}
.habits-h {
  background: linear-gradient(90deg, #14532d, #15803d);
  color: #fff;
  text-align: center;
  font-weight: 700;
  font-size: 9pt;
  padding: 2mm;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.habits-leg {
  display: flex;
  justify-content: center;
  gap: 6mm;
  font-size: 7.5pt;
  padding: 1.5mm;
  background: #f0fdf4;
  border-bottom: 1px solid #bbf7d0;
  color: #14532d;
  font-weight: 600;
}
.habits-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5mm;
  padding: 2mm;
  background: #fafafa;
}
.habit { border: 1px solid #86efac; border-radius: 1mm; overflow: hidden; }
.habit-h {
  background: linear-gradient(180deg, #bbf7d0 0%, #a7f3d0 100%);
  font-size: 7.5pt;
  font-weight: 700;
  text-align: center;
  padding: 1.5mm 0.5mm;
  color: #14532d;
  border-bottom: 1px solid #86efac;
  line-height: 1.2;
  text-transform: uppercase;
}
.habit-b { height: 9mm; background: #fff; }

/* ── Signatures ────────────────────────────────────────── */
.sigs {
  display: flex;
  gap: 0;
  padding-top: 0;
  border-top: 1px dashed #9ca3af;
  margin-top: 1mm;
  padding-top: 2mm;
}
.sig { flex: 1; text-align: center; font-size: 8pt; padding: 0 3mm; }
.sig-line { border-top: 1.5px solid #374151; margin-top: 12mm; padding-top: 1.5mm; font-weight: 700; color: #111; }

/* ── Utility ───────────────────────────────────────────── */
.blank {
  display: inline-block;
  border-bottom: 1px solid #374151;
  min-width: 14mm;
  height: 1em;
  vertical-align: bottom;
}

@media print {
  html, body { width: 210mm !important; margin: 0 !important; padding: 0 !important; }
  .page {
    width: 198mm !important;
    min-height: auto !important;
    justify-content: flex-start !important;
    margin: 0 auto !important;
    padding-top: 0 !important;
    transform: scale(1.04);
    transform-origin: top center;
  }
  .sigs { display: none !important; }
}
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${esc(schoolName)} – ${esc(examTitle)}</title>
<style>${css}</style>
</head>
<body>
<div class="page">

  <!-- Banner -->
  <header class="banner">
    <div class="banner-inner">
      <div class="banner-top">
        ${schoolLogoHtml}
        <div class="school-block">
          <div class="school-em">${esc(schoolName)}</div>
          ${campusLine}
          <div class="banner-divider"><span class="banner-diamond">◆</span></div>
          <div class="banner-sub">
            <span class="report-tag">Student Progress Report</span>
            <span class="exam-pill">${esc(examTitle)}</span>
          </div>
        </div>
      </div>
    </div>
  </header>

  <!-- PTM -->
  <div class="ptm-wrap">
    <div class="ptm-left">
      <div class="ptm-title">Parent's Teacher Meeting Record</div>
      <div class="ptm-grid">
        ${ptmField('Month', undefined, false)}
        ${ptmField('Class Strength', data.classStrength, classHas)}
        ${ptmField('Working Days', attendance.total, attHas)}
        ${ptmField('Days Present', attendance.present, attHas)}
      </div>
    </div>
    <table class="ptm-table">
      <thead><tr>
        <td class="ptc">Sr.</td><td class="ptc">Date</td>
        <td class="ptc">Att.</td><td class="ptc">Name</td>
      </tr></thead>
      <tbody>${ptmRows}</tbody>
    </table>
  </div>

  <!-- Student Info -->
  <div class="student-box">
    <div class="photo-wrap">${photoBlock}</div>
    <div class="info-grid">
      ${infoCell('Student Name', fullName)}
      ${infoCell('Roll No.', student.rollNumber)}
      ${infoCell('Admission No.', student.admissionNumber)}
      ${infoCell('Class', classLabel)}
      ${infoCell("Father's Name", student.parent?.fatherName)}
      ${infoCell('Contact', student.parent?.phone)}
    </div>
  </div>

  <!-- Marks + Remarks -->
  <div class="main-row">
    <div class="results">
      <table class="marks">
        <thead>
          <tr>
            <th style="width:6%">#</th>
            <th style="width:35%;text-align:left">Subject</th>
            <th style="width:13%">Max</th>
            <th style="width:13%">Obt.</th>
            <th style="width:11%">%age</th>
            <th style="width:12%">Grade</th>
          </tr>
        </thead>
        <tbody>
          ${subjectRows}
          <tr class="total-row">
            <td class="sn"></td>
            <td class="sname" style="font-weight:800">GRAND TOTAL</td>
            <td class="tc">${examMax}</td>
            <td class="tc">${examObtained}</td>
            <td class="tc">${examPct}%</td>
            <td class="tc grade-cell" style="color:${gradeColor(examGrade)};font-weight:800">${esc(examGrade)}</td>
          </tr>
        </tbody>
      </table>

      <div class="summary">
        <div class="sum-box">
          <div class="sum-lbl">Percentage</div>
          <div class="sum-val">${examPct}%</div>
        </div>
        <div class="sum-box">
          <div class="sum-lbl">Grade</div>
          <div class="sum-val" style="color:${gradeColor(examGrade)}">${esc(examGrade)}</div>
        </div>
        <div class="sum-box">
          <div class="sum-lbl">Highest % in Class</div>
          <div class="sum-val">${highestInClassDisplay}</div>
        </div>
      </div>
    </div>

    <div class="remarks">
      <div class="rem-h">Remarks</div>
      <div class="rem-body">
        <div class="rem-line"></div>
        <div class="rem-line"></div>
        <div class="rem-line"></div>
        <div class="rem-line"></div>
        <div class="rem-line"></div>
      </div>
      <div class="rem-sigs">
        <div class="rem-sig">Teacher's Sig.</div>
        <div class="rem-sig">Principal's Sig.</div>
        <div class="rem-sig">Parent's Sig.</div>
      </div>
    </div>
  </div>

  <!-- Habits -->
  <div class="habits">
    <div class="habits-h">Individual, Social and Study Habits</div>
    <div class="habits-leg">
      <span>★ Always — Excellent</span>
      <span>✓ Often — Good</span>
      <span>✗ Occasionally — Pay Attention</span>
    </div>
    <div class="habits-grid">${habitCells}</div>
  </div>

  <!-- Signatures -->
  <div class="sigs">
    <div class="sig"><div class="sig-line">Class Teacher</div></div>
    <div class="sig"><div class="sig-line">Principal</div></div>
    <div class="sig"><div class="sig-line">Parent / Guardian</div></div>
  </div>

</div>
</body>
</html>`;
}

/** Multiple students — one A4 page per report, no pop-up */
export function buildBulkProgressReportPrintHtml(inputs: ProgressReportPrintInput[]): string {
  if (!inputs.length) return '';
  if (inputs.length === 1) return buildProgressReportPrintHtml(inputs[0]);

  const firstHtml = buildProgressReportPrintHtml(inputs[0]);
  const css = firstHtml.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? '';
  const pageBreakCss = `
.page + .page { page-break-before: always; break-before: page; }
.page { page-break-inside: avoid; break-inside: avoid; }
.page:last-child { page-break-after: auto; break-after: auto; }
`;
  const bodies = inputs
    .map((d) => {
      const html = buildProgressReportPrintHtml(d);
      return html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1]?.trim() ?? '';
    })
    .filter(Boolean);

  const title = `${esc(inputs[0].schoolName)} – Class Progress Reports`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>${css}${pageBreakCss}</style>
</head>
<body>
${bodies.join('\n')}
</body>
</html>`;
}

/** Banner green — matches header mid-tone */
const BANNER_LOGO_BG = { r: 15, g: 94, b: 38 };

function isLogoBackdropPixel(r: number, g: number, b: number): boolean {
  const { r: br, g: bg, b: bb } = BANNER_LOGO_BG;
  const lum = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const distBanner = Math.hypot(r - br, g - bg, b - bb);
  if (lum >= 215 && spread <= 50) return true;
  if (distBanner < 55 && spread < 70) return true;
  if (g > r + 6 && g > b + 6 && lum >= 35 && lum <= 200 && distBanner < 85) return true;
  return false;
}

function recolorLogoOnCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): string | null {
  try {
    const full = document.createElement('canvas');
    full.width = width;
    full.height = height;
    const ctx = full.getContext('2d');
    if (!ctx) return null;
    const { r: br, g: bg, b: bb } = BANNER_LOGO_BG;
    ctx.fillStyle = `rgb(${br},${bg},${bb})`;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (isLogoBackdropPixel(r, g, b)) {
          d[i] = br;
          d[i + 1] = bg;
          d[i + 2] = bb;
          d[i + 3] = 255;
        } else if (d[i + 3] > 20) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    if (maxX <= minX || maxY <= minY) {
      return full.toDataURL('image/png');
    }

    const pad = 2;
    const x0 = Math.max(0, minX - pad);
    const y0 = Math.max(0, minY - pad);
    const w = Math.min(width - x0, maxX - minX + 1 + pad * 2);
    const h = Math.min(height - y0, maxY - minY + 1 + pad * 2);
    const cropped = document.createElement('canvas');
    cropped.width = w;
    cropped.height = h;
    const cctx = cropped.getContext('2d');
    if (!cctx) return full.toDataURL('image/png');
    cctx.fillStyle = `rgb(${br},${bg},${bb})`;
    cctx.fillRect(0, 0, w, h);
    cctx.drawImage(full, x0, y0, w, h, 0, 0, w, h);
    return cropped.toDataURL('image/png');
  } catch {
    return null;
  }
}

function resolveLogoFetchUrl(logoUrl: string): string {
  if (logoUrl.startsWith('http') || logoUrl.startsWith('data:') || logoUrl.startsWith('blob:')) {
    return logoUrl;
  }
  const base = window.location.origin;
  return logoUrl.startsWith('/') ? `${base}${logoUrl}` : `${base}/${logoUrl}`;
}

function loadLogoBitmap(absolute: string): Promise<ImageBitmap | null> {
  const viaImage = (crossOrigin?: string) =>
    new Promise<ImageBitmap | null>((resolve) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.onload = () => {
        createImageBitmap(img).then(resolve).catch(() => resolve(null));
      };
      img.onerror = () => resolve(null);
      img.src = absolute;
    });
  return (async () => {
    let bitmap = await viaImage();
    if (!bitmap) bitmap = await viaImage('anonymous');
    if (bitmap) return bitmap;
    try {
      const res = await fetch(absolute, { credentials: 'include' });
      if (!res.ok) return null;
      return await createImageBitmap(await res.blob());
    } catch {
      return null;
    }
  })();
}

export async function processBannerLogoUrl(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl?.trim()) return null;
  if (logoUrl.startsWith('data:image/png')) return logoUrl;
  const bitmap = await loadLogoBitmap(resolveLogoFetchUrl(logoUrl));
  if (!bitmap) return null;
  const dataUrl = recolorLogoOnCanvas(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return dataUrl;
}

function injectProcessedLogoIntoHtml(html: string, rawLogoUrl: string, processedDataUrl: string): string {
  const escapedRaw = esc(rawLogoUrl);
  if (html.includes(`src="${escapedRaw}"`)) {
    return html.replace(`src="${escapedRaw}"`, `src="${processedDataUrl}"`);
  }
  const escapedAbs = esc(resolveLogoFetchUrl(rawLogoUrl));
  if (html.includes(`src="${escapedAbs}"`)) {
    return html.replace(`src="${escapedAbs}"`, `src="${processedDataUrl}"`);
  }
  return html;
}

export async function buildProgressReportPrintHtmlReady(
  data: ProgressReportPrintInput,
): Promise<string> {
  let html = buildProgressReportPrintHtml(data);
  if (data.schoolLogo) {
    const processed = await processBannerLogoUrl(data.schoolLogo);
    if (processed) {
      html = injectProcessedLogoIntoHtml(html, data.schoolLogo, processed);
    } else {
      html = html.replace('class="logo-img"', 'class="logo-img logo-unprocessed"');
    }
  }
  return html;
}

export async function buildBulkProgressReportPrintHtmlReady(
  inputs: ProgressReportPrintInput[],
): Promise<string> {
  if (!inputs.length) return '';
  if (inputs.length === 1) return buildProgressReportPrintHtmlReady(inputs[0]);

  const logo = inputs[0]?.schoolLogo;
  const processed = logo ? await processBannerLogoUrl(logo) : null;
  const bodies: string[] = [];
  for (const d of inputs) {
    let part = buildProgressReportPrintHtml(d);
    if (processed && d.schoolLogo) {
      part = injectProcessedLogoIntoHtml(part, d.schoolLogo, processed);
    } else if (d.schoolLogo) {
      part = part.replace('class="logo-img"', 'class="logo-img logo-unprocessed"');
    }
    const body = part.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1]?.trim();
    if (body) bodies.push(body);
  }
  const firstHtml = buildProgressReportPrintHtml(inputs[0]);
  const css = firstHtml.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? '';
  const pageBreakCss = `
.page + .page { page-break-before: always; break-before: page; }
.page { page-break-inside: avoid; break-inside: avoid; }
.page:last-child { page-break-after: auto; break-after: auto; }
`;
  const title = `${esc(inputs[0].schoolName)} – Class Progress Reports`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>${css}${pageBreakCss}</style>
</head>
<body>
${bodies.join('\n')}
</body>
</html>`;
}

async function prepareProgressReportPrint(doc: Document): Promise<void> {
  const photoImgs = Array.from(doc.querySelectorAll<HTMLImageElement>('.photo-img'));
  await Promise.all(
    photoImgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  );
}

/** Print via hidden iframe — no popup permission required */
export function openProgressReportPrint(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const doPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* swallow */
    }
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* gone */ }
    }, 60_000);
  };

  const run = () => {
    void prepareProgressReportPrint(doc).then(() => setTimeout(doPrint, 150));
  };

  if ((iframe.contentDocument?.readyState ?? '') === 'complete') {
    setTimeout(run, 100);
  } else {
    iframe.onload = () => setTimeout(run, 100);
  }
}
