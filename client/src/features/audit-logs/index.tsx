import { useMemo, useState, type ReactNode } from 'react';
import { format, isValid } from 'date-fns';
import { Eye, History, Plus, Pencil, Trash2, PackageSearch, ShieldCheck, RefreshCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLanguage } from '@/context/language-context';
import { useGetAuditLogsQuery, useGetAuditModulesQuery, AuditLog } from '@/stores/auditLog.api';

const ACTION_OPTIONS = [
  { value: 'create', labelKey: 'action_created', fallback: 'Created' },
  { value: 'update', labelKey: 'action_updated', fallback: 'Updated' },
  { value: 'delete', labelKey: 'action_deleted', fallback: 'Deleted' },
  { value: 'stock_adjust', labelKey: 'action_stock_adjust', fallback: 'Stock Adjusted' },
  { value: 'permission_change', labelKey: 'action_permission_change', fallback: 'Permissions Changed' },
  { value: 'status_change', labelKey: 'action_status_change', fallback: 'Status Changed' },
];

const ACTION_ICONS: Record<string, typeof Plus> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  stock_adjust: PackageSearch,
  permission_change: ShieldCheck,
  status_change: RefreshCcw,
};

const ACTION_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  create: 'default',
  update: 'secondary',
  delete: 'destructive',
  stock_adjust: 'secondary',
  permission_change: 'outline',
  status_change: 'outline',
};

const formatDateTime = (value: string | undefined, pattern: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return isValid(date) ? format(date, pattern) : '—';
};

const getUserLabel = (log: AuditLog) => {
  if (log.userId && typeof log.userId === 'object') return log.userId.name || log.userId.email;
  return log.userName || log.userEmail || 'System';
};

/** "paidAmount" → "Paid Amount", "stock_quantity" → "Stock Quantity" */
const humanizeField = (field: string) =>
  field
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Renders an audit value compactly and safely — never dumps raw, unwrapped JSON inline. */
const renderValue = (value: unknown): ReactNode => {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === 'boolean') {
    return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>;
  }
  if (typeof value === 'number') {
    return <span>{value.toLocaleString()}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">—</span>;
    const names = value
      .map((item) => (isPlainRecord(item) ? (item.name as string) || (item.productName as string) : undefined))
      .filter(Boolean) as string[];
    if (names.length === value.length) {
      const shown = names.slice(0, 3).join(', ');
      const extra = names.length > 3 ? ` +${names.length - 3} more` : '';
      return (
        <span>
          <Badge variant="outline" className="mr-1.5">
            {value.length} item{value.length === 1 ? '' : 's'}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {shown}
            {extra}
          </span>
        </span>
      );
    }
    return (
      <Badge variant="outline">
        {value.length} item{value.length === 1 ? '' : 's'}
      </Badge>
    );
  }
  if (isPlainRecord(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="text-xs">
            <span className="text-muted-foreground">{humanizeField(k)}:</span>{' '}
            <span className="break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="break-words">{String(value)}</span>;
};

export default function AuditLogsPage() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [module, setModule] = useState<string>('all');
  const [action, setAction] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data, isLoading, isFetching } = useGetAuditLogsQuery({
    page,
    limit: 20,
    module: module === 'all' ? undefined : module,
    action: action === 'all' ? undefined : action,
    search: search.trim() || undefined,
  });
  const { data: modules } = useGetAuditModulesQuery();

  const logs = data?.results || [];

  const moduleOptions = useMemo(() => {
    const set = new Set(modules || []);
    logs.forEach((log) => set.add(log.module));
    return Array.from(set).sort();
  }, [modules, logs]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <History className="w-7 h-7" />
          {t('audit_logs') || 'Audit Logs'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t('audit_logs_description') ||
            'Track who changed prices, deleted invoices, or modified stock — every important action in your business.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('activity_history') || 'Activity History'}</CardTitle>
          <CardDescription>
            {t('audit_logs_filter_description') || 'Filter by module, action type, or search by record/user name'}
          </CardDescription>
          <div className="flex flex-wrap gap-3 pt-4">
            <Input
              placeholder={t('search_audit_logs') || 'Search by record or user name...'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-xs"
            />
            <Select
              value={module}
              onValueChange={(value) => {
                setModule(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('module') || 'Module'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_modules') || 'All Modules'}</SelectItem>
                {moduleOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={action}
              onValueChange={(value) => {
                setAction(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('action') || 'Action'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_actions') || 'All Actions'}</SelectItem>
                {ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey) || opt.fallback}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date_time') || 'Date & Time'}</TableHead>
                    <TableHead>{t('user') || 'User'}</TableHead>
                    <TableHead>{t('action') || 'Action'}</TableHead>
                    <TableHead>{t('module') || 'Module'}</TableHead>
                    <TableHead>{t('record') || 'Record'}</TableHead>
                    <TableHead className="text-right">{t('details') || 'Details'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const ActionIcon = ACTION_ICONS[log.action] || Pencil;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(log.createdAt, 'MMM d, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="font-medium">{getUserLabel(log)}</TableCell>
                        <TableCell>
                          <Badge variant={ACTION_BADGE_VARIANT[log.action] || 'secondary'} className="gap-1">
                            <ActionIcon className="w-3 h-3" />
                            {(() => {
                              const opt = ACTION_OPTIONS.find((o) => o.value === log.action);
                              return opt ? t(opt.labelKey) || opt.fallback : log.action;
                            })()}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.module}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{log.entityName || '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t('no_audit_logs_found') || 'No activity recorded yet'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                {t('page') || 'Page'} {data.page} {t('of') || 'of'} {data.totalPages} ({data.totalResults}{' '}
                {t('entries') || 'entries'})
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('previous') || 'Previous'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('next') || 'Next'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t('activity_details') || 'Activity Details'}
              {selectedLog && (
                <Badge variant={ACTION_BADGE_VARIANT[selectedLog.action] || 'secondary'} className="gap-1">
                  {(() => {
                    const ActionIcon = ACTION_ICONS[selectedLog.action] || Pencil;
                    return <ActionIcon className="w-3 h-3" />;
                  })()}
                  {(() => {
                    const opt = ACTION_OPTIONS.find((o) => o.value === selectedLog.action);
                    return opt ? t(opt.labelKey) || opt.fallback : selectedLog.action;
                  })()}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedLog && (
                <>
                  {getUserLabel(selectedLog)} ·{' '}
                  {formatDateTime(selectedLog.createdAt, 'MMM d, yyyy HH:mm:ss')}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm rounded-md border bg-muted/30 p-3">
                <div>
                  <span className="text-muted-foreground">{t('module') || 'Module'}:</span>{' '}
                  <span className="font-medium">{selectedLog.module}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('record') || 'Record'}:</span>{' '}
                  <span className="font-medium break-words">{selectedLog.entityName || '—'}</span>
                </div>
              </div>

              {selectedLog.changes.length > 0 && (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[30%]">{t('field') || 'Field'}</TableHead>
                        {selectedLog.action !== 'create' && (
                          <TableHead className="w-[30%]">{t('before') || 'Before'}</TableHead>
                        )}
                        <TableHead>
                          {selectedLog.action === 'create' ? t('value') || 'Value' : t('after') || 'After'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLog.changes.map((change) => (
                        <TableRow key={change.field}>
                          <TableCell className="font-medium align-top">{humanizeField(change.field)}</TableCell>
                          {selectedLog.action !== 'create' && (
                            <TableCell className="align-top text-destructive max-w-[200px]">
                              {renderValue(change.oldValue)}
                            </TableCell>
                          )}
                          <TableCell className="align-top text-green-600 max-w-[260px]">
                            {renderValue(change.newValue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {selectedLog.changes.length === 0 && (selectedLog.metadata ? Object.keys(selectedLog.metadata).length === 0 : true) && (
                <p className="text-sm text-muted-foreground py-2">
                  {t('no_additional_details') || 'No additional details recorded for this activity.'}
                </p>
              )}

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t('additional_info') || 'Additional Info'}
                  </p>
                  <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-2 gap-y-1.5 gap-x-4 text-sm">
                    {Object.entries(selectedLog.metadata).map(([key, value]) => (
                      <div key={key} className="min-w-0">
                        <span className="text-muted-foreground">{humanizeField(key)}:</span>{' '}
                        <span className="font-medium break-words">{renderValue(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
