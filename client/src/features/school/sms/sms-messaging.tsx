import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useGetSchoolSmsStatusQuery,
  useSendSchoolSmsMutation,
  useSendSchoolSmsBulkMutation,
  useSendSchoolSmsToClassMutation,
  useSendSchoolSmsToAllMutation,
  usePreviewSchoolSmsFeeAlertsMutation,
  useSendSchoolSmsFeeAlertsMutation,
  useGetSchoolSmsTemplatesQuery,
  useCreateSchoolSmsTemplateMutation,
  useGetSchoolClassesQuery,
  useGetStudentsQuery,
  type SchoolSmsSendResult,
  type SchoolSmsFeeAlertPreview,
  type SchoolSmsTemplate,
} from '@/stores/school.api';
import { SmsTemplatePicker } from './sms-template-picker';
import { analyzeSms, analyzeSmsTemplate, renderSmsTemplate, type SmsSegmentInfo } from '@/utils/sms-segments';
import { useCurrencyMeta } from '@/lib/format-money';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BookmarkPlus,
  CheckCircle2,
  ClipboardList,
  Eye,
  LayoutTemplate,
  Loader2,
  MessageSquare,
  Phone,
  Send,
  Settings,
  Smartphone,
  Users,
  WifiOff,
  XCircle,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StateIndicator({ connected, hasDevice }: { connected: boolean; hasDevice: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-blue-100 text-blue-700 border-blue-300">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Gateway Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-gray-100 text-gray-600 border-gray-300">
      <WifiOff className="w-3.5 h-3.5" />
      {hasDevice ? 'Phone Offline' : 'No Device'}
    </span>
  );
}

/**
 * The composer's cost readout. SMS bills per segment and one non-GSM character (any Urdu
 * text, a pasted curly quote, an emoji) more than halves the segment size — so the number
 * that actually matters to a school is `segments × recipients`, not the character count.
 */
function SmsMeter({
  info,
  recipients,
  recipientLabel,
  note,
}: {
  info: SmsSegmentInfo;
  recipients: number;
  recipientLabel: string;
  note?: string;
}) {
  const totalSms = info.segments * recipients;
  const unicode = info.encoding === 'UCS-2';
  return (
    <div className="rounded-md border bg-gray-50 px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        <span>
          <span className="font-semibold text-gray-900">{info.characters}</span> characters
        </span>
        <span>
          <span className="font-semibold text-gray-900">{info.segments}</span> segment{info.segments === 1 ? '' : 's'}
          <span className="text-gray-400"> ({info.remaining} left in this one)</span>
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 border font-medium ${
            unicode ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-gray-100 text-gray-600 border-gray-300'
          }`}
        >
          {info.encoding} · {info.perSegment}/segment
        </span>
        <span className="ml-auto">
          <span className="font-semibold text-gray-900">{recipients}</span> {recipientLabel} ·{' '}
          <span className="font-semibold text-blue-700">{totalSms}</span> SMS to be sent
        </span>
      </div>
      {unicode && (
        <p className="text-xs text-amber-700">
          Unicode message ({info.nonGsmSample.join(' ')}) — only {info.perSegment} characters per segment instead of 160.
          Replace these characters to cut the cost roughly in half.
        </p>
      )}
      {note && <p className="text-xs text-gray-500">{note}</p>}
    </div>
  );
}

/**
 * The message as it will land on a parent's phone, with every {placeholder} already
 * resolved against a real recipient. The raw template is what the school edits; this is
 * what it means — and the two are easy to confuse until you see them side by side.
 */
function MessagePreview({
  text,
  recipientLabel,
  empty = 'Type a message or pick a template to see exactly what parents will receive.',
}: {
  text: string;
  recipientLabel?: string;
  empty?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-600">
        Preview — exactly what parents receive
        {recipientLabel ? <span className="font-normal text-gray-400"> (shown for {recipientLabel})</span> : null}
      </p>
      {text.trim() ? (
        <div className="rounded-lg rounded-tl-none border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{text}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-3 py-2">
          <p className="text-sm text-gray-400">{empty}</p>
        </div>
      )}
    </div>
  );
}

/** Buttons that sit above every composer: pick a ready-made wording, or keep your own. */
function ComposerToolbar({
  onOpenTemplates,
  onSaveTemplate,
  canSave,
}: {
  onOpenTemplates: () => void;
  onSaveTemplate: () => void;
  canSave: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onOpenTemplates}>
        <LayoutTemplate className="w-3.5 h-3.5 mr-1.5" />
        Use a template
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onSaveTemplate} disabled={!canSave}>
        <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" />
        Save as template
      </Button>
    </div>
  );
}

const CLASS_CHIP_BASE = 'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors';

function ClassChips({
  classes,
  value,
  onChange,
  accent,
}: {
  classes: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  accent: 'blue' | 'orange';
}) {
  const activeClass = accent === 'blue' ? 'bg-blue-600 text-white border-blue-600' : 'bg-orange-500 text-white border-orange-500';
  const idleClass =
    accent === 'blue'
      ? 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
      : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400';
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      <button type="button" onClick={() => onChange('all')} className={`${CLASS_CHIP_BASE} ${value === 'all' ? activeClass : idleClass}`}>
        All Classes
      </button>
      {classes.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={`${CLASS_CHIP_BASE} ${value === c.id ? activeClass : idleClass}`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function SmsMessaging() {
  const currencySymbol = useCurrencyMeta().symbol;

  // The gateway is a phone running the companion app, so its availability flips on its own
  // (battery, signal, app killed). Polling keeps the badge and the disabled tabs honest
  // without the user having to reload the page.
  const { data: status } = useGetSchoolSmsStatusQuery(undefined, {
    refetchOnFocus: true,
    pollingInterval: 30000,
  });
  const isReady = Boolean(status?.connected);
  const hasDevice = (status?.totalDevices ?? 0) > 0;

  // ── Single message ─────────────────────────────────────────────────────────
  const [singlePhone, setSinglePhone] = useState('');
  const [singleMsg, setSingleMsg] = useState('');
  const [sendSingle, { isLoading: sendingSingle }] = useSendSchoolSmsMutation();

  // ── Broadcast (all / by class) ─────────────────────────────────────────────
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastClass, setBroadcastClass] = useState<string>('all');
  const [sendToAll, { isLoading: sendingAll }] = useSendSchoolSmsToAllMutation();
  const [sendToClass, { isLoading: sendingClass }] = useSendSchoolSmsToClassMutation();

  // ── Fee alerts ─────────────────────────────────────────────────────────────
  const [feeAlertClass, setFeeAlertClass] = useState<string>('all');
  const [feeStatus, setFeeStatus] = useState<string>('pending_overdue');
  const [feeAlertMsg, setFeeAlertMsg] = useState(
    () =>
      `Dear Parent, the {feeType} fee of ${currencySymbol} {amount} for {name} (Month: {month}/{year}) is {status}. Please clear the dues at your earliest. Thank you.`
  );
  const [sendFeeAlerts, { isLoading: sendingFeeAlerts }] = useSendSchoolSmsFeeAlertsMutation();
  const [previewFeeAlerts, { isLoading: previewing }] = usePreviewSchoolSmsFeeAlertsMutation();
  const [feePreview, setFeePreview] = useState<SchoolSmsFeeAlertPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Templates ──────────────────────────────────────────────────────────────
  const { data: templateData } = useGetSchoolSmsTemplatesQuery();
  const [createTemplate, { isLoading: savingTemplate }] = useCreateSchoolSmsTemplateMutation();
  // Which composer the picker / save dialog is acting on, so one dialog serves all tabs.
  const [templateTarget, setTemplateTarget] = useState<'broadcast' | 'fee' | 'bulk' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');

  // ── Bulk custom ───────────────────────────────────────────────────────────
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkDebouncedSearch, setBulkDebouncedSearch] = useState('');
  const [bulkClassFilter, setBulkClassFilter] = useState<string>('all');
  const [bulkSelectedStudents, setBulkSelectedStudents] = useState<any[]>([]);
  const [bulkMsg, setBulkMsg] = useState('');
  const [sendBulk, { isLoading: sendingBulk }] = useSendSchoolSmsBulkMutation();

  // ── Classes ────────────────────────────────────────────────────────────────
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  const classes: { id: string; name: string }[] = (classesData?.results ?? []).map((c: any) => ({
    id: String(c._id ?? c.id ?? ''),
    name: String(c.name ?? ''),
  }));

  const getStudentName = (student: any) =>
    [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim() || undefined;

  // Same roster the send will use, fetched up front purely so the composer can show the
  // real recipient count (and therefore the real SMS count) before anything is dispatched.
  const broadcastLookupParams = useMemo(() => {
    const params: Record<string, any> = { limit: 5000, status: 'active' };
    if (broadcastClass !== 'all') params.classId = broadcastClass;
    return params;
  }, [broadcastClass]);

  const { data: broadcastLookupData } = useGetStudentsQuery(broadcastLookupParams);

  const broadcastAudience = useMemo(() => {
    const students: any[] = broadcastLookupData?.results ?? [];
    const withPhone = students.filter((s) => String(s?.parent?.phone ?? '').trim());
    const longestName = withPhone.reduce(
      (longest, s) => {
        const name = getStudentName(s) ?? '';
        return name.length > longest.length ? name : longest;
      },
      '' as string
    );
    return { total: students.length, withPhone: withPhone.length, longestName };
  }, [broadcastLookupData]);

  useEffect(() => {
    const timer = setTimeout(() => setBulkDebouncedSearch(bulkSearch.trim()), 350);
    return () => clearTimeout(timer);
  }, [bulkSearch]);

  const bulkStudentQueryParams = useMemo(() => {
    const params: Record<string, any> = { search: bulkDebouncedSearch, limit: 12 };
    if (bulkClassFilter !== 'all') params.classId = bulkClassFilter;
    return params;
  }, [bulkDebouncedSearch, bulkClassFilter]);

  const { data: bulkStudentSearchData, isFetching: bulkSearching } = useGetStudentsQuery(bulkStudentQueryParams, {
    skip: bulkDebouncedSearch.length < 2,
  });

  const searchedStudents: any[] = bulkStudentSearchData?.results ?? [];
  const selectedIds = new Set(bulkSelectedStudents.map((s) => String(s?._id ?? s?.id ?? '')));

  // ── Segment maths per tab ──────────────────────────────────────────────────
  const broadcastInfo = useMemo(
    () => analyzeSmsTemplate(broadcastMsg, [{ name: broadcastAudience.longestName || 'Student Name' }]),
    [broadcastMsg, broadcastAudience.longestName]
  );
  const singleInfo = useMemo(() => analyzeSms(singleMsg), [singleMsg]);
  const bulkInfo = useMemo(() => {
    const longest = bulkSelectedStudents.reduce((acc, s) => {
      const name = getStudentName(s) ?? '';
      return name.length > acc.length ? name : acc;
    }, '' as string);
    return analyzeSmsTemplate(bulkMsg, [{ name: longest || 'Student Name' }]);
  }, [bulkMsg, bulkSelectedStudents]);

  // The fee template's placeholders expand differently per parent, so the estimate is taken
  // over the widest row in the preview rather than the raw template.
  const feeInfo = useMemo(() => {
    const samples = (feePreview?.recipients ?? []).slice(0, 50).map((r) => ({
      name: r.name,
      amount: String(r.amount ?? ''),
      month: String(r.month ?? ''),
      year: String(r.year ?? ''),
      feeType: String(r.feeType ?? ''),
      status: String(r.status ?? ''),
    }));
    return analyzeSmsTemplate(
      feeAlertMsg,
      samples.length
        ? samples
        : [{ name: 'Student Name', amount: '12,000', month: '09', year: '2026', feeType: 'Tuition', status: 'overdue' }]
    );
  }, [feeAlertMsg, feePreview]);

  // Placeholder values used for the "exactly what parents receive" previews. Falls back to
  // the server's realistic sample (which already carries this branch's real school name)
  // for any field the chosen student does not have.
  const sampleVars = templateData?.sample ?? {};

  function studentVars(student: any): Record<string, string> {
    if (!student) return sampleVars as Record<string, string>;
    return {
      ...sampleVars,
      name: getStudentName(student) ?? String(sampleVars.name ?? ''),
      class: String(student?.classId?.name ?? student?.class?.name ?? ''),
      section: String(student?.sectionId?.name ?? student?.section?.name ?? ''),
      admissionNo: String(student?.admissionNo ?? ''),
      fatherName: String(student?.parent?.fatherName ?? ''),
    };
  }

  const broadcastSampleStudent = useMemo(
    () => (broadcastLookupData?.results ?? []).find((s: any) => String(s?.parent?.phone ?? '').trim()) ?? null,
    [broadcastLookupData]
  );

  const broadcastPreview = useMemo(
    () => renderSmsTemplate(broadcastMsg, studentVars(broadcastSampleStudent)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [broadcastMsg, broadcastSampleStudent, templateData]
  );

  const bulkPreview = useMemo(
    () => renderSmsTemplate(bulkMsg, studentVars(bulkSelectedStudents[0] ?? null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bulkMsg, bulkSelectedStudents, templateData]
  );

  // For fee alerts the server has already rendered the real thing during preview, so show
  // that verbatim rather than re-deriving it here and risking a mismatch with what is sent.
  const feeRenderedPreview = useMemo(() => {
    const fromServer = feePreview?.recipients?.[0];
    if (fromServer) return fromServer.message;
    return renderSmsTemplate(feeAlertMsg, sampleVars as Record<string, string>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feePreview, feeAlertMsg, templateData]);

  // ── Result state ───────────────────────────────────────────────────────────
  const [lastResult, setLastResult] = useState<(SchoolSmsSendResult & { source?: string; segments?: number }) | null>(
    null
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  function reportError(e: any, fallback: string) {
    toast.error(e?.data?.message || fallback);
  }

  async function handleSendSingle() {
    setLastResult(null);
    if (!singlePhone.trim() || !singleMsg.trim()) {
      toast.error('Enter phone number and message');
      return;
    }
    try {
      await sendSingle({ phone: singlePhone.trim(), message: singleMsg.trim() }).unwrap();
      setLastResult({ total: 1, sent: 1, failed: [], source: 'Single SMS', segments: singleInfo.segments });
      toast.success('SMS handed to the gateway phone — track delivery in the SMS Log');
      setSinglePhone('');
      setSingleMsg('');
    } catch (e: any) {
      reportError(e, 'Failed to send SMS');
    }
  }

  async function handleBroadcast() {
    setLastResult(null);
    if (!broadcastMsg.trim()) {
      toast.error('Enter a message');
      return;
    }
    try {
      const result =
        broadcastClass === 'all'
          ? await sendToAll({ message: broadcastMsg.trim() }).unwrap()
          : await sendToClass({ classId: broadcastClass, message: broadcastMsg.trim() }).unwrap();
      if (result.total === 0) {
        toast.error(result.message || 'No students with parent phone numbers found');
        setLastResult({ ...result, source: 'Broadcast' });
        return;
      }
      setLastResult({
        ...result,
        source: broadcastClass === 'all' ? 'Broadcast (All Classes)' : 'Broadcast (Class)',
        segments: broadcastInfo.segments,
      });
      toast.success(`Queued ${result.sent} of ${result.total} students on the gateway phone`);
    } catch (e: any) {
      reportError(e, 'Broadcast failed');
    }
  }

  function feeAlertPayload() {
    const payload: Record<string, any> = { message: feeAlertMsg.trim() || undefined };
    if (feeAlertClass !== 'all') payload.classId = feeAlertClass;
    if (feeStatus !== 'pending_overdue') payload.feeStatus = feeStatus;
    return payload;
  }

  async function handlePreviewFeeAlerts() {
    try {
      const preview = await previewFeeAlerts(feeAlertPayload()).unwrap();
      setFeePreview(preview);
      setPreviewOpen(true);
      if (preview.total === 0) toast.info('No matching fee vouchers with parent phone numbers');
    } catch (e: any) {
      reportError(e, 'Could not build preview');
    }
  }

  async function handleFeeAlerts() {
    setLastResult(null);
    try {
      const result = await sendFeeAlerts(feeAlertPayload()).unwrap();
      if (result.total === 0) {
        toast.error(result.message || 'No matching fee vouchers with parent phone numbers found');
        setLastResult({ ...result, source: 'Fee Alerts' });
        return;
      }
      setLastResult({ ...result, source: 'Fee Alerts', segments: feeInfo.segments });
      toast.success(`Queued fee alerts to ${result.sent} of ${result.total} parents`);
    } catch (e: any) {
      reportError(e, 'Fee alerts failed');
    }
  }

  async function handleBulkCustom() {
    setLastResult(null);
    if (bulkSelectedStudents.length === 0 || !bulkMsg.trim()) {
      toast.error('Select at least one student and enter a message');
      return;
    }
    // Ids, not phone numbers — the server re-reads each student so {class}, {fatherName}
    // and the rest resolve from the same source the other tabs use.
    const studentIds = bulkSelectedStudents
      .map((student) => String(student?._id ?? student?.id ?? ''))
      .filter(Boolean);

    if (!studentIds.length) {
      toast.error('Selected students could not be identified');
      return;
    }

    try {
      const result = await sendBulk({ studentIds, message: bulkMsg.trim() }).unwrap();
      setLastResult({ ...result, source: 'Bulk Custom', segments: bulkInfo.segments });
      toast.success(`Queued ${result.sent} of ${result.total} recipients`);
    } catch (e: any) {
      reportError(e, 'Bulk send failed');
    }
  }

  function currentComposerText() {
    if (templateTarget === 'fee') return feeAlertMsg;
    if (templateTarget === 'bulk') return bulkMsg;
    return broadcastMsg;
  }

  function applyTemplate(template: SchoolSmsTemplate) {
    // The raw body (with placeholders) goes into the composer, not the filled-in preview —
    // otherwise every parent would get the sample student's name.
    if (templateTarget === 'fee') setFeeAlertMsg(template.body);
    else if (templateTarget === 'bulk') setBulkMsg(template.body);
    else setBroadcastMsg(template.body);
    toast.success(`Template "${template.title}" loaded — edit it however you like`);
  }

  function openPicker(target: 'broadcast' | 'fee' | 'bulk') {
    setTemplateTarget(target);
    setPickerOpen(true);
  }

  function openSave(target: 'broadcast' | 'fee' | 'bulk') {
    setTemplateTarget(target);
    setSaveTitle('');
    setSaveOpen(true);
  }

  async function handleSaveTemplate() {
    const body = currentComposerText().trim();
    if (!saveTitle.trim() || !body) {
      toast.error('Give the template a name and some text');
      return;
    }
    try {
      await createTemplate({
        title: saveTitle.trim(),
        body,
        context: templateTarget === 'fee' ? 'fee_alert' : 'broadcast',
      }).unwrap();
      toast.success('Template saved');
      setSaveOpen(false);
    } catch (e: any) {
      reportError(e, 'Could not save template');
    }
  }

  function handleToggleStudent(student: any) {
    const id = String(student?._id ?? student?.id ?? '');
    if (!id) return;
    if (!String(student?.parent?.phone ?? '').trim()) {
      toast.error('This student does not have a parent phone number');
      return;
    }
    setBulkSelectedStudents((prev) => {
      const exists = prev.some((s) => String(s?._id ?? s?.id ?? '') === id);
      if (exists) return prev.filter((s) => String(s?._id ?? s?.id ?? '') !== id);
      return [...prev, student];
    });
  }

  function removeSelectedStudent(studentId: string) {
    setBulkSelectedStudents((prev) => prev.filter((s) => String(s?._id ?? s?.id ?? '') !== studentId));
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">SMS Messaging</h1>
            <p className="text-sm text-gray-500">Send fee reminders &amp; announcements to parents by SMS</p>
          </div>
        </div>
        <StateIndicator connected={isReady} hasDevice={hasDevice} />
      </div>

      {/* Gateway Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-600" />
            SMS Gateway (Android Device)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isReady ? (
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-blue-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Sending through {status?.deviceName || 'your registered phone'}
                  </span>
                </div>
                {status?.phoneNumber && <p className="text-sm text-gray-600">SIM: {status.phoneNumber}</p>}
                <p className="text-sm text-gray-600">
                  Sent today: <span className="font-medium">{status?.smsSentToday ?? 0}</span> · Total:{' '}
                  <span className="font-medium">{status?.smsSentTotal ?? 0}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/sms/log">
                    <ClipboardList className="w-3.5 h-3.5 mr-1" />
                    SMS Log
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/settings/sms-gateway">
                    <Settings className="w-3.5 h-3.5 mr-1" />
                    Settings
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {hasDevice
                  ? 'Your gateway phone is registered but not connected right now. Open the SMS Gateway app on that phone (and keep it online) to resume sending.'
                  : 'SMS is sent from an Android phone running the SMS Gateway app with your own SIM — no per-message gateway fees, and parents see your school number. Register a device to get started.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" asChild>
                  <Link to="/settings/sms-gateway">
                    <Smartphone className="w-4 h-4 mr-2" />
                    {hasDevice ? 'Manage Devices' : 'Register a Device'}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/sms/log">
                    <ClipboardList className="w-3.5 h-3.5 mr-1" />
                    SMS Log
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Messaging Tabs — disabled when no phone is connected */}
      <Tabs defaultValue="broadcast">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
          <TabsTrigger value="broadcast" disabled={!isReady}>Broadcast</TabsTrigger>
          <TabsTrigger value="fee-alerts" disabled={!isReady}>Fee Alerts</TabsTrigger>
          <TabsTrigger value="single" disabled={!isReady}>Single SMS</TabsTrigger>
          <TabsTrigger value="bulk" disabled={!isReady}>Bulk Custom</TabsTrigger>
        </TabsList>

        {/* ── BROADCAST ── */}
        <TabsContent value="broadcast" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Broadcast to Students / Parents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Filter by Class</Label>
                <ClassChips classes={classes} value={broadcastClass} onChange={setBroadcastClass} accent="blue" />
              </div>
              <ComposerToolbar
                onOpenTemplates={() => openPicker('broadcast')}
                onSaveTemplate={() => openSave('broadcast')}
                canSave={!!broadcastMsg.trim()}
              />
              <div className="space-y-1.5">
                <Label>
                  Message{' '}
                  <span className="text-gray-400 text-xs">
                    placeholders: {'{name}'} {'{class}'} {'{section}'} {'{admissionNo}'} {'{fatherName}'} {'{school}'}
                  </span>
                </Label>
                <Textarea
                  rows={4}
                  placeholder="Type your announcement here…"
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                />
                <MessagePreview
                  text={broadcastPreview}
                  recipientLabel={
                    broadcastSampleStudent ? getStudentName(broadcastSampleStudent) ?? undefined : undefined
                  }
                />
                <SmsMeter
                  info={broadcastInfo}
                  recipients={broadcastAudience.withPhone}
                  recipientLabel="parents"
                  note={
                    broadcastAudience.total > broadcastAudience.withPhone
                      ? `${broadcastAudience.total - broadcastAudience.withPhone} student(s) in this selection have no parent phone on record and will be skipped.`
                      : undefined
                  }
                />
              </div>
              <div className="space-y-2">
                <Button
                  onClick={handleBroadcast}
                  disabled={sendingAll || sendingClass || !broadcastMsg.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                >
                  {sendingAll || sendingClass ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {sendingAll || sendingClass
                    ? 'Sending SMS…'
                    : `Send to ${broadcastClass === 'all' ? 'All Students' : classes.find((c) => c.id === broadcastClass)?.name ?? 'Class'}`}
                </Button>
                {(sendingAll || sendingClass) && (
                  <p className="text-xs text-gray-500">Handing messages to the gateway phone — please wait.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FEE ALERTS ── */}
        <TabsContent value="fee-alerts" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Fee Due / Overdue Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Filter by Class</Label>
                  <ClassChips classes={classes} value={feeAlertClass} onChange={setFeeAlertClass} accent="orange" />
                </div>
                <div className="space-y-1.5">
                  <Label>Fee Status</Label>
                  <Select value={feeStatus} onValueChange={setFeeStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending_overdue">Pending &amp; Overdue</SelectItem>
                      <SelectItem value="pending">Pending only</SelectItem>
                      <SelectItem value="overdue">Overdue only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ComposerToolbar
                onOpenTemplates={() => openPicker('fee')}
                onSaveTemplate={() => openSave('fee')}
                canSave={!!feeAlertMsg.trim()}
              />
              <div className="space-y-1.5">
                <Label>
                  Message Template
                  <span className="ml-2 text-xs text-gray-400">
                    placeholders: {'{name}'} {'{amount}'} {'{month}'} {'{year}'} {'{feeType}'} {'{status}'} {'{class}'}{' '}
                    {'{school}'}
                  </span>
                </Label>
                <Textarea rows={5} value={feeAlertMsg} onChange={(e) => setFeeAlertMsg(e.target.value)} />
                <MessagePreview
                  text={feeRenderedPreview}
                  recipientLabel={feePreview?.recipients?.[0]?.name ?? 'a sample parent'}
                />
                <SmsMeter
                  info={feeInfo}
                  recipients={feePreview?.total ?? 0}
                  recipientLabel="parents"
                  note={
                    feePreview
                      ? `Based on the last preview. One alert per student, using their largest outstanding voucher.`
                      : 'Run “Preview recipients” to see exactly who is on the list and the real SMS count before sending.'
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handlePreviewFeeAlerts} disabled={previewing}>
                  {previewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                  Preview recipients
                </Button>
                <Button
                  onClick={handleFeeAlerts}
                  disabled={sendingFeeAlerts}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {sendingFeeAlerts ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mr-2" />
                  )}
                  {sendingFeeAlerts ? 'Sending alerts…' : 'Send Fee Alerts'}
                </Button>
              </div>
              {sendingFeeAlerts && <p className="text-xs text-gray-500">Handing alerts to the gateway phone — please wait.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SINGLE SMS ── */}
        <TabsContent value="single" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Send to a Single Number
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Phone Number</Label>
                <Input
                  placeholder="e.g. 03001234567 or +923001234567"
                  value={singlePhone}
                  onChange={(e) => setSinglePhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Message</Label>
                <Textarea
                  rows={4}
                  placeholder="Type your message…"
                  value={singleMsg}
                  onChange={(e) => setSingleMsg(e.target.value)}
                />
                <MessagePreview text={singleMsg} empty="Type a message to see exactly what will be received." />
                <SmsMeter info={singleInfo} recipients={singlePhone.trim() ? 1 : 0} recipientLabel="number" />
              </div>
              <Button
                onClick={handleSendSingle}
                disabled={sendingSingle}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
              >
                {sendingSingle ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send SMS
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BULK CUSTOM ── */}
        <TabsContent value="bulk" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Bulk Custom Send to Selected Students
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Filter by Class</Label>
                  <Select value={bulkClassFilter} onValueChange={setBulkClassFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Classes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Search Students</Label>
                  <Input
                    placeholder="Type student name, admission no, or phone..."
                    value={bulkSearch}
                    onChange={(e) => setBulkSearch(e.target.value)}
                  />
                  <p className="text-xs text-gray-400">Type at least 2 characters to search and select multiple students.</p>
                </div>

                {bulkSearch.trim().length >= 2 && (
                  <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
                    {bulkSearching ? (
                      <div className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Searching students...
                      </div>
                    ) : searchedStudents.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No students found</div>
                    ) : (
                      searchedStudents.map((student) => {
                        const studentId = String(student?._id ?? student?.id ?? '');
                        const fullName = getStudentName(student) || 'Unnamed';
                        const parentPhone = String(student?.parent?.phone ?? '').trim();
                        const fatherName = String(student?.parent?.fatherName ?? '').trim();
                        const className = String(student?.class?.name ?? student?.classId?.name ?? '').trim();
                        const sectionName = String(student?.section?.name ?? student?.sectionId?.name ?? '').trim();
                        const admissionNo = String(student?.admissionNo ?? '').trim();
                        return (
                          <button
                            key={studentId}
                            type="button"
                            onClick={() => handleToggleStudent(student)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{fullName}</p>
                              <p className="text-xs text-gray-500 truncate">
                                {admissionNo ? `Adm: ${admissionNo}` : 'Adm: -'} · Class: {className || '-'}
                                {sectionName ? `-${sectionName}` : ''} · Father: {fatherName || '-'}
                              </p>
                              <p className="text-xs text-gray-500 truncate">Parent Phone: {parentPhone || '-'}</p>
                            </div>
                            <span
                              className={`text-xs px-2 py-1 rounded border shrink-0 ${
                                selectedIds.has(studentId)
                                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                                  : 'bg-white text-gray-600 border-gray-300'
                              }`}
                            >
                              {selectedIds.has(studentId) ? 'Selected' : 'Select'}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Selected Students</Label>
                {bulkSelectedStudents.length === 0 ? (
                  <p className="text-sm text-gray-500">No students selected yet.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {bulkSelectedStudents.map((student) => {
                      const studentId = String(student?._id ?? student?.id ?? '');
                      const fullName = getStudentName(student) || 'Unnamed';
                      const fatherName = String(student?.parent?.fatherName ?? '').trim();
                      const parentPhone = String(student?.parent?.phone ?? '').trim();
                      const className = String(student?.class?.name ?? student?.classId?.name ?? '').trim();
                      const sectionName = String(student?.section?.name ?? student?.sectionId?.name ?? '').trim();
                      const admissionNo = String(student?.admissionNo ?? '').trim();
                      return (
                        <div
                          key={studentId}
                          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-blue-900 truncate">{fullName}</p>
                            <p className="text-xs text-blue-800 truncate">
                              {admissionNo ? `Adm: ${admissionNo}` : 'Adm: -'} · Class: {className || '-'}
                              {sectionName ? `-${sectionName}` : ''} · Father: {fatherName || '-'}
                            </p>
                            <p className="text-xs text-blue-800 truncate">Parent Phone: {parentPhone || '-'}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSelectedStudent(studentId)}
                            className="h-7 px-2 text-blue-700 hover:text-blue-800 hover:bg-blue-100 shrink-0"
                          >
                            Remove
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <ComposerToolbar
                onOpenTemplates={() => openPicker('bulk')}
                onSaveTemplate={() => openSave('bulk')}
                canSave={!!bulkMsg.trim()}
              />
              <div className="space-y-1.5">
                <Label>
                  Message{' '}
                  <span className="text-gray-400 text-xs">
                    placeholders: {'{name}'} {'{class}'} {'{section}'} {'{admissionNo}'} {'{fatherName}'} {'{school}'}
                  </span>
                </Label>
                <Textarea
                  rows={4}
                  placeholder="Dear {name}, …"
                  value={bulkMsg}
                  onChange={(e) => setBulkMsg(e.target.value)}
                />
                <MessagePreview
                  text={bulkPreview}
                  recipientLabel={
                    bulkSelectedStudents[0] ? getStudentName(bulkSelectedStudents[0]) ?? undefined : undefined
                  }
                  empty="Select a student and type a message to see exactly what their parent receives."
                />
                <SmsMeter info={bulkInfo} recipients={bulkSelectedStudents.length} recipientLabel="students selected" />
              </div>
              <Button
                onClick={handleBulkCustom}
                disabled={sendingBulk || bulkSelectedStudents.length === 0 || !bulkMsg.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
              >
                {sendingBulk ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send to Selected Students
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Results Panel */}
      {lastResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Send Result{lastResult.source ? ` - ${lastResult.source}` : ''}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <Badge className="bg-blue-100 text-blue-700 border-blue-300 border">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Queued: {lastResult.sent}
              </Badge>
              <Badge
                className={`border ${
                  lastResult.failed.length > 0
                    ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-gray-100 text-gray-600 border-gray-300'
                }`}
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Failed: {lastResult.failed.length}
              </Badge>
              {(lastResult.skipped?.length ?? 0) > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 border">
                  No phone: {lastResult.skipped?.length}
                </Badge>
              )}
              <Badge variant="outline">Total: {lastResult.total}</Badge>
              {lastResult.segments ? (
                <Badge variant="outline">
                  ~{lastResult.segments * lastResult.sent} SMS ({lastResult.segments} segment
                  {lastResult.segments === 1 ? '' : 's'} each)
                </Badge>
              ) : null}
            </div>
            <Separator />
            <p className="text-xs text-gray-500">
              &ldquo;Queued&rdquo; means the gateway phone accepted the message. Carrier delivery status appears in the{' '}
              <Link to="/sms/log" className="text-blue-600 underline">
                SMS Log
              </Link>
              .
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-red-700">Failed</p>
                {lastResult.failed.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {lastResult.failed.map((f, i) => (
                      <div key={i} className="text-xs text-red-800 bg-white rounded px-2 py-1 border border-red-100">
                        <p className="font-medium">{f.name || f.phone || 'Unknown'}</p>
                        <p className="font-mono">{f.phone || '-'}</p>
                        <p className="text-red-600">Reason: {f.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-red-700">No failed messages.</p>
                )}
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-amber-800">Skipped — no parent phone on record</p>
                {(lastResult.skipped?.length ?? 0) > 0 ? (
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {lastResult.skipped?.map((s, i) => (
                      <div key={i} className="text-xs text-amber-900 bg-white rounded px-2 py-1 border border-amber-100">
                        <span className="font-medium">{s.name || 'Unnamed'}</span>
                        {s.admissionNo ? ` · Adm: ${s.admissionNo}` : ''}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-800">Every matched student had a phone number.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <SmsTemplatePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        context={templateTarget === 'fee' ? 'fee_alert' : 'broadcast'}
        onPick={applyTemplate}
      />

      {/* Save current wording as a reusable template */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Keeps this wording in your school's library so you can reuse it next time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Template name</Label>
              <Input
                placeholder="e.g. Monthly fee reminder"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <p className="text-xs text-gray-700 bg-gray-50 border rounded px-2.5 py-2 whitespace-pre-wrap">
                {currentComposerText() || '—'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSaveTemplate}
              disabled={savingTemplate || !saveTitle.trim()}
            >
              {savingTemplate ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fee alert preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Fee alert preview</DialogTitle>
            <DialogDescription>
              {feePreview?.total ?? 0} parent{(feePreview?.total ?? 0) === 1 ? '' : 's'} will receive an SMS ·{' '}
              {feeInfo.segments} segment{feeInfo.segments === 1 ? '' : 's'} each · approx{' '}
              <span className="font-semibold">{feeInfo.segments * (feePreview?.total ?? 0)} SMS</span> · total outstanding{' '}
              {currencySymbol} {Math.round(feePreview?.totalDue ?? 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto space-y-2">
            {(feePreview?.recipients ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">Nobody matches these filters.</p>
            ) : (
              feePreview?.recipients.map((r, i) => (
                <div key={`${r.phone}-${i}`} className="rounded-md border p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{r.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{r.phone}</span>
                  </div>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{r.message}</p>
                </div>
              ))
            )}
            {feePreview?.truncated && (
              <p className="text-xs text-gray-500">Showing the first 200 recipients — all {feePreview.total} will be sent.</p>
            )}
            {(feePreview?.skipped?.length ?? 0) > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5">
                <p className="text-xs font-semibold text-amber-800">
                  {feePreview?.skipped.length} student(s) have dues but no parent phone on record
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  {feePreview?.skipped.map((s) => s.name).filter(Boolean).join(', ')}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
