import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

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
}

interface Props {
  student: IdCardStudent;
  schoolName?: string;
  schoolLogo?: string;
  forPrint?: boolean;
}

// CR80 credit-card size: 85.6 × 54 mm ≈ 323 × 204 px at 96 dpi
export default function StudentIdCard({ student, schoolName = 'School Name', schoolLogo, forPrint = false }: Props) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  const fullName = `${student.firstName} ${student.lastName || ''}`.trim();
  const className = student.classId?.name ?? '—';
  const section = student.sectionId?.name;
  const classLabel = section ? `${className} - ${section}` : className;

  useEffect(() => {
    if (barcodeRef.current && student.admissionNumber) {
      try {
        JsBarcode(barcodeRef.current, student.admissionNumber, {
          format: 'CODE128',
          width: 1.4,
          height: 28,
          displayValue: true,
          fontSize: 8,
          margin: 2,
          background: '#ffffff',
          lineColor: '#1e293b',
        });
      } catch {
        // ignore invalid barcode values during render
      }
    }
  }, [student.admissionNumber]);

  const card = (
    <div
      className="id-card relative overflow-hidden rounded-xl border border-blue-200 bg-white shadow-md flex flex-col"
      style={{ width: '323px', height: '204px', fontFamily: 'sans-serif' }}
    >
      {/* Header strip */}
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', minHeight: '44px' }}
      >
        {schoolLogo ? (
          <img src={schoolLogo} alt="logo" className="h-8 w-8 rounded-full object-cover border-2 border-white/60" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
            {schoolName.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-xs leading-tight truncate">{schoolName}</p>
          <p className="text-blue-100 text-[9px]">Student Identity Card</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 px-3 py-2 gap-2.5">
        {/* Photo */}
        <div className="flex-shrink-0">
          {student.photoUrl?.url ? (
            <img
              src={student.photoUrl.url}
              alt={fullName}
              className="rounded border border-gray-200 object-cover"
              style={{ width: '54px', height: '68px' }}
            />
          ) : (
            <div
              className="rounded border border-gray-200 bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-400"
              style={{ width: '54px', height: '68px' }}
            >
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-start gap-0.5">
          <p className="font-bold text-slate-800 text-sm leading-tight truncate">{fullName}</p>
          <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 mt-1">
            <div>
              <p className="text-[8px] text-gray-400 uppercase tracking-wide">Class</p>
              <p className="text-[10px] font-semibold text-slate-700 truncate">{classLabel}</p>
            </div>
            <div>
              <p className="text-[8px] text-gray-400 uppercase tracking-wide">Roll No.</p>
              <p className="text-[10px] font-semibold text-slate-700">{student.rollNumber || '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[8px] text-gray-400 uppercase tracking-wide">Admission No.</p>
              <p className="text-[10px] font-semibold text-slate-700">{student.admissionNumber}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Barcode footer */}
      <div className="flex justify-center pb-1.5">
        <svg ref={barcodeRef} className="max-w-full" />
      </div>
    </div>
  );

  if (forPrint) return card;

  return (
    <div className="inline-block p-1 hover:scale-105 transition-transform duration-150 cursor-default">
      {card}
    </div>
  );
}
