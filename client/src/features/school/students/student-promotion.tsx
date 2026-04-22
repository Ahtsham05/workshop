import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useGetSchoolClassesQuery,
  useGetSectionsQuery,
  useGetPromotionEligibilityQuery,
  usePromoteStudentsMutation,
} from '@/stores/school.api';
import StudentAvatar from '../components/student-avatar';
import { toast } from 'sonner';
import {
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Users,
  RefreshCcw,
  Info,
} from 'lucide-react';

const PKR = (n: number) => `PKR ${n.toLocaleString('en-PK')}`;

export default function StudentPromotion() {
  const [sourceClassId, setSourceClassId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [targetSectionId, setTargetSectionId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forcePromote, setForcePromote] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [promotionResult, setPromotionResult] = useState<any>(null);
  const [filterEligible, setFilterEligible] = useState<'all' | 'eligible' | 'pending'>('all');

  const { data: classesData, isLoading: loadingClasses } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const classes = (classesData?.results || []).filter((c: any) => c.isActive !== false);

  const {
    data: eligibilityData,
    isLoading: loadingEligibility,
    isFetching: fetchingEligibility,
    refetch,
  } = useGetPromotionEligibilityQuery(sourceClassId, { skip: !sourceClassId });

  const students: any[] = eligibilityData?.results || [];

  const [promoteStudents, { isLoading: promoting }] = usePromoteStudentsMutation();

  // Sections for the target class
  const { data: sectionsData } = useGetSectionsQuery(
    { classId: targetClassId, limit: 50 },
    { skip: !targetClassId }
  );
  const targetSections: any[] = sectionsData?.results || [];

  // Filtered student list for the table
  const filteredStudents = useMemo(() => {
    if (filterEligible === 'eligible') return students.filter((s) => s.isEligible);
    if (filterEligible === 'pending') return students.filter((s) => !s.isEligible);
    return students;
  }, [students, filterEligible]);

  const eligibleCount = students.filter((s) => s.isEligible).length;
  const pendingCount = students.length - eligibleCount;
  const selectedEligibleCount = selectedIds.filter((id) => {
    const s = students.find((st) => (st.id || st._id) === id);
    return s?.isEligible;
  }).length;
  const selectedPendingCount = selectedIds.length - selectedEligibleCount;

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredStudents.map((s) => s.id || s._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const handleSourceChange = (val: string) => {
    setSourceClassId(val);
    setSelectedIds([]);
    setTargetClassId('');
    setTargetSectionId('');
  };

  const handleTargetClassChange = (val: string) => {
    setTargetClassId(val);
    setTargetSectionId(''); // reset section when class changes
  };

  const handlePromoteClick = () => {
    if (!targetClassId) {
      toast.error('Please select a target class');
      return;
    }
    if (selectedIds.length === 0) {
      toast.error('Please select at least one student');
      return;
    }
    if (sourceClassId === targetClassId) {
      toast.error('Source and target class cannot be the same');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmPromote = async () => {
    setConfirmOpen(false);
    try {
      const result = await promoteStudents({
        studentIds: selectedIds,
        targetClassId,
        // 'none' means explicitly no section; empty string means "don't touch section" → backend handles
        targetSectionId: targetSectionId && targetSectionId !== 'none' ? targetSectionId : null,
        forcePromote,
      }).unwrap();

      setPromotionResult(result);
      setResultOpen(true);

      // Refresh the eligibility data for the source class
      if (result.promoted.length > 0) {
        setSelectedIds([]);
        refetch();
        toast.success(`${result.promoted.length} student(s) promoted to ${result.targetClass}`);
      }
    } catch (err: any) {
      toast.error(err?.data?.message || 'Promotion failed');
    }
  };

  const sourceClass = classes.find((c: any) => (c.id || c._id) === sourceClassId);
  const targetClassName = classes.find((c: any) => (c.id || c._id) === targetClassId)?.name || '';

  const allFilteredSelected =
    filteredStudents.length > 0 && filteredStudents.every((s) => selectedIds.includes(s.id || s._id));
  const someFilteredSelected =
    !allFilteredSelected && filteredStudents.some((s) => selectedIds.includes(s.id || s._id));

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Student Promotion
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Check pending fees and promote students to their next class.
          </p>
        </div>
      </div>

      {/* Class selectors */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Classes</CardTitle>
          <CardDescription>Choose the source class and the target class for promotion.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">From Class (Current)</label>
              <Select value={sourceClassId} onValueChange={handleSourceChange} disabled={loadingClasses}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source class…" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c: any) => (
                    <SelectItem key={c.id || c._id} value={c.id || c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-center pb-1">
              <ArrowRight className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">To Class (Target)</label>
              <Select value={targetClassId} onValueChange={handleTargetClassChange} disabled={loadingClasses || !sourceClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target class…" />
                </SelectTrigger>
                <SelectContent>
                  {classes
                    .filter((c: any) => (c.id || c._id) !== sourceClassId)
                    .map((c: any) => (
                      <SelectItem key={c.id || c._id} value={c.id || c._id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Target section selector — only shown when a target class has sections */}
          {targetClassId && targetSections.length > 0 && (
            <div className="mt-4 max-w-xs space-y-1.5">
              <label className="text-sm font-medium">Target Section <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Select value={targetSectionId} onValueChange={setTargetSectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="No section / keep current" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No section assigned</SelectItem>
                  {targetSections.map((s: any) => (
                    <SelectItem key={s.id || s._id} value={s.id || s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats row */}
      {sourceClassId && students.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Students" value={students.length} color="blue" />
          <StatCard label="Fee Cleared" value={eligibleCount} color="green" icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard label="Pending Fees" value={pendingCount} color="red" icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard label="Selected" value={selectedIds.length} color="purple" icon={<Users className="h-4 w-4" />} />
        </div>
      )}

      {/* Student table */}
      {sourceClassId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Students in {sourceClass?.name || '…'}
                </CardTitle>
                <CardDescription>
                  Green = fees cleared · Red = has pending dues
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter chips */}
                {(['all', 'eligible', 'pending'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterEligible(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterEligible === f
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted border-muted-foreground/20 text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'eligible' ? '✓ Cleared' : '⚠ Pending'}
                  </button>
                ))}
                <Button size="sm" variant="outline" onClick={() => refetch()} disabled={fetchingEligibility}>
                  <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${fetchingEligibility ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingEligibility ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCcw className="h-5 w-5 animate-spin mr-2" /> Loading students…
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Users className="h-10 w-10 opacity-20" />
                <p className="text-sm">No students found.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allFilteredSelected || (someFilteredSelected ? 'indeterminate' : false)}
                        onCheckedChange={handleToggleAll}
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Admission #</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-center">Fee Status</TableHead>
                    <TableHead className="text-right">Pending Amount</TableHead>
                    <TableHead className="text-center">Vouchers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((s: any) => {
                    const sid = s.id || s._id;
                    const checked = selectedIds.includes(sid);
                    return (
                      <TableRow
                        key={sid}
                        className={`cursor-pointer ${checked ? 'bg-primary/5' : ''} ${
                          !s.isEligible ? 'hover:bg-red-50/30' : 'hover:bg-green-50/30'
                        }`}
                        onClick={() => handleToggleOne(sid, !checked)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => handleToggleOne(sid, !!v)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StudentAvatar
                              photoUrl={s.photoUrl?.url}
                              gender={s.gender}
                              className="h-8 w-8 rounded-full flex-shrink-0"
                            />
                            <span className="font-medium text-sm">
                              {s.firstName} {s.lastName || ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          #{s.admissionNumber}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.sectionId?.name || '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {s.isEligible ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Cleared
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 border-red-200">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {s.pendingAmount > 0 ? (
                            <span className="font-semibold text-red-600">{PKR(s.pendingAmount)}</span>
                          ) : (
                            <span className="text-emerald-600">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {s.pendingCount > 0 ? (
                            <Badge variant="outline" className="border-red-300 text-red-600">
                              {s.pendingCount}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Promotion action bar */}
      {sourceClassId && students.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 space-y-1">
              <p className="font-semibold text-sm">
                {selectedIds.length} student(s) selected
                {selectedPendingCount > 0 && (
                  <span className="text-red-600 ml-2">
                    · {selectedPendingCount} with pending fees
                  </span>
                )}
              </p>
              {selectedPendingCount > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="force-promote"
                    checked={forcePromote}
                    onCheckedChange={(v) => setForcePromote(!!v)}
                  />
                  <label htmlFor="force-promote" className="text-sm text-red-700 font-medium cursor-pointer">
                    Force promote students with pending fees
                  </label>
                </div>
              )}
              {!forcePromote && selectedPendingCount > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Students with pending fees will be skipped unless you enable force promote.
                </p>
              )}
            </div>
            <Button
              onClick={handlePromoteClick}
              disabled={selectedIds.length === 0 || !targetClassId || promoting}
              size="lg"
              className="shrink-0"
            >
              {promoting ? (
                <><RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> Promoting…</>
              ) : (
                <><GraduationCap className="h-4 w-4 mr-2" /> Promote to {targetClassName || 'Target Class'}</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Confirm Promotion
            </DialogTitle>
            <DialogDescription>
              Please review the promotion details below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">From class</span>
                <span className="font-semibold">{sourceClass?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">To class</span>
                <span className="font-semibold">{targetClassName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Selected students</span>
                <span className="font-semibold">{selectedIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee cleared</span>
                <span className="font-semibold text-emerald-600">{selectedEligibleCount}</span>
              </div>
              {selectedPendingCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">With pending fees</span>
                  <span className="font-semibold text-red-600">{selectedPendingCount}</span>
                </div>
              )}
            </div>

            {forcePromote && selectedPendingCount > 0 && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-700 text-sm">
                  <strong>Force promote is ON.</strong> {selectedPendingCount} student(s) with pending fees will also be promoted.
                </AlertDescription>
              </Alert>
            )}
            {!forcePromote && selectedPendingCount > 0 && (
              <Alert className="border-amber-200 bg-amber-50">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 text-sm">
                  {selectedPendingCount} student(s) with pending fees will be <strong>skipped</strong>.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmPromote} disabled={promoting}>
              {promoting ? (
                <><RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> Promoting…</>
              ) : (
                <><GraduationCap className="h-4 w-4 mr-2" /> Confirm Promotion</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result Dialog */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Promotion Complete
            </DialogTitle>
          </DialogHeader>

          {promotionResult && (
            <div className="space-y-4 py-2">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                  <p className="text-2xl font-bold text-emerald-700">{promotionResult.promoted?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Promoted</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-2xl font-bold text-amber-700">{promotionResult.skipped?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-2xl font-bold text-red-700">{promotionResult.errors?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>

              {/* Skipped students */}
              {promotionResult.skipped?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Skipped (pending fees)
                  </p>
                  <div className="rounded-lg border max-h-36 overflow-y-auto divide-y text-sm">
                    {promotionResult.skipped.map((s: any) => (
                      <div key={s.studentId} className="flex justify-between items-center px-3 py-1.5">
                        <span>{s.name} <span className="text-muted-foreground text-xs">#{s.admissionNumber}</span></span>
                        <span className="text-red-600 text-xs font-semibold">{PKR(s.pendingAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {promotionResult.errors?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-red-700 mb-1.5">Errors</p>
                  <div className="rounded-lg border max-h-24 overflow-y-auto divide-y text-sm">
                    {promotionResult.errors.map((e: any) => (
                      <div key={e.studentId} className="px-3 py-1.5 text-red-600">{e.name}: {e.error}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setResultOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Small helper component ──────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'red' | 'purple';
  icon?: React.ReactNode;
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-violet-50 border-violet-200 text-violet-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium opacity-70">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
