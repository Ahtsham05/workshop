import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useGetVisitorsQuery,
  useGetVisitorStatsQuery,
  useDeleteVisitorMutation,
} from '@/stores/school.api';
import { Plus, Search, Eye, Trash2, Phone, UserCheck, CalendarClock, TrendingUp, Users, ArrowRightLeft, XCircle } from 'lucide-react';
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button';
import { useNavigate } from '@tanstack/react-router';
import VisitorForm, { SOURCE_OPTIONS, STATUS_OPTIONS, statusBadge } from './visitor-form';
import FollowUpDialog from './follow-up-dialog';
import toast from 'react-hot-toast';

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: any }) {
  if (!stats) return null;

  const cards = [
    { label: 'Total Inquiries', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Interested', value: stats.byStatus?.interested ?? 0, icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Converted', value: stats.byStatus?.converted ?? 0, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Conversion Rate', value: `${stats.conversionRate ?? 0}%`, icon: ArrowRightLeft, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: "Today's Follow-ups", value: stats.todayFollowUps ?? 0, icon: CalendarClock, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Lost', value: stats.byStatus?.lost ?? 0, icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(({ label, value, icon: Icon, color, bg }) => (
        <Card key={label} className="shadow-none border">
          <CardContent className="p-4">
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${bg} mb-2`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Source mini chart — horizontal row ──────────────────────────────────────

function SourceBreakdown({ stats }: { stats: any }) {
  if (!stats?.bySource) return null;
  const entries = Object.entries(stats.bySource as Record<string, number>)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  if (!entries.length) return null;

  const total = entries.reduce((s, [, v]) => s + v, 0);

  return (
    <Card className="shadow-none border">
      <CardContent className="px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Leads by Source</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {entries.map(([src, count]) => {
            const pct = total ? Math.round((count / total) * 100) : 0;
            const label = SOURCE_OPTIONS.find((o) => o.value === src)?.label ?? src;
            return (
              <div key={src} className="flex items-center gap-2 min-w-[140px]">
                <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground capitalize whitespace-nowrap">{label}</span>
                <span className="text-xs font-semibold ml-auto">{count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VisitorList() {
  const navigate = useNavigate();

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editVisitor, setEditVisitor] = useState<any>(null);
  const [followUpTarget, setFollowUpTarget] = useState<string | null>(null);

  const queryParams: any = { limit: 20, page, sortBy: 'inquiryDate:desc' };
  if (statusFilter) queryParams.status = statusFilter;
  if (sourceFilter) queryParams.source = sourceFilter;
  if (debouncedSearch) queryParams.studentName = debouncedSearch;
  if (dateFrom) queryParams.dateFrom = dateFrom;
  if (dateTo) queryParams.dateTo = dateTo;

  const { data, isLoading } = useGetVisitorsQuery(queryParams);
  const { data: stats } = useGetVisitorStatsQuery(undefined);
  const [deleteVisitor] = useDeleteVisitorMutation();

  const visitors: any[] = data?.results ?? [];
  const totalPages = data?.totalPages ?? 1;

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this visitor record?')) return;
    try {
      await deleteVisitor(id).unwrap();
      toast.success('Visitor deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const followUpMessage = (name: string) =>
    `السلام علیکم ${name}! We wanted to follow up regarding your admission inquiry.`

  const openEdit = (v: any) => {
    setEditVisitor(v);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditVisitor(null);
  };

  return (
    <div className="h-full w-full p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visitor Management</h1>
          <p className="text-sm text-muted-foreground">Admission inquiries & lead tracking</p>
        </div>
        <Button onClick={() => { setEditVisitor(null); setFormOpen(true); }} className="gap-2 bg-blue-700 hover:bg-blue-800">
          <Plus className="h-4 w-4" /> New Inquiry
        </Button>
      </div>

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Source breakdown — full width beneath stats */}
      <SourceBreakdown stats={stats} />

      {/* Filters + Table — full width */}
      <div className="space-y-3">
          {/* Filters */}
          <Card className="shadow-none border">
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search student name…"
                    className="pl-8"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v === 'all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Sources" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="date" className="w-[140px]" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="From" />
                <Input type="date" className="w-[140px]" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="To" />
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="shadow-none border overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="w-full min-w-[820px] text-sm table-fixed">
                <colgroup>
                  <col className="w-[200px]" />
                  <col className="w-[180px]" />
                  <col className="w-[100px]" />
                  <col className="w-[110px]" />
                  <col className="w-[110px]" />
                  <col className="w-[130px]" />
                  <col className="w-[180px]" />
                </colgroup>
                <thead className="bg-muted/60 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide">Student</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide">Parent / Phone</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide">Class</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide">Source</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide">Follow-up</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoading && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {!isLoading && visitors.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No visitors found</td></tr>
                  )}
                  {visitors.map((v: any) => {
                    const id = v._id || v.id;
                    const followUpDate = v.nextFollowUpDate ? new Date(v.nextFollowUpDate) : null;
                    const isOverdue = followUpDate && followUpDate < new Date() && !['converted', 'lost'].includes(v.status);
                    const srcLabel = SOURCE_OPTIONS.find((o) => o.value === v.source)?.label ?? v.source;

                    return (
                      <tr key={id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{v.studentName}</div>
                          <div className="text-xs text-muted-foreground capitalize">{v.gender} · {v.inquiryDate ? new Date(v.inquiryDate).toLocaleDateString() : '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{v.parentName}</div>
                          <div className="text-xs text-muted-foreground">{v.phone}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{v.desiredClass || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs capitalize">{srcLabel}</Badge>
                        </td>
                        <td className="px-4 py-3">{statusBadge(v.status)}</td>
                        <td className="px-4 py-3">
                          {followUpDate ? (
                            <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {followUpDate.toLocaleDateString()}
                              {isOverdue && ' ⚠'}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          <div className="text-xs text-muted-foreground">{v.followUps?.length ?? 0} note(s)</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <WhatsAppSendButton
                              phone={v.phone}
                              name={v.parentName}
                              message={followUpMessage(v.parentName)}
                              className='h-8 w-8'
                            />
                            <SmsSendButton phone={v.phone} name={v.parentName} />
                            {/* Phone */}
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Call"
                              onClick={() => window.open(`tel:${v.phone}`)}
                            >
                              <Phone className="h-4 w-4" />
                            </Button>
                            {/* Follow-up */}
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                              title="Add Follow-up"
                              onClick={() => setFollowUpTarget(id)}
                            >
                              <CalendarClock className="h-4 w-4" />
                            </Button>
                            {/* View detail */}
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8"
                              title="View / Edit"
                              onClick={() => openEdit(v)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {/* Convert to student */}
                            {v.status !== 'converted' && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                title="Convert to Student"
                                onClick={() => {
                                const prefill = JSON.stringify({
                                  firstName: v.studentName.split(' ')[0],
                                  lastName: v.studentName.split(' ').slice(1).join(' '),
                                  gender: v.gender,
                                  dateOfBirth: v.dateOfBirth,
                                  previousSchool: v.previousSchool,
                                  parent: { fatherName: v.parentName, phone: v.phone, email: v.email, address: v.address },
                                  visitorId: id,
                                });
                                navigate({ to: '/school/students/create' as any, search: { prefill } as any });
                              }}
                              >
                                <UserCheck className="h-4 w-4" />
                              </Button>
                            )}
                            {/* Delete */}
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete"
                              onClick={() => handleDelete(id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        </div>

      {/* Dialogs */}
      <VisitorForm open={formOpen} onClose={closeForm} visitor={editVisitor} />
      {followUpTarget && (
        <FollowUpDialog visitorId={followUpTarget} open={!!followUpTarget} onClose={() => setFollowUpTarget(null)} />
      )}
    </div>
  );
}
