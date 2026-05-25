export interface RollSlipStudent {
  id: string;
  firstName: string;
  lastName?: string;
  rollNumber?: string;
  admissionNumber?: string;
  gender?: string;
  photoUrl?: { url?: string } | string;
  className?: string;
  sectionName?: string;
  fatherName?: string;
}

export interface RollSlipSubjectLine {
  sr: number;
  name: string;
  date: string;
}

export interface RollSlipPrintOptions {
  schoolName: string;
  schoolLogo?: string;
  examName: string;
  className: string;
  branchName?: string;
  customNote?: string;
  subjects?: RollSlipSubjectLine[];
  students: RollSlipStudent[];
}

/** Standard examination instructions shown on every roll slip (board style). */
export const DEFAULT_ROLL_SLIP_NOTE = `i) Bring this slip and your School Identity card in the exam hall.
ii) Your registration No. will act as Roll No.
iii) Do not bring any unauthorized material (e.g. written notes, notes in dictionaries, paper, and sticky tape eraser etc.).
iv) Kindly bring all writing material (pen, pencil, eraser, sharpener, pencil colour box and folder) along with you.
v) Giving and taking of anything during paper is strictly prohibited.
vi) All Roll No Slips are issued provisionally; therefore appearance in the exam does not confer any right to a student to claim result of these subjects.`;

/** Merge default rules with any extra note from the user. */
export function buildSlipNote(customNote?: string): string {
  const extra = customNote?.trim();
  if (!extra) return DEFAULT_ROLL_SLIP_NOTE;
  return `${extra}\n\n${DEFAULT_ROLL_SLIP_NOTE}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function photoSrc(student: RollSlipStudent) {
  if (!student.photoUrl) return '';
  if (typeof student.photoUrl === 'string') return student.photoUrl;
  return student.photoUrl.url || '';
}

function slipHtml(student: RollSlipStudent, opts: RollSlipPrintOptions) {
  const name = `${student.firstName} ${student.lastName || ''}`.trim();
  const photo = photoSrc(student);
  const classLabel = student.sectionName
    ? `${student.className} — ${student.sectionName}`
    : student.className || opts.className;
  const noteText = buildSlipNote(opts.customNote);
  const rollNo = student.rollNumber || student.admissionNumber || '—';
  const subjects = opts.subjects || [];

  const subjectRows = subjects.length
    ? subjects
        .map(
          (sub, idx) => `
        <tr>
          <td class="c">${sub.sr}.</td>
          <td>${escapeHtml(sub.name)}</td>
          <td class="c">${escapeHtml(sub.date)}</td>
        </tr>
        ${idx === subjects.length - 1 ? '' : ''}`,
        )
        .join('')
    : `<tr><td colspan="3" class="c empty">No subjects configured</td></tr>`;

  return `
    <div class="slip">
      <div class="head">
        <div class="school">${escapeHtml(opts.schoolName)}</div>
        <div class="branch">(Examination Branch)</div>
        ${opts.branchName ? `<div class="campus">${escapeHtml(opts.branchName)}</div>` : ''}
        <div class="title">Roll No Slip for ${escapeHtml(opts.examName)}</div>
      </div>
      <div class="info-row">
        <div class="info">
          <div class="line"><b>Roll / Registration #:</b> <span class="val">${escapeHtml(rollNo)}</span></div>
          <div class="line"><b>Student Name:</b> <span class="val">${escapeHtml(name)}</span></div>
          <div class="line"><b>Father Name:</b> <span class="val">${escapeHtml(student.fatherName || '—')}</span></div>
          <div class="line"><b>Class:</b> <span class="val">${escapeHtml(classLabel)}</span></div>
          <div class="line"><b>Examination:</b> <span class="val">${escapeHtml(opts.examName)}</span></div>
        </div>
        <div class="photo-wrap">
          ${photo
            ? `<img src="${escapeHtml(photo)}" alt="Student" class="photo" />`
            : `<div class="photo-ph">${escapeHtml(name.charAt(0) || '?')}</div>`}
        </div>
      </div>
      <div class="sheet-head">Date Sheet</div>
      <table class="sheet">
        <thead>
          <tr><th>Sr. No</th><th>Subject</th><th>Date</th></tr>
        </thead>
        <tbody>${subjectRows}</tbody>
      </table>
      <div class="sigs">
        <div class="sig"><div class="line"></div>(Signature of Student)</div>
        <div class="sig"><div class="line"></div>In-Charge Exam Section</div>
      </div>
      <div class="note"><b>Note:</b><br/>${escapeHtml(noteText).replace(/\n/g, '<br/>')}</div>
    </div>
  `;
}

export function buildRollSlipPrintHtml(opts: RollSlipPrintOptions) {
  const slips = opts.students.map((s) => slipHtml(s, opts)).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Roll Slips — ${escapeHtml(opts.examName)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Times New Roman", Times, serif; color: #000; background: #fff; }
    .slip {
      width: 190mm;
      min-height: 270mm;
      margin: 0 auto;
      padding: 10mm 12mm;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
    }
    .slip:last-child { page-break-after: auto; break-after: auto; }
    .head { text-align: center; margin-bottom: 8mm; }
    .school { font-size: 18pt; font-weight: 700; text-transform: uppercase; }
    .branch { font-size: 10pt; margin-top: 2mm; }
    .campus { font-size: 10pt; margin-top: 1mm; }
    .title { font-size: 13pt; font-weight: 700; text-decoration: underline; margin-top: 5mm; text-transform: uppercase; }
    .info-row { display: flex; gap: 8mm; align-items: flex-start; margin-bottom: 6mm; }
    .info { flex: 1; font-size: 12pt; }
    .line { margin-bottom: 7px; }
    .val { display: inline-block; min-width: 180px; border-bottom: 1px solid #000; font-weight: 700; padding-bottom: 1px; }
    .photo-wrap { width: 32mm; height: 40mm; border: 3px double #b45309; padding: 2px; flex-shrink: 0; }
    .photo { width: 100%; height: 100%; object-fit: cover; display: block; }
    .photo-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 22pt; font-weight: 700; background: #f8fafc; }
    .sheet-head { text-align: center; font-weight: 700; text-decoration: underline; font-size: 12pt; margin-bottom: 3mm; text-transform: uppercase; }
    .sheet { width: 100%; border-collapse: collapse; font-size: 11pt; }
    .sheet th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 6px 8px; }
    .sheet td { padding: 5px 8px; }
    .sheet tbody tr:last-child td { border-bottom: 1px solid #000; }
    .c { text-align: center; }
    .empty { font-style: italic; padding: 8px; }
    .sigs { display: flex; justify-content: space-between; margin: 8mm 0 5mm; font-size: 10pt; }
    .sig { width: 40%; text-align: center; }
    .sig .line { border-top: 1px solid #000; margin: 24px 0 4px; }
    .note { font-size: 9pt; line-height: 1.45; font-style: italic; }
    .note b { font-style: normal; }
    @media print {
      .slip { width: auto; min-height: auto; }
    }
  </style>
</head>
<body>${slips}<script>window.onload=()=>window.print();</script></body>
</html>`;
}

export function printRollSlips(opts: RollSlipPrintOptions) {
  if (!opts.students.length) return false;
  const html = buildRollSlipPrintHtml(opts);
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      URL.revokeObjectURL(url);
      return false;
    }
    win.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    return true;
  } catch {
    const win = window.open('', '_blank', 'width=980,height=720');
    if (!win) return false;
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
  }
}
