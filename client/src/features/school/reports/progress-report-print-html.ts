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
  examTitle: string;
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
  const { schoolName, examTitle, student, attendance, exam } = data;
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

  const css = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page {
  size: A4 portrait;
  margin: 8mm 10mm;
}

html, body {
  width: 210mm;
  margin: 0;
  padding: 0;
  background: #fff;
  font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
  font-size: 9pt;
  color: #111827;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 190mm;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 3mm;
}

/* ── Header Banner ─────────────────────────────────────── */
.banner {
  background: linear-gradient(160deg, #0a2e1a 0%, #14532d 50%, #166534 100%);
  color: #fff;
  padding: 5mm 8mm 4.5mm;
  border-radius: 2mm;
  position: relative;
  overflow: hidden;
  border-bottom: 4px solid #ca8a04;
}
.banner::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 8px,
    rgba(255,255,255,0.025) 8px,
    rgba(255,255,255,0.025) 16px
  );
  pointer-events: none;
}
.banner-inner { position: relative; text-align: center; }
.school-em {
  font-size: 18pt;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  line-height: 1.15;
  text-shadow: 0 2px 6px rgba(0,0,0,0.35);
}
.divider-line {
  width: 60mm;
  height: 1px;
  background: rgba(255,255,255,0.35);
  margin: 2mm auto;
}
.report-tag {
  font-size: 8pt;
  font-weight: 600;
  letter-spacing: 3px;
  text-transform: uppercase;
  opacity: 0.85;
}
.exam-chip {
  display: inline-block;
  margin-top: 2.5mm;
  background: #fefce8;
  color: #713f12;
  font-size: 10pt;
  font-weight: 800;
  padding: 1.5mm 12mm;
  border-radius: 999px;
  border: 2px solid #ca8a04;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  letter-spacing: 0.3px;
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
  height: 6mm;
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
  font-size: 8.5pt;
  table-layout: fixed;
}
table.marks thead tr {
  background: linear-gradient(180deg, #15803d 0%, #166534 100%);
  color: #fff;
}
table.marks th {
  padding: 2.5px 4px;
  font-weight: 700;
  text-align: center;
  border: 1px solid #14532d;
  font-size: 8pt;
}
table.marks th:first-child, table.marks th:nth-child(2) { text-align: left; }
table.marks td {
  border: 1px solid #d1d5db;
  padding: 2px 4px;
  text-align: center;
  height: 6mm;
  vertical-align: middle;
}
table.marks td.sn { width: 6%; color: #6b7280; font-size: 7.5pt; }
table.marks td.sname { text-align: left; font-weight: 500; width: 35%; }
table.marks td.tc { font-size: 8.5pt; }
table.marks td.grade-cell { font-size: 9pt; }
table.marks tr.total-row td {
  background: #dcfce7;
  font-weight: 800;
  border-color: #15803d;
  border-width: 1.5px;
  font-size: 9pt;
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
  font-size: 8.5pt;
  padding: 2mm;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.habits-leg {
  display: flex;
  justify-content: center;
  gap: 6mm;
  font-size: 7pt;
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
  font-size: 6pt;
  font-weight: 700;
  text-align: center;
  padding: 1mm 0.5mm;
  color: #14532d;
  border-bottom: 1px solid #86efac;
  line-height: 1.15;
  text-transform: uppercase;
}
.habit-b { height: 7mm; background: #fff; }

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
.sig-line { border-top: 1.5px solid #374151; margin-top: 10mm; padding-top: 1.5mm; font-weight: 700; color: #111; }

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
  .page { width: 190mm !important; }
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
      <div class="school-em">${esc(schoolName)}</div>
      <div class="divider-line"></div>
      <div class="report-tag">Student Progress Report</div>
      <div class="exam-chip">${esc(examTitle)}</div>
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

  const doP = () => {
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

  if ((iframe.contentDocument?.readyState ?? '') === 'complete') {
    setTimeout(doP, 400);
  } else {
    iframe.onload = () => setTimeout(doP, 400);
  }
}
