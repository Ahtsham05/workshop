import { useState, useEffect, useRef, useMemo } from 'react';
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
  useGetWhatsAppStatusQuery,
  useConnectWhatsAppMutation,
  useDisconnectWhatsAppMutation,
  useClearWhatsAppSessionMutation,
  useSendWhatsAppMessageMutation,
  useSendWhatsAppBulkMutation,
  useSendWhatsAppToClassMutation,
  useSendWhatsAppToAllMutation,
  useSendWhatsAppFeeAlertsMutation,
  useGetSchoolClassesQuery,
  useGetStudentsQuery,
} from '@/stores/school.api';
import { toast } from 'sonner';
import {
  MessageCircle,
  Wifi,
  WifiOff,
  QrCode,
  Send,
  Users,
  AlertTriangle,
  Phone,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StateIndicator({ state }: { state: string }) {
  const map: Record<string, { label: string; color: string; Icon: any }> = {
    READY:                  { label: 'Connected', color: 'bg-green-100 text-green-700 border-green-300', Icon: CheckCircle2 },
    QR_READY:               { label: 'Scan QR', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', Icon: QrCode },
    LOADING:                { label: 'Connecting…', color: 'bg-blue-100 text-blue-700 border-blue-300', Icon: Loader2 },
    AUTH_FAILURE:           { label: 'Auth Failed', color: 'bg-red-100 text-red-700 border-red-300', Icon: XCircle },
    DISCONNECTED:           { label: 'Disconnected', color: 'bg-gray-100 text-gray-600 border-gray-300', Icon: WifiOff },
    SERVERLESS_UNSUPPORTED: { label: 'Not Available', color: 'bg-orange-100 text-orange-700 border-orange-300', Icon: AlertTriangle },
  };
  const cfg = map[state] ?? map.DISCONNECTED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.color}`}>
      <cfg.Icon className={`w-3.5 h-3.5 ${state === 'LOADING' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function WhatsAppMessaging() {
  // Poll only while user is actively connecting on this page.
  const [connectingActive, setConnectingActive] = useState(false);
  const [pollInterval, setPollInterval] = useState(0);
  const { data: status } = useGetWhatsAppStatusQuery(undefined, {
    pollingInterval: pollInterval,
    refetchOnFocus: connectingActive,
    refetchOnReconnect: connectingActive,
  });

  useEffect(() => {
    if (!connectingActive) {
      setPollInterval(0);
      return;
    }
    const s = status?.state;
    if (s === 'READY' || s === 'AUTH_FAILURE' || s === 'SERVERLESS_UNSUPPORTED' || s === 'INIT_FAILED') {
      setPollInterval(0);
      if (s === 'READY' || s === 'AUTH_FAILURE' || s === 'INIT_FAILED') {
        setConnectingActive(false);
      }
    } else {
      setPollInterval(3000);
    }
  }, [status?.state, connectingActive]);

  const [connect, { isLoading: connecting }] = useConnectWhatsAppMutation();
  const [disconnect, { isLoading: disconnecting }] = useDisconnectWhatsAppMutation();
  const [clearSession, { isLoading: clearingSession }] = useClearWhatsAppSessionMutation();

  // ── Pending-connect guard ──────────────────────────────────────────────────
  // After clicking Connect, the server takes 1-3 s to transition from DISCONNECTED
  // → LOADING. Without this, the next status poll returns DISCONNECTED and the UI
  // flips back to the Connect button before the real state arrives.
  const [pendingConnect, setPendingConnect] = useState(false);
  useEffect(() => {
    // Once server acknowledges the connection attempt, clear our local flag
    if (status?.state && status.state !== 'DISCONNECTED') {
      setPendingConnect(false);
    }
  }, [status?.state]);

  // Derive effective state: while we're waiting for server confirmation after
  // clicking Connect, treat it as LOADING so UI stays in "connecting" view.
  const state =
    pendingConnect && (!status?.state || status.state === 'DISCONNECTED')
      ? 'LOADING'
      : (status?.state ?? 'DISCONNECTED');
  const isReady = state === 'READY';

  // ── Loading elapsed-time tracker ───────────────────────────────────────────
  // Tracks how many seconds we have been in LOADING so we can show a helpful
  // "taking too long?" retry button after 20 s.
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const loadingElapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (state === 'LOADING') {
      setLoadingElapsed(0);
      if (!loadingElapsedRef.current) {
        loadingElapsedRef.current = setInterval(() => {
          setLoadingElapsed((n) => n + 1);
        }, 1000);
      }
    } else {
      setLoadingElapsed(0);
      if (loadingElapsedRef.current) {
        clearInterval(loadingElapsedRef.current);
        loadingElapsedRef.current = null;
      }
    }
    return () => {};
  }, [state]);
  useEffect(() => {
    return () => {
      if (loadingElapsedRef.current) clearInterval(loadingElapsedRef.current);
    };
  }, []);

  // ── Single message ─────────────────────────────────────────────────────────
  const [singlePhone, setSinglePhone] = useState('');
  const [singleMsg, setSingleMsg] = useState('');
  const [sendSingle, { isLoading: sendingSingle }] = useSendWhatsAppMessageMutation();

  // ── Broadcast (all / by class) ─────────────────────────────────────────────
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastClass, setBroadcastClass] = useState<string>('all');
  const [sendToAll, { isLoading: sendingAll }] = useSendWhatsAppToAllMutation();
  const [sendToClass, { isLoading: sendingClass }] = useSendWhatsAppToClassMutation();

  // ── Fee alerts ─────────────────────────────────────────────────────────────
  const [feeAlertClass, setFeeAlertClass] = useState<string>('all');
  const [feeStatus, setFeeStatus] = useState<string>('pending_overdue');
  const [feeAlertMsg, setFeeAlertMsg] = useState(
    'Dear Parent, this is a reminder that the {feeType} fee of Rs. {amount} for {name} (Month: {month}/{year}) is {status}. Please clear the dues as soon as possible. Thank you.'
  );
  const [sendFeeAlerts, { isLoading: sendingFeeAlerts }] = useSendWhatsAppFeeAlertsMutation();

  // ── Bulk custom ───────────────────────────────────────────────────────────
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkDebouncedSearch, setBulkDebouncedSearch] = useState('');
  const [bulkClassFilter, setBulkClassFilter] = useState<string>('all');
  const [bulkSelectedStudents, setBulkSelectedStudents] = useState<any[]>([]);
  const [bulkMsg, setBulkMsg] = useState('');
  const [sendBulk, { isLoading: sendingBulk }] = useSendWhatsAppBulkMutation();

  // ── Classes ────────────────────────────────────────────────────────────────
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  // Normalise each class to have a guaranteed plain-string id
  const classes: { id: string; name: string }[] = (classesData?.results ?? []).map((c: any) => ({
    id: String(c._id ?? c.id ?? ''),
    name: String(c.name ?? ''),
  }));

  const onlyDigits = (value: string) => String(value ?? '').replace(/\D+/g, '');
  const normalizePhoneCandidates = (phone: string) => {
    const digits = onlyDigits(phone);
    if (!digits) return [] as string[];
    const candidates = new Set<string>([digits]);
    if (digits.startsWith('0')) candidates.add(`92${digits.slice(1)}`);
    if (digits.startsWith('92')) candidates.add(`0${digits.slice(2)}`);
    if (digits.length > 10) candidates.add(digits.slice(-10));
    return Array.from(candidates);
  };

  const getStudentName = (student: any) =>
    [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim() || undefined;

  const mapFailedWithStudentDetails = (failedList: any[], studentPhoneMap: Map<string, any>) =>
    (failedList ?? []).map((f: any) => {
      const phoneDigits = onlyDigits(String(f?.phone ?? ''));
      const matchedStudent =
        studentPhoneMap.get(phoneDigits)
        || studentPhoneMap.get(`92${phoneDigits.slice(-10)}`)
        || studentPhoneMap.get(`0${phoneDigits.slice(-10)}`)
        || null;

      return {
        ...f,
        name: f?.name || getStudentName(matchedStudent),
        admissionNo: matchedStudent?.admissionNo || undefined,
        className: matchedStudent?.class?.name || matchedStudent?.classId?.name || undefined,
        sectionName: matchedStudent?.section?.name || matchedStudent?.sectionId?.name || undefined,
        fatherName: matchedStudent?.parent?.fatherName || undefined,
        parentPhone: matchedStudent?.parent?.phone || f?.phone || undefined,
      };
    });

  const broadcastLookupParams = useMemo(() => {
    const params: Record<string, any> = { limit: 5000 };
    if (broadcastClass !== 'all') params.classId = broadcastClass;
    return params;
  }, [broadcastClass]);

  const feeAlertLookupParams = useMemo(() => {
    const params: Record<string, any> = { limit: 5000 };
    if (feeAlertClass !== 'all') params.classId = feeAlertClass;
    return params;
  }, [feeAlertClass]);

  const { data: broadcastLookupData } = useGetStudentsQuery(broadcastLookupParams, { skip: !isReady });
  const { data: feeAlertLookupData } = useGetStudentsQuery(feeAlertLookupParams, { skip: !isReady });

  const broadcastStudentPhoneMap = useMemo(() => {
    const map = new Map<string, any>();
    const students: any[] = broadcastLookupData?.results ?? [];
    students.forEach((student) => {
      const phone = String(student?.parent?.phone ?? '').trim();
      normalizePhoneCandidates(phone).forEach((k) => map.set(k, student));
    });
    return map;
  }, [broadcastLookupData]);

  const feeAlertStudentPhoneMap = useMemo(() => {
    const map = new Map<string, any>();
    const students: any[] = feeAlertLookupData?.results ?? [];
    students.forEach((student) => {
      const phone = String(student?.parent?.phone ?? '').trim();
      normalizePhoneCandidates(phone).forEach((k) => map.set(k, student));
    });
    return map;
  }, [feeAlertLookupData]);

  useEffect(() => {
    const timer = setTimeout(() => setBulkDebouncedSearch(bulkSearch.trim()), 350);
    return () => clearTimeout(timer);
  }, [bulkSearch]);

  const bulkStudentQueryParams = useMemo(() => {
    const params: Record<string, any> = { search: bulkDebouncedSearch, limit: 12 };
    if (bulkClassFilter !== 'all') params.classId = bulkClassFilter;
    return params;
  }, [bulkDebouncedSearch, bulkClassFilter]);

  const { data: bulkStudentSearchData, isFetching: bulkSearching } = useGetStudentsQuery(
    bulkStudentQueryParams,
    { skip: bulkDebouncedSearch.length < 2 }
  );

  const searchedStudents: any[] = bulkStudentSearchData?.results ?? [];
  const selectedIds = new Set(
    bulkSelectedStudents.map((s) => String(s?._id ?? s?.id ?? ''))
  );

  // ── Result state ───────────────────────────────────────────────────────────
  const [lastResult, setLastResult] = useState<{
    total: number;
    sent: number;
    failed: {
      phone: string;
      reason: string;
      name?: string;
      admissionNo?: string;
      className?: string;
      sectionName?: string;
      fatherName?: string;
      parentPhone?: string;
    }[];
    successfulRecipients?: { phone: string; name?: string }[];
    source?: string;
  } | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleConnect() {
    try {
      setPendingConnect(true);
      setConnectingActive(true);
      await connect().unwrap();
      toast.info('WhatsApp is starting — QR code will appear shortly');
    } catch {
      setPendingConnect(false);
      setConnectingActive(false);
      toast.error('Failed to start WhatsApp');
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect().unwrap();
      setConnectingActive(false);
      toast.success('WhatsApp disconnected');
    } catch {
      toast.error('Failed to disconnect');
    }
  }

  async function handleClearSession() {
    try {
      await clearSession().unwrap();
      toast.success('Session cleared — click Connect to scan a fresh QR code');
    } catch {
      toast.error('Failed to clear session');
    }
  }

  async function handleSendSingle() {
    setLastResult(null);
    if (!singlePhone.trim() || !singleMsg.trim()) {
      toast.error('Enter phone number and message');
      return;
    }
    try {
      await sendSingle({ phone: singlePhone.trim(), message: singleMsg.trim() }).unwrap();
      setLastResult({
        total: 1,
        sent: 1,
        failed: [],
        successfulRecipients: [{ phone: singlePhone.trim() }],
        source: 'Single Message',
      });
      toast.success('Message sent!');
      setSinglePhone('');
      setSingleMsg('');
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to send message');
    }
  }

  async function handleBroadcast() {
    setLastResult(null);
    if (!broadcastMsg.trim()) { toast.error('Enter a message'); return; }
    try {
      let result;
      if (broadcastClass === 'all') {
        result = await sendToAll({ message: broadcastMsg.trim() }).unwrap();
      } else {
        result = await sendToClass({ classId: broadcastClass, message: broadcastMsg.trim() }).unwrap();
      }
      if (result.total === 0) {
        toast.error('No students with parent phone numbers found');
      } else {
        const failedWithDetails = mapFailedWithStudentDetails(result.failed ?? [], broadcastStudentPhoneMap);
        setLastResult({
          ...result,
          failed: failedWithDetails,
          source: broadcastClass === 'all' ? 'Broadcast (All Classes)' : 'Broadcast (Class)',
        });
        toast.success(`Sent to ${result.sent} of ${result.total} students`);
      }
    } catch (e: any) {
      toast.error(e?.data?.message || 'Broadcast failed');
    }
  }

  async function handleFeeAlerts() {
    setLastResult(null);
    try {
      const payload: Record<string, any> = { message: feeAlertMsg.trim() || undefined };
      if (feeAlertClass !== 'all') payload.classId = feeAlertClass;
      if (feeStatus !== 'pending_overdue') payload.feeStatus = feeStatus;
      const result = await sendFeeAlerts(payload).unwrap();
      if (result.total === 0) {
        toast.error('No matching fee vouchers with parent phone numbers found');
      } else {
        const failedWithDetails = mapFailedWithStudentDetails(result.failed ?? [], feeAlertStudentPhoneMap);
        setLastResult({
          ...result,
          failed: failedWithDetails,
          source: 'Fee Alerts',
        });
        toast.success(`Sent fee alerts to ${result.sent} of ${result.total} parents`);
      }
    } catch (e: any) {
      toast.error(e?.data?.message || 'Fee alerts failed');
    }
  }

  async function handleBulkCustom() {
    setLastResult(null);
    if (bulkSelectedStudents.length === 0 || !bulkMsg.trim()) {
      toast.error('Select at least one student and enter a message');
      return;
    }
    const recipients = bulkSelectedStudents
      .map((student) => ({
        phone: String(student?.parent?.phone ?? '').trim(),
        name: [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim() || undefined,
      }))
      .filter((r) => !!r.phone);

    const studentByPhoneKey = new Map<string, any>();
    bulkSelectedStudents.forEach((student) => {
      const phone = String(student?.parent?.phone ?? '').trim();
      normalizePhoneCandidates(phone).forEach((k) => studentByPhoneKey.set(k, student));
    });
    try {
      const result = await sendBulk({ recipients, message: bulkMsg.trim() }).unwrap();
      if (result.total === 0) {
        toast.error('Selected students do not have valid parent phone numbers');
      } else {
        const failedPhones = new Set(
          (result.failed ?? []).map((f: any) => String(f.phone ?? '').replace(/\s+/g, ''))
        );
        const successfulRecipients = recipients.filter(
          (r) => !failedPhones.has(String(r.phone ?? '').replace(/\s+/g, ''))
        );
        const failedWithDetails = mapFailedWithStudentDetails(result.failed ?? [], studentByPhoneKey);
        setLastResult({
          ...result,
          failed: failedWithDetails,
          successfulRecipients,
          source: 'Bulk Custom',
        });
        toast.success(`Sent to ${result.sent} of ${result.total} recipients`);
      }
    } catch (e: any) {
      toast.error(e?.data?.message || 'Bulk send failed');
    }
  }

  function handleToggleStudent(student: any) {
    const id = String(student?._id ?? student?.id ?? '');
    if (!id) return;
    const phone = String(student?.parent?.phone ?? '').trim();
    if (!phone) {
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
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">WhatsApp Messaging</h1>
            <p className="text-sm text-gray-500">Send fee alerts &amp; announcements to parents</p>
          </div>
        </div>
        <StateIndicator state={state} />
      </div>

      {/* Connection Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="w-4 h-4 text-green-600" />
            WhatsApp Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'SERVERLESS_UNSUPPORTED' ? (
            <div className="flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-4">
              <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-orange-800">WhatsApp Not Available on This Server</p>
                <p className="text-xs text-orange-700">
                  WhatsApp messaging requires a <strong>persistent server</strong> with Chrome installed.
                  This backend is currently deployed as a <strong>serverless function (Vercel)</strong> which
                  cannot run Chrome or maintain a live WebSocket connection.
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  To enable WhatsApp: deploy the backend to <strong>Railway</strong>, <strong>Render</strong>,
                  <strong> Fly.io</strong>, or a <strong>VPS</strong> using the provided Dockerfile.
                  Then update <code className="bg-orange-100 px-1 rounded">VITE_BACKEND_URL</code> to point to the new server.
                </p>
              </div>
            </div>
          ) : state === 'DISCONNECTED' ? (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-sm text-gray-600">
                Connect WhatsApp by scanning a QR code with your phone.
              </p>
              <Button onClick={handleConnect} disabled={connecting} className="bg-green-600 hover:bg-green-700 text-white">
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                Connect WhatsApp
              </Button>
            </div>
          ) : state === 'AUTH_FAILURE' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Authentication failed — the saved session is invalid.</span>
              </div>
              <p className="text-sm text-gray-500">
                Click <strong>Clear &amp; Retry</strong> to delete the old session and scan a fresh QR code.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleClearSession} disabled={clearingSession} className="bg-red-600 hover:bg-red-700 text-white">
                  {clearingSession ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Clear &amp; Retry
                </Button>
              </div>
            </div>
          ) : state === 'QR_READY' ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-yellow-700">
                Scan this QR code with your WhatsApp mobile app → WhatsApp &gt; Linked Devices &gt; Link a Device
              </p>
              {status?.qrImage ? (
                <img
                  src={status.qrImage}
                  alt="WhatsApp QR Code"
                  className="w-52 h-52 border-2 border-yellow-300 rounded-lg"
                />
              ) : (
                <div className="w-52 h-52 border-2 border-yellow-300 rounded-lg flex items-center justify-center bg-yellow-50">
                  <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
                </div>
              )}
              <p className="text-xs text-gray-500">QR refreshes automatically. Do not close this page.</p>
            </div>
          ) : state === 'LOADING' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">
                  Connecting to WhatsApp… {loadingElapsed > 0 && <span className="text-blue-400 font-normal">({loadingElapsed}s)</span>}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                WhatsApp is starting up. The QR code will appear here automatically — please wait.
              </p>
              {loadingElapsed >= 20 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-xs text-amber-700 font-medium">
                      Taking longer than expected. An old session may be interfering.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-400 text-amber-700 hover:bg-amber-100 h-7 text-xs"
                      disabled={connecting || clearingSession}
                      onClick={async () => {
                        try {
                          await clearSession().unwrap();
                          await connect().unwrap();
                          toast.info('Retrying — QR code will appear shortly');
                        } catch {
                          toast.error('Retry failed');
                        }
                      }}
                    >
                      {(connecting || clearingSession) ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <QrCode className="w-3 h-3 mr-1" />}
                      Force New QR Code
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">WhatsApp is connected and ready</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <WifiOff className="w-3.5 h-3.5 mr-1" />}
                Disconnect
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Messaging Tabs — disabled when not ready */}
      <Tabs defaultValue="broadcast">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
          <TabsTrigger value="broadcast" disabled={!isReady}>Broadcast</TabsTrigger>
          <TabsTrigger value="fee-alerts" disabled={!isReady}>Fee Alerts</TabsTrigger>
          <TabsTrigger value="single" disabled={!isReady}>Single Message</TabsTrigger>
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
                <div className="flex flex-wrap gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setBroadcastClass('all')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      broadcastClass === 'all'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
                    }`}
                  >
                    All Classes
                  </button>
                  {classes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setBroadcastClass(c.id)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        broadcastClass === c.id
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Message <span className="text-gray-400 text-xs">(use {'{name}'} for student name)</span></Label>
                <Textarea
                  rows={4}
                  placeholder="Type your announcement here…"
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                />
                <p className="text-xs text-gray-400">{broadcastMsg.length} characters</p>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={handleBroadcast}
                  disabled={sendingAll || sendingClass || !broadcastMsg.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                >
                  {(sendingAll || sendingClass) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  {(sendingAll || sendingClass) ? 'Sending messages…' : `Send to ${broadcastClass === 'all' ? 'All Students' : (classes.find((c) => c.id === broadcastClass)?.name ?? 'Class')}`}
                </Button>
                {(sendingAll || sendingClass) && (
                  <p className="text-xs text-gray-500">Sending in progress — please wait, this may take a moment.</p>
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
                  <div className="flex flex-wrap gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setFeeAlertClass('all')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        feeAlertClass === 'all'
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400'
                      }`}
                    >
                      All Classes
                    </button>
                    {classes.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setFeeAlertClass(c.id)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                          feeAlertClass === c.id
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Fee Status</Label>
                  <Select value={feeStatus} onValueChange={setFeeStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending_overdue">Pending &amp; Overdue</SelectItem>
                      <SelectItem value="pending">Pending only</SelectItem>
                      <SelectItem value="overdue">Overdue only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Message Template
                  <span className="ml-2 text-xs text-gray-400">
                    placeholders: {'{name}'} {'{amount}'} {'{month}'} {'{year}'} {'{feeType}'} {'{status}'}
                  </span>
                </Label>
                <Textarea
                  rows={5}
                  value={feeAlertMsg}
                  onChange={(e) => setFeeAlertMsg(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Button
                  onClick={handleFeeAlerts}
                  disabled={sendingFeeAlerts}
                  className="bg-orange-500 hover:bg-orange-600 text-white w-full sm:w-auto"
                >
                  {sendingFeeAlerts ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                  {sendingFeeAlerts ? 'Sending alerts…' : 'Send Fee Alerts'}
                </Button>
                {sendingFeeAlerts && (
                  <p className="text-xs text-gray-500">Sending in progress — please wait, this may take a moment.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SINGLE MESSAGE ── */}
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
              </div>
              <Button
                onClick={handleSendSingle}
                disabled={sendingSingle}
                className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
              >
                {sendingSingle ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send Message
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
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
                        const fullName = [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim() || 'Unnamed';
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
                                {admissionNo ? `Adm: ${admissionNo}` : 'Adm: -'} · Class: {className || '-'}{sectionName ? `-${sectionName}` : ''} · Father: {fatherName || '-'}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                Parent Phone: {parentPhone || '-'}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded border ${selectedIds.has(studentId) ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-300'}`}>
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
                  <div className="space-y-2">
                    {bulkSelectedStudents.map((student) => {
                      const studentId = String(student?._id ?? student?.id ?? '');
                      const fullName = [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim() || 'Unnamed';
                      const fatherName = String(student?.parent?.fatherName ?? '').trim();
                      const parentPhone = String(student?.parent?.phone ?? '').trim();
                      const className = String(student?.class?.name ?? student?.classId?.name ?? '').trim();
                      const sectionName = String(student?.section?.name ?? student?.sectionId?.name ?? '').trim();
                      const admissionNo = String(student?.admissionNo ?? '').trim();
                      return (
                        <div key={studentId} className="rounded-md border border-green-200 bg-green-50 px-3 py-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-green-900 truncate">{fullName}</p>
                            <p className="text-xs text-green-800 truncate">
                              {admissionNo ? `Adm: ${admissionNo}` : 'Adm: -'} · Class: {className || '-'}{sectionName ? `-${sectionName}` : ''} · Father: {fatherName || '-'}
                            </p>
                            <p className="text-xs text-green-800 truncate">Parent Phone: {parentPhone || '-'}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSelectedStudent(studentId)}
                            className="h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-100"
                          >
                            Remove
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-400">{bulkSelectedStudents.length} students selected</p>
              </div>

              <div className="space-y-1.5">
                <Label>Message <span className="text-gray-400 text-xs">(use {'{name}'} for personalised greeting)</span></Label>
                <Textarea
                  rows={4}
                  placeholder="Dear {name}, …"
                  value={bulkMsg}
                  onChange={(e) => setBulkMsg(e.target.value)}
                />
              </div>
              <Button
                onClick={handleBulkCustom}
                disabled={sendingBulk || bulkSelectedStudents.length === 0 || !bulkMsg.trim()}
                className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
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
            <CardTitle className="text-base">
              Send Result{lastResult.source ? ` - ${lastResult.source}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 flex-wrap">
              <Badge className="bg-green-100 text-green-700 border-green-300 border">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Sent: {lastResult.sent}
              </Badge>
              <Badge className={`border ${lastResult.failed.length > 0 ? 'bg-red-100 text-red-700 border-red-300' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Failed: {lastResult.failed.length}
              </Badge>
              <Badge variant="outline">Total: {lastResult.total}</Badge>
            </div>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-green-700">Successful</p>
                <p className="text-xs text-green-700">
                  {lastResult.sent} message{lastResult.sent === 1 ? '' : 's'} sent successfully.
                </p>
                {(lastResult.successfulRecipients?.length ?? 0) > 0 && (
                  <div className="max-h-80 overflow-y-auto space-y-1">
                    {lastResult.successfulRecipients?.map((s, i) => (
                      <div key={`${s.phone}-${i}`} className="text-xs text-green-800 bg-white rounded px-2 py-1 border border-green-100">
                        <span className="font-mono">{s.phone}</span>{s.name ? ` (${s.name})` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-red-700">Failed</p>
                <p className="text-xs text-red-700">
                  {lastResult.failed.length} message{lastResult.failed.length === 1 ? '' : 's'} failed.
                </p>
                {lastResult.failed.length > 0 ? (
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {lastResult.failed.map((f, i) => (
                      <div key={i} className="text-xs text-red-800 bg-white rounded px-2 py-1 border border-red-100 space-y-0.5">
                        <p className="font-medium">{f.name || `Student (${f.parentPhone || f.phone || 'Unknown Number'})`}</p>
                        <p>
                          {f.admissionNo ? `Adm: ${f.admissionNo}` : 'Adm: -'} · Class: {f.className || '-'}{f.sectionName ? `-${f.sectionName}` : ''} · Father: {f.fatherName || '-'}
                        </p>
                        <p>Parent Phone: {f.parentPhone || f.phone || '-'}</p>
                        <p className="text-red-600">Reason: {f.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-red-700">No failed messages.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
