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
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { Printer, Search, CheckSquare, Square, CreditCard, Users, FlipHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import IDCardFront, { type IdCardStudent } from './IDCardFront';
import IDCardBack from './IDCardBack';
import type { RootState } from '@/stores/store';

// ─── Off-screen print content ────────────────────────────────────────────────
interface CardDesign {
  headerStartColor: string;
  headerEndColor: string;
  titleText: string;
  footerText: string;
  footerStartColor: string;
  footerEndColor: string;
  footerTextColor: string;
  backMessage: string;
  backgroundImage: string;
  showLogo: boolean;
  showClass: boolean;
  showRollNo: boolean;
  showAdmissionNo: boolean;
  showFatherName: boolean;
  showGuardianName: boolean;
  showGuardianPhone: boolean;
  showGender: boolean;
}

interface SavedDesignPreset {
  id: string;
  name: string;
  design: CardDesign;
  updatedAt: string;
}

const DESIGN_STORAGE_KEY = 'school.idCardDesignPresets.v1';

interface PrintContentProps {
  students: IdCardStudent[];
  schoolName: string;
  schoolLogo?: string;
  design: CardDesign;
  showBothSides: boolean;
}

function PrintContent({ students, schoolName, schoolLogo, design, showBothSides }: PrintContentProps) {
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
          <IDCardFront student={student} schoolName={schoolName} schoolLogo={schoolLogo} design={design} />
          {showBothSides && <IDCardBack student={student} schoolName={schoolName} design={design} />}
        </div>
      ))}
    </div>
  );
}

// ─── Individual card preview (flip front/back on hover toggle) ────────────────

interface CardPreviewProps {
  student: IdCardStudent;
  schoolName: string;
  schoolLogo?: string;
  design: CardDesign;
  selected: boolean;
  onToggle: () => void;
  onPrintSingle: () => void;
}

function CardPreview({ student, schoolName, schoolLogo, design, selected, onToggle, onPrintSingle }: CardPreviewProps) {
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
        {showBack ? <IDCardBack student={student} schoolName={schoolName} design={design} /> : <IDCardFront student={student} schoolName={schoolName} schoolLogo={schoolLogo} design={design} />}
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
  const defaultCardDesign: CardDesign = {
    headerStartColor: '#1e3a8a',
    headerEndColor: '#3b82f6',
    titleText: 'STUDENT IDENTITY CARD',
    footerText: 'Valid Academic Year 2025-26',
    footerStartColor: '#1e3a8a',
    footerEndColor: '#2563eb',
    footerTextColor: '#bfdbfe',
    backMessage: 'If found, please return to school',
    backgroundImage: '',
    showLogo: true,
    showClass: true,
    showRollNo: true,
    showAdmissionNo: true,
    showFatherName: true,
    showGuardianName: false,
    showGuardianPhone: true,
    showGender: false,
  };
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBothSides, setShowBothSides] = useState(true);
  const [printQueue, setPrintQueue] = useState<IdCardStudent[]>([]);
  const [cardDesign, setCardDesign] = useState<CardDesign>(defaultCardDesign);
  const [savedDesigns, setSavedDesigns] = useState<SavedDesignPreset[]>([]);
  const [designName, setDesignName] = useState('');
  const [activeDesignId, setActiveDesignId] = useState('');

  const activeBranchName = useSelector((state: RootState) => state.auth.activeBranchName);
  const { data: orgData } = useGetMyOrganizationQuery();
  const SCHOOL_NAME = orgData?.name || activeBranchName || 'School Name';
  const SCHOOL_LOGO = orgData?.logo?.url;

  const printRef = useRef<HTMLDivElement>(null);

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  const { data: studentsData, isLoading } = useGetStudentsQuery({
    limit: 500,
    status: 'active',
    ...(classFilter ? { classId: classFilter } : {}),
  });

  const allStudents: IdCardStudent[] = studentsData?.results ?? [];
  const classes = classesData?.results ?? [];

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DESIGN_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setSavedDesigns(parsed);
    } catch {
      // Ignore corrupted local settings
    }
  }, []);

  const persistDesigns = (next: SavedDesignPreset[]) => {
    setSavedDesigns(next);
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(next));
  };

  const handleBgImageUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCardDesign((prev) => ({ ...prev, backgroundImage: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const handleSaveNewDesign = () => {
    const trimmed = designName.trim();
    if (!trimmed) {
      toast.error('Please enter a design name');
      return;
    }
    const id = crypto.randomUUID();
    const next: SavedDesignPreset[] = [
      { id, name: trimmed, design: cardDesign, updatedAt: new Date().toISOString() },
      ...savedDesigns,
    ];
    persistDesigns(next);
    setActiveDesignId(id);
    toast.success('Design saved');
  };

  const handleUpdateDesign = () => {
    if (!activeDesignId) {
      toast.error('Select a saved design first');
      return;
    }
    const next = savedDesigns.map((d) =>
      d.id === activeDesignId ? { ...d, design: cardDesign, name: designName.trim() || d.name, updatedAt: new Date().toISOString() } : d
    );
    persistDesigns(next);
    toast.success('Design updated');
  };

  const handleLoadDesign = (id: string) => {
    setActiveDesignId(id);
    if (id === 'none') return;
    const found = savedDesigns.find((d) => d.id === id);
    if (!found) return;
    setCardDesign(found.design);
    setDesignName(found.name);
  };

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

      {/* Designer */}
      <Card className="shadow-none border">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Card Designer</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCardDesign(defaultCardDesign);
                setActiveDesignId('');
                setDesignName('');
              }}
            >
              Reset Design
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <div className="md:col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Design Name</p>
              <Input value={designName} onChange={(e) => setDesignName(e.target.value)} placeholder="e.g. Blue 2026 Theme" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Saved Designs</p>
              <Select value={activeDesignId || 'none'} onValueChange={handleLoadDesign}>
                <SelectTrigger><SelectValue placeholder="Load saved design" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {savedDesigns.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" variant="outline" onClick={handleSaveNewDesign}>Save New</Button>
              <Button size="sm" onClick={handleUpdateDesign} disabled={!activeDesignId}>Update</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Header Start</p>
              <Input type="color" value={cardDesign.headerStartColor} onChange={(e) => setCardDesign((prev) => ({ ...prev, headerStartColor: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Header End</p>
              <Input type="color" value={cardDesign.headerEndColor} onChange={(e) => setCardDesign((prev) => ({ ...prev, headerEndColor: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Card Title</p>
              <Input value={cardDesign.titleText} onChange={(e) => setCardDesign((prev) => ({ ...prev, titleText: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Front Footer</p>
              <Input value={cardDesign.footerText} onChange={(e) => setCardDesign((prev) => ({ ...prev, footerText: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Footer Start</p>
              <Input type="color" value={cardDesign.footerStartColor} onChange={(e) => setCardDesign((prev) => ({ ...prev, footerStartColor: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Footer End</p>
              <Input type="color" value={cardDesign.footerEndColor} onChange={(e) => setCardDesign((prev) => ({ ...prev, footerEndColor: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Footer Text Color</p>
              <Input type="color" value={cardDesign.footerTextColor} onChange={(e) => setCardDesign((prev) => ({ ...prev, footerTextColor: e.target.value }))} />
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <p className="text-xs text-muted-foreground mb-1">Back Message</p>
              <Input value={cardDesign.backMessage} onChange={(e) => setCardDesign((prev) => ({ ...prev, backMessage: e.target.value }))} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">Background Image URL</p>
              <Input
                value={cardDesign.backgroundImage}
                onChange={(e) => setCardDesign((prev) => ({ ...prev, backgroundImage: e.target.value }))}
                placeholder="https://... or upload image below"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="w-full">
                <p className="text-xs text-muted-foreground mb-1">Upload Background</p>
                <Input type="file" accept="image/*" onChange={(e) => handleBgImageUpload(e.target.files?.[0])} />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCardDesign((prev) => ({ ...prev, backgroundImage: '' }))}
              >
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 md:col-span-2 lg:col-span-4">
              <label className="text-xs flex items-center gap-2"><Checkbox checked={cardDesign.showLogo} onCheckedChange={(v) => setCardDesign((prev) => ({ ...prev, showLogo: Boolean(v) }))} /> Show Logo</label>
              <label className="text-xs flex items-center gap-2"><Checkbox checked={cardDesign.showClass} onCheckedChange={(v) => setCardDesign((prev) => ({ ...prev, showClass: Boolean(v) }))} /> Show Class</label>
              <label className="text-xs flex items-center gap-2"><Checkbox checked={cardDesign.showRollNo} onCheckedChange={(v) => setCardDesign((prev) => ({ ...prev, showRollNo: Boolean(v) }))} /> Show Roll No.</label>
              <label className="text-xs flex items-center gap-2"><Checkbox checked={cardDesign.showAdmissionNo} onCheckedChange={(v) => setCardDesign((prev) => ({ ...prev, showAdmissionNo: Boolean(v) }))} /> Show Admission No.</label>
              <label className="text-xs flex items-center gap-2"><Checkbox checked={cardDesign.showFatherName} onCheckedChange={(v) => setCardDesign((prev) => ({ ...prev, showFatherName: Boolean(v) }))} /> Show Father Name</label>
              <label className="text-xs flex items-center gap-2"><Checkbox checked={cardDesign.showGuardianName} onCheckedChange={(v) => setCardDesign((prev) => ({ ...prev, showGuardianName: Boolean(v) }))} /> Show Guardian Name</label>
              <label className="text-xs flex items-center gap-2"><Checkbox checked={cardDesign.showGuardianPhone} onCheckedChange={(v) => setCardDesign((prev) => ({ ...prev, showGuardianPhone: Boolean(v) }))} /> Show Guardian Phone</label>
              <label className="text-xs flex items-center gap-2"><Checkbox checked={cardDesign.showGender} onCheckedChange={(v) => setCardDesign((prev) => ({ ...prev, showGender: Boolean(v) }))} /> Show Gender</label>
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
              schoolName={SCHOOL_NAME}
              schoolLogo={SCHOOL_LOGO}
              design={cardDesign}
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
            <PrintContent students={printQueue} schoolName={SCHOOL_NAME} schoolLogo={SCHOOL_LOGO} design={cardDesign} showBothSides={showBothSides} />
          )}
        </div>
      </div>
    </div>
  );
}
