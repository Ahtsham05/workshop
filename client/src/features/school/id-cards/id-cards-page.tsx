import { useState, useRef, useCallback, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useSelector } from 'react-redux';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useGetStudentsQuery, useGetSchoolClassesQuery } from '@/stores/school.api';
import { Printer, Search, CheckSquare, Square, CreditCard, Users, FlipHorizontal } from 'lucide-react';
import IDCardFront, { type IdCardStudent } from './IDCardFront';
import IDCardBack from './IDCardBack';
import type { RootState } from '@/stores/store';

// ─── Off-screen print content ────────────────────────────────────────────────

interface PrintContentProps {
  students: IdCardStudent[];
  schoolName: string;
  showBothSides: boolean;
}

function PrintContent({ students, schoolName, showBothSides }: PrintContentProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6mm',
        padding: '0',
        background: 'white',
      }}
    >
      {students.map((student) => (
        <div key={student.id} style={{ display: 'flex', flexDirection: 'column', gap: '3mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <IDCardFront student={student} schoolName={schoolName} />
          {showBothSides && <IDCardBack student={student} schoolName={schoolName} />}
        </div>
      ))}
    </div>
  );
}

// ─── Individual card preview (flip front/back on hover toggle) ────────────────

interface CardPreviewProps {
  student: IdCardStudent;
  selected: boolean;
  onToggle: () => void;
  onPrintSingle: () => void;
}

function CardPreview({ student, selected, onToggle, onPrintSingle }: CardPreviewProps) {
  const [showBack, setShowBack] = useState(false);

  return (
    <div className="relative group" style={{ display: 'inline-block' }}>
      {/* Checkbox */}
      <div className={`absolute top-2 left-2 z-10 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <Checkbox checked={selected} onCheckedChange={onToggle} className="bg-white border-blue-400 shadow" />
      </div>

      {/* Hover: flip + print */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <Button size="icon" variant="secondary" className="h-7 w-7 shadow" title="Flip to back" onClick={(e) => { e.stopPropagation(); setShowBack((v) => !v); }}>
          <FlipHorizontal className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="secondary" className="h-7 w-7 shadow" title="Print this card" onClick={(e) => { e.stopPropagation(); onPrintSingle(); }}>
          <Printer className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Card face */}
      <div
        onClick={onToggle}
        className={`cursor-pointer transition-all duration-150 ${
          selected ? 'ring-2 ring-blue-500 ring-offset-2 rounded-[3mm]' : 'hover:ring-1 hover:ring-blue-300 hover:ring-offset-1 rounded-[3mm]'
        }`}
        style={{ display: 'inline-block' }}
      >
        {showBack ? <IDCardBack student={student} /> : <IDCardFront student={student} />}
      </div>

      <div className="text-center mt-1">
        <span className="text-[10px] text-muted-foreground">
          {showBack ? 'Back ↔ click ▲ to flip' : 'Front ↔ click ▲ to flip'}
        </span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IdCardsPage() {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBothSides, setShowBothSides] = useState(true);
  const [printQueue, setPrintQueue] = useState<IdCardStudent[]>([]);

  const activeBranchName = useSelector((state: RootState) => state.auth.activeBranchName);
  const SCHOOL_NAME = activeBranchName || 'School Name';

  const printRef = useRef<HTMLDivElement>(null);

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  const { data: studentsData, isLoading } = useGetStudentsQuery({
    limit: 500,
    status: 'active',
    ...(classFilter ? { classId: classFilter } : {}),
  });

  const allStudents: IdCardStudent[] = studentsData?.results ?? [];
  const classes = classesData?.results ?? [];

  const filtered = allStudents.filter((s) => {
    if (!search) return true;
    const full = `${s.firstName} ${s.lastName || ''} ${s.admissionNumber} ${s.rollNumber || ''}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Student ID Cards',
    pageStyle: `
      @page { size: auto; margin: 5mm; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
  });

  const enqueuePrint = useCallback((students: IdCardStudent[]) => {
    setPrintQueue(students);
  }, []);

  useEffect(() => {
    if (printQueue.length > 0) {
      const t = setTimeout(() => handlePrint(), 80);
      return () => clearTimeout(t);
    }
  }, [printQueue, handlePrint]);

  const toggleOne = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((s) => s.id)));

  const allChecked = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-blue-600" /> Student ID Cards
          </h1>
          <p className="text-sm text-muted-foreground">CR80 (85.6 × 54 mm) — front + back with scannable barcode</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowBothSides((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border font-medium transition-colors ${
              showBothSides ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-500'
            }`}
          >
            <FlipHorizontal className="h-3.5 w-3.5" />
            {showBothSides ? 'Two-sided' : 'Front only'}
          </button>
          {selected.size > 0 && (
            <Button onClick={() => enqueuePrint(filtered.filter((s) => selected.has(s.id)))} className="gap-2 bg-blue-700 hover:bg-blue-800">
              <Printer className="h-4 w-4" /> Print Selected ({selected.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => enqueuePrint(filtered)} disabled={!filtered.length} className="gap-2">
            <Printer className="h-4 w-4" /> Print All ({filtered.length})
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-none border">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name / adm. no. / roll no.…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={classFilter} onValueChange={(v) => setClassFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c: any) => (
                  <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={toggleAll} className="gap-2">
              {allChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allChecked ? 'Deselect All' : 'Select All'}
            </Button>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {filtered.length} student{filtered.length !== 1 ? 's' : ''}
              {selected.size > 0 && <Badge variant="secondary" className="ml-1">{selected.size} selected</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card grid */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading students…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No students found</div>
      ) : (
        <div className="flex flex-wrap gap-5">
          {filtered.map((student) => (
            <CardPreview
              key={student.id}
              student={student}
              selected={selected.has(student.id)}
              onToggle={() => toggleOne(student.id)}
              onPrintSingle={() => enqueuePrint([student])}
            />
          ))}
        </div>
      )}

      {/* Off-screen print target */}
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
        <div ref={printRef}>
          {printQueue.length > 0 && (
            <PrintContent students={printQueue} schoolName={SCHOOL_NAME} showBothSides={showBothSides} />
          )}
        </div>
      </div>
    </div>
  );
}
