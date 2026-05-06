/**
 * IDCardBack — CR80 (85.6 × 54 mm) back face
 * Dominated by a large scannable CODE128 barcode.
 */
import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import type { IdCardStudent } from './IDCardFront';

interface Props {
  student: IdCardStudent;
  schoolName?: string;
  schoolPhone?: string;
  design?: {
    backMessage?: string;
  };
}

export default function IDCardBack({ student, schoolName = 'School Name', schoolPhone, design }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && student.admissionNumber) {
      try {
        JsBarcode(svgRef.current, student.admissionNumber, {
          format: 'CODE128',
          width: 2.8,          // thicker bars = higher scannability
          height: 62,          // tall for easy scanning
          displayValue: true,
          text: student.admissionNumber,
          fontSize: 11,
          fontOptions: 'bold',
          margin: 8,           // quiet zone
          background: '#ffffff',
          lineColor: '#000000',
          textAlign: 'center',
          textPosition: 'bottom',
          textMargin: 3,
        });
      } catch {
        // barcode value issue — skip silently
      }
    }
  }, [student.admissionNumber]);

  const backMessage = design?.backMessage || 'If found, please return to school';

  return (
    <div
      className="id-card-back bg-white overflow-hidden flex flex-col items-center justify-between"
      style={{
        width: '85.6mm',
        height: '54mm',
        fontFamily: "'Arial', sans-serif",
        border: '1px solid #e2e8f0',
        borderRadius: '3mm',
        boxSizing: 'border-box',
        padding: '2mm 3mm',
      }}
    >
      {/* Top: school name small */}
      <div style={{ textAlign: 'center', marginTop: '0.5mm' }}>
        <span style={{ fontSize: '2.4mm', fontWeight: '700', color: '#1e3a8a', letterSpacing: '0.3mm', textTransform: 'uppercase' }}>
          {schoolName}
        </span>
      </div>

      {/* Center: large barcode */}
      <div
        style={{
          background: '#ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', flex: 1,
          padding: '0 2mm',
        }}
      >
        <svg ref={svgRef} style={{ maxWidth: '100%', display: 'block' }} />
      </div>

      {/* Bottom text */}
      <div style={{ textAlign: 'center', paddingBottom: '0.5mm' }}>
        <div style={{ fontSize: '2mm', color: '#475569', fontStyle: 'italic', letterSpacing: '0.1mm' }}>
          {backMessage}
        </div>
        {schoolPhone && (
          <div style={{ fontSize: '2mm', color: '#2563eb', fontWeight: '600', marginTop: '0.5mm' }}>
            &#9742; {schoolPhone}
          </div>
        )}
      </div>
    </div>
  );
}
