import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  LayoutDashboard, BookOpen, FileText, Landmark, PiggyBank, BarChart3,
  Plus, ChevronRight, ChevronDown, Trash2, Edit, RotateCcw, Eye,
  TrendingUp, TrendingDown, DollarSign, Wallet, Building2,
  Download, Loader2, AlertTriangle, CheckCircle, Database,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  useGetAccountsDashboardQuery,
  useGetChartOfAccountsQuery,
  useGetAccountTreeQuery,
  useGetPostingAccountsQuery,
  useSeedChartOfAccountsMutation,
  useCreateAccountHeadMutation,
  useUpdateAccountHeadMutation,
  useDeleteAccountHeadMutation,
  useGetJournalEntriesQuery,
  useGetJournalEntryByIdQuery,
  useCreateJournalEntryMutation,
  useReverseJournalEntryMutation,
  useGetBankAccountsQuery,
  useCreateBankAccountMutation,
  useUpdateBankAccountMutation,
  useDeleteBankAccountMutation,
  useGetBudgetsQuery,
  useCreateBudgetMutation,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
  useGetTrialBalanceQuery,
  useGetBalanceSheetQuery,
  useGetIncomeStatementQuery,
  useGetCashFlowStatementQuery,
  useGetGeneralLedgerQuery,
  useGetBudgetVsActualQuery,
} from '@/stores/school.api';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════════
// ─── Constants ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════


const ROOT_TYPE_COLORS: Record<string, string> = {
  ASSET: 'bg-blue-100 text-blue-700',
  LIABILITY: 'bg-red-100 text-red-700',
  EQUITY: 'bg-purple-100 text-purple-700',
  REVENUE: 'bg-green-100 text-green-700',
  EXPENSE: 'bg-orange-100 text-orange-700',
};

type TabKey = 'dashboard' | 'coa' | 'journal' | 'bank' | 'budget' | 'statements';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'coa', label: 'Chart of Accounts', icon: BookOpen },
  { key: 'journal', label: 'Journal Entries', icon: FileText },
  { key: 'bank', label: 'Bank & Cash', icon: Landmark },
  { key: 'budget', label: 'Budgets', icon: PiggyBank },
  { key: 'statements', label: 'Financial Statements', icon: BarChart3 },
];

function fmt(n: number | undefined | null) {
  return `PKR ${(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string | undefined) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getCurrentFinancialYear(): string {
  const now = new Date();
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

function exportToExcel(data: any[], sheetName: string, fileName: string) {
  import('xlsx').then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, `${fileName}.xlsx`);
    toast.success('Excel exported');
  });
}

function exportToPDF(title: string, headers: string[], rows: string[][], fileName: string, landscape = false) {
  import('jspdf').then(({ jsPDF }) => {
    import('jspdf-autotable').then(() => {
      const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.text(title, 14, 15);
      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 21);
      (doc as any).autoTable({
        head: [headers],
        body: rows,
        startY: 25,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });
      doc.save(`${fileName}.pdf`);
      toast.success('PDF exported');
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Main Component ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export default function AccountsSystem() {
  const [tab, setTab] = useState<TabKey>('dashboard');

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts System</h1>
          <p className="text-muted-foreground">Complete double-entry bookkeeping & financial management</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${tab === key ? 'bg-background shadow text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'coa' && <ChartOfAccountsTab />}
      {tab === 'journal' && <JournalEntriesTab />}
      {tab === 'bank' && <BankAccountsTab />}
      {tab === 'budget' && <BudgetsTab />}
      {tab === 'statements' && <StatementsTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Dashboard Tab ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function DashboardTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const { data, isLoading } = useGetAccountsDashboardQuery({ year });
  const [seedCOA, { isLoading: seeding }] = useSeedChartOfAccountsMutation();

  const dashboard = data?.data;

  if (isLoading) return <LoadingState />;

  if (!dashboard || !dashboard.summary?.totalAccounts) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardHeader className="text-center">
          <Database className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
          <CardTitle>Initialize Chart of Accounts</CardTitle>
          <CardDescription>
            No accounts found. Seed the default Chart of Accounts to get started with double-entry bookkeeping.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={() => seedCOA(undefined).unwrap().then(() => toast.success('Chart of Accounts seeded successfully!')).catch((e: any) => toast.error(e?.data?.message || 'Failed to seed'))} disabled={seeding}>
            {seeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
            Seed Default Accounts
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = dashboard.summary;
  const kpis = [
    { label: 'Total Assets', value: fmt(summary.totalAssets), icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Revenue', value: fmt(summary.totalRevenue), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Total Expenses', value: fmt(summary.totalExpenses), icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Net Income', value: fmt(summary.totalRevenue - summary.totalExpenses), icon: DollarSign, color: summary.totalRevenue - summary.totalExpenses >= 0 ? 'text-green-600' : 'text-red-600', bg: summary.totalRevenue - summary.totalExpenses >= 0 ? 'bg-green-50' : 'bg-red-50' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold mt-0.5">{value}</p>
                </div>
                <div className={`p-2 rounded-lg ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Monthly Cash Flow Chart */}
        {dashboard.monthlyCashFlow && dashboard.monthlyCashFlow.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Monthly Cash Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dashboard.monthlyCashFlow}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="inflow" name="Inflow" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflow" name="Outflow" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Bank Account Balances */}
        {dashboard.bankBalances && dashboard.bankBalances.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bank & Cash Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dashboard.bankBalances.map((b: any) => (
                  <div key={b._id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${b.accountType === 'cash' ? 'bg-green-50' : b.accountType === 'bank' ? 'bg-blue-50' : 'bg-purple-50'}`}>
                        {b.accountType === 'cash' ? <Wallet className="h-4 w-4 text-green-600" /> : <Landmark className="h-4 w-4 text-blue-600" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{b.accountName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{b.accountType}{b.bankName ? ` — ${b.bankName}` : ''}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold">{fmt(b.currentBalance)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Journal Entries */}
      {dashboard.recentEntries && dashboard.recentEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Journal Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recentEntries.map((e: any) => (
                  <TableRow key={e._id}>
                    <TableCell className="font-mono text-xs">{e.entryNumber}</TableCell>
                    <TableCell className="text-xs">{fmtDate(e.date)}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{e.entryType?.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{e.description}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{fmt(e.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Chart of Accounts Tab ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function ChartOfAccountsTab() {
  const { data, isLoading } = useGetAccountTreeQuery(undefined);
  const { data: flatData } = useGetChartOfAccountsQuery(undefined);
  const [seedCOA, { isLoading: seeding }] = useSeedChartOfAccountsMutation();
  const [createAccount] = useCreateAccountHeadMutation();
  const [updateAccount] = useUpdateAccountHeadMutation();
  const [deleteAccount] = useDeleteAccountHeadMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [editAccount, setEditAccount] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const tree = data?.data || [];
  const allAccounts = flatData?.data || [];

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const ids = new Set<string>();
    const walk = (nodes: any[]) => nodes.forEach((n: any) => { ids.add(n._id); if (n.children) walk(n.children); });
    walk(tree);
    setExpanded(ids);
  };

  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    const filter = (nodes: any[]): any[] =>
      nodes.reduce((acc: any[], n: any) => {
        const match = n.name?.toLowerCase().includes(q) || n.code?.toString().includes(q);
        const children = n.children ? filter(n.children) : [];
        if (match || children.length > 0) acc.push({ ...n, children });
        return acc;
      }, []);
    return filter(tree);
  }, [tree, search]);

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search accounts..." className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="outline" size="sm" onClick={expandAll}>Expand All</Button>
        <Button variant="outline" size="sm" onClick={() => setExpanded(new Set())}>Collapse All</Button>
        <div className="flex-1" />
        {allAccounts.length === 0 && (
          <Button onClick={() => seedCOA(undefined).unwrap().then(() => toast.success('Seeded!')).catch((e: any) => toast.error(e?.data?.message || 'Error'))} disabled={seeding} variant="outline">
            {seeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
            Seed Defaults
          </Button>
        )}
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />Add Account
        </Button>
        <Button variant="outline" size="sm" onClick={() =>
          exportToExcel(allAccounts.map((a: any) => ({ Code: a.code, Name: a.name, Type: a.rootType, Balance: a.balanceType, Group: a.isGroup ? 'Yes' : 'No', CurrentBalance: a.currentBalance })),
          'COA', 'chart-of-accounts')
        }>
          <Download className="h-4 w-4 mr-1" />Excel
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Account</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTree.map((node: any) => (
                <AccountTreeRow key={node._id} node={node} level={0} expanded={expanded} toggle={toggleExpand}
                  onEdit={setEditAccount} onDelete={(id: string) => {
                    if (confirm('Delete this account? This cannot be undone.')) {
                      deleteAccount(id).unwrap().then(() => toast.success('Deleted')).catch((e: any) => toast.error(e?.data?.message || 'Cannot delete'));
                    }
                  }} />
              ))}
              {filteredTree.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No accounts found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Account Dialog */}
      <AccountFormDialog open={showCreate} onClose={() => setShowCreate(false)} accounts={allAccounts}
        onSubmit={(data) => createAccount(data).unwrap().then(() => { toast.success('Account created'); setShowCreate(false); }).catch((e: any) => toast.error(e?.data?.message || 'Error'))} />

      {/* Edit Account Dialog */}
      {editAccount && (
        <AccountFormDialog open={true} onClose={() => setEditAccount(null)} accounts={allAccounts} initial={editAccount}
          onSubmit={(data) => updateAccount({ id: editAccount._id, ...data }).unwrap().then(() => { toast.success('Updated'); setEditAccount(null); }).catch((e: any) => toast.error(e?.data?.message || 'Error'))} />
      )}
    </div>
  );
}

function AccountTreeRow({ node, level, expanded, toggle, onEdit, onDelete }: { node: any; level: number; expanded: Set<string>; toggle: (id: string) => void; onEdit: (a: any) => void; onDelete: (id: string) => void }) {
  const hasChildren = node.children && node.children.length > 0;
  const isOpen = expanded.has(node._id);

  return (
    <>
      <TableRow className={node.isGroup ? 'font-medium' : ''}>
        <TableCell>
          <div className="flex items-center" style={{ paddingLeft: `${level * 20}px` }}>
            {hasChildren ? (
              <button onClick={() => toggle(node._id)} className="mr-1 p-0.5 hover:bg-muted rounded">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : <span className="w-5" />}
            <span className="text-sm">{node.name}</span>
            {node.isSystem && <Badge variant="outline" className="ml-2 text-[10px]">System</Badge>}
            {node.isGroup && <Badge variant="secondary" className="ml-2 text-[10px]">Group</Badge>}
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs">{node.code}</TableCell>
        <TableCell><Badge className={`text-[10px] ${ROOT_TYPE_COLORS[node.rootType] || ''}`}>{node.rootType}</Badge></TableCell>
        <TableCell className="text-right text-sm">{node.isGroup ? '' : fmt(node.currentBalance)}</TableCell>
        <TableCell>
          <div className="flex gap-1">
            {!node.isSystem && (
              <>
                <button onClick={() => onEdit(node)} className="p-1 hover:bg-muted rounded"><Edit className="h-3.5 w-3.5" /></button>
                <button onClick={() => onDelete(node._id)} className="p-1 hover:bg-red-50 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
      {hasChildren && isOpen && node.children.map((child: any) => (
        <AccountTreeRow key={child._id} node={child} level={level + 1} expanded={expanded} toggle={toggle} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}

function AccountFormDialog({ open, onClose, accounts, initial, onSubmit }: { open: boolean; onClose: () => void; accounts: any[]; initial?: any; onSubmit: (data: any) => void }) {
  const [name, setName] = useState(initial?.name || '');
  const [code, setCode] = useState(initial?.code || '');
  const [parentId, setParentId] = useState(initial?.parentId || '');
  const [rootType, setRootType] = useState(initial?.rootType || 'ASSET');
  const [balanceType, setBalanceType] = useState(initial?.balanceType || 'DEBIT');
  const [isGroup, setIsGroup] = useState(initial?.isGroup || false);
  const [openingBalance, setOpeningBalance] = useState(initial?.openingBalance || 0);

  const groupAccounts = accounts.filter((a: any) => a.isGroup);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Account' : 'Create Account'}</DialogTitle>
          <DialogDescription>{initial ? 'Update account details' : 'Add a new account to the chart of accounts'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 1103" /></div>
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" /></div>
          </div>
          <div>
            <Label>Parent Account</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder="Select parent (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No Parent (Root Level) —</SelectItem>
                {groupAccounts.map((a: any) => <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!parentId || parentId === 'none' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Root Type</Label>
                <Select value={rootType} onValueChange={setRootType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Balance Type</Label>
                <Select value={balanceType} onValueChange={setBalanceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">DEBIT</SelectItem>
                    <SelectItem value="CREDIT">CREDIT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Root type and balance type will be inherited from the parent account.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Opening Balance</Label>
              <Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} />
            </div>
            <div className="flex items-end gap-2">
              <Label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} className="rounded" />
                <span>Is Group Account</span>
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit({
            name, code: Number(code),
            ...(parentId && parentId !== 'none' ? { parentId } : { rootType, balanceType }),
            isGroup, openingBalance,
          })} disabled={!name || !code}>
            {initial ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Journal Entries Tab ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function JournalEntriesTab() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const { data, isLoading } = useGetJournalEntriesQuery({ page, limit: 20, ...(typeFilter ? { entryType: typeFilter } : {}), ...(statusFilter ? { status: statusFilter } : {}) });
  const [reverseEntry] = useReverseJournalEntryMutation();

  const entries = data?.data?.results || [];
  const total = data?.data?.totalResults || 0;
  const totalPages = data?.data?.totalPages || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {['FEE_RECEIPT', 'EXPENSE', 'SALARY', 'ADVANCE', 'TRANSFER', 'ADJUSTMENT', 'OPENING', 'REFUND'].map((t) => (
              <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />New Journal Entry
        </Button>
      </div>

      {isLoading ? <LoadingState /> : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e: any) => (
                  <TableRow key={e._id}>
                    <TableCell className="font-mono text-xs">{e.entryNumber}</TableCell>
                    <TableCell className="text-xs">{fmtDate(e.date)}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{e.entryType?.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{e.description}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === 'posted' ? 'default' : e.status === 'reversed' ? 'destructive' : 'outline'} className="text-[10px]">
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">{fmt(e.totalAmount)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => setViewId(e._id)} className="p-1 hover:bg-muted rounded"><Eye className="h-3.5 w-3.5" /></button>
                        {e.status === 'posted' && (
                          <button onClick={() => {
                            if (confirm('Reverse this journal entry?')) {
                              reverseEntry(e._id).unwrap().then(() => toast.success('Reversed')).catch((er: any) => toast.error(er?.data?.message || 'Error'));
                            }
                          }} className="p-1 hover:bg-orange-50 rounded text-orange-500">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No journal entries found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Showing {entries.length} of {total} entries</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-sm px-3 py-1">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Create Journal Entry */}
      {showCreate && <JournalEntryFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}

      {/* View Journal Entry */}
      {viewId && <JournalEntryViewDialog id={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}

function JournalEntryFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: accountsData } = useGetPostingAccountsQuery(undefined);
  const [createEntry, { isLoading }] = useCreateJournalEntryMutation();
  const accounts = accountsData?.data || [];

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryType, setEntryType] = useState('ADJUSTMENT');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<{ accountId: string; debit: number; credit: number; narration: string }[]>([
    { accountId: '', debit: 0, credit: 0, narration: '' },
    { accountId: '', debit: 0, credit: 0, narration: '' },
  ]);

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = totalDebit > 0 && totalDebit === totalCredit;

  const updateLine = (idx: number, field: string, value: any) => {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const addLine = () => setLines((prev) => [...prev, { accountId: '', debit: 0, credit: 0, narration: '' }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    const payload = {
      date, entryType, description, reference,
      lines: lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0)),
    };
    createEntry(payload).unwrap().then(() => { toast.success('Journal entry created'); onClose(); }).catch((e: any) => toast.error(e?.data?.message || 'Error'));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
          <DialogDescription>Create a double-entry journal voucher. Debits must equal credits.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div>
              <Label>Entry Type</Label>
              <Select value={entryType} onValueChange={setEntryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['FEE_RECEIPT', 'EXPENSE', 'SALARY', 'ADVANCE', 'TRANSFER', 'ADJUSTMENT', 'OPENING', 'REFUND'].map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional ref" /></div>
          </div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description of this entry" rows={2} /></div>

          {/* Journal Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Journal Lines</Label>
              <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Add Line</Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Account</TableHead>
                    <TableHead>Debit</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Narration</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Select value={line.accountId} onValueChange={(v) => updateLine(idx, 'accountId', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select account" /></SelectTrigger>
                          <SelectContent>
                            {accounts.map((a: any) => <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-8 text-xs w-24" value={line.debit || ''} onChange={(e) => updateLine(idx, 'debit', Number(e.target.value))} placeholder="0" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-8 text-xs w-24" value={line.credit || ''} onChange={(e) => updateLine(idx, 'credit', Number(e.target.value))} placeholder="0" />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-xs" value={line.narration} onChange={(e) => updateLine(idx, 'narration', e.target.value)} placeholder="Note" />
                      </TableCell>
                      <TableCell>
                        {lines.length > 2 && <button onClick={() => removeLine(idx)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell className="text-right text-xs">Totals:</TableCell>
                    <TableCell className="text-xs">{fmt(totalDebit)}</TableCell>
                    <TableCell className="text-xs">{fmt(totalCredit)}</TableCell>
                    <TableCell colSpan={2}>
                      {totalDebit > 0 && (
                        isBalanced
                          ? <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle className="h-3 w-3" />Balanced</span>
                          : <span className="text-red-600 text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Difference: {fmt(Math.abs(totalDebit - totalCredit))}</span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!isBalanced || !description || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Post Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JournalEntryViewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useGetJournalEntryByIdQuery(id);
  const entry = data?.data;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Journal Entry — {entry?.entryNumber || '...'}</DialogTitle>
          <DialogDescription>View journal entry details and line items</DialogDescription>
        </DialogHeader>
        {isLoading ? <LoadingState /> : entry ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-muted-foreground">Date:</span> <strong>{fmtDate(entry.date)}</strong></div>
              <div><span className="text-muted-foreground">Type:</span> <Badge variant="secondary">{entry.entryType?.replace(/_/g, ' ')}</Badge></div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={entry.status === 'posted' ? 'default' : 'destructive'}>{entry.status}</Badge></div>
              <div><span className="text-muted-foreground">FY:</span> <strong>{entry.financialYear}</strong></div>
            </div>
            <p className="text-sm">{entry.description}</p>
            {entry.reference && <p className="text-xs text-muted-foreground">Ref: {entry.reference}</p>}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Narration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.lines?.map((l: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{l.accountId?.name || l.accountId?.code || '-'}</TableCell>
                    <TableCell className="text-right text-sm">{l.debit > 0 ? fmt(l.debit) : '-'}</TableCell>
                    <TableCell className="text-right text-sm">{l.credit > 0 ? fmt(l.credit) : '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.narration}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-medium bg-muted/50">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{fmt(entry.totalAmount)}</TableCell>
                  <TableCell className="text-right">{fmt(entry.totalAmount)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : <p>Not found</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Bank Accounts Tab ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function BankAccountsTab() {
  const { data, isLoading } = useGetBankAccountsQuery(undefined);
  const [createBank] = useCreateBankAccountMutation();
  const [updateBank] = useUpdateBankAccountMutation();
  const [deleteBank] = useDeleteBankAccountMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const banks = data?.data || [];

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{banks.length} bank/cash account{banks.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />Add Account
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {banks.map((b: any) => (
          <Card key={b._id}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${b.accountType === 'cash' ? 'bg-green-50' : b.accountType === 'bank' ? 'bg-blue-50' : 'bg-purple-50'}`}>
                    {b.accountType === 'cash' ? <Wallet className="h-5 w-5 text-green-600" /> : b.accountType === 'bank' ? <Landmark className="h-5 w-5 text-blue-600" /> : <DollarSign className="h-5 w-5 text-purple-600" />}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{b.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{b.accountType.replace('_', ' ')}</p>
                  </div>
                </div>
                {b.isDefault && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
              </div>
              {b.bankName && <p className="text-xs text-muted-foreground mb-1">{b.bankName} {b.accountNumber ? `— ${b.accountNumber}` : ''}</p>}
              <p className="text-xl font-bold">{fmt(b.currentBalance)}</p>
              <div className="flex gap-1 mt-3">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditItem(b)}><Edit className="h-3 w-3 mr-1" />Edit</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs text-red-500" onClick={() => {
                  if (confirm('Delete this bank account?')) deleteBank(b._id).unwrap().then(() => toast.success('Deleted')).catch((e: any) => toast.error(e?.data?.message || 'Error'));
                }}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {banks.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center text-muted-foreground">No bank accounts. Seed the Chart of Accounts or add one manually.</CardContent>
          </Card>
        )}
      </div>

      <BankAccountFormDialog open={showCreate} onClose={() => setShowCreate(false)}
        onSubmit={(data) => createBank(data).unwrap().then(() => { toast.success('Created'); setShowCreate(false); }).catch((e: any) => toast.error(e?.data?.message || 'Error'))} />

      {editItem && (
        <BankAccountFormDialog open={true} onClose={() => setEditItem(null)} initial={editItem}
          onSubmit={(data) => updateBank({ id: editItem._id, ...data }).unwrap().then(() => { toast.success('Updated'); setEditItem(null); }).catch((e: any) => toast.error(e?.data?.message || 'Error'))} />
      )}
    </div>
  );
}

function BankAccountFormDialog({ open, onClose, initial, onSubmit }: { open: boolean; onClose: () => void; initial?: any; onSubmit: (data: any) => void }) {
  const [accountName, setAccountName] = useState(initial?.name || '');
  const [accountType, setAccountType] = useState(initial?.accountType || 'bank');
  const [bankName, setBankName] = useState(initial?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber || '');
  const [branchName, setBranchName] = useState(initial?.branchName || '');
  const [openingBalance, setOpeningBalance] = useState(initial?.openingBalance || 0);
  const [isDefault, setIsDefault] = useState(initial?.isDefault || false);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit' : 'Add'} Bank/Cash Account</DialogTitle>
          <DialogDescription>{initial ? 'Update account details' : 'Add a new bank, cash or mobile wallet account'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Account Name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. School Main Account" /></div>
          <div>
            <Label>Account Type</Label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="mobile_wallet">Mobile Wallet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {accountType !== 'cash' && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Bank Name</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. HBL" /></div>
              <div><Label>Account Number</Label><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account #" /></div>
            </div>
          )}
          {accountType === 'bank' && <div><Label>Branch</Label><Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Branch name" /></div>}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Opening Balance</Label><Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} /></div>
            <div className="flex items-end">
              <Label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded" />
                <span>Default Account</span>
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit({ name: accountName, accountType, bankName, accountNumber, branchName, openingBalance, isDefault })} disabled={!accountName}>{initial ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Budgets Tab ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function BudgetsTab() {
  const fy = getCurrentFinancialYear();
  const [financialYear, setFinancialYear] = useState(fy);
  const { data, isLoading } = useGetBudgetsQuery({ financialYear });
  const { data: bvaData } = useGetBudgetVsActualQuery({ financialYear });
  const { data: accountsData } = useGetPostingAccountsQuery({ rootType: 'EXPENSE' });
  const [createBudget] = useCreateBudgetMutation();
  const [_updateBudget] = useUpdateBudgetMutation();
  const [deleteBudget] = useDeleteBudgetMutation();
  const [showCreate, setShowCreate] = useState(false);

  const budgets = data?.data || [];
  const bva = bvaData?.data?.items || [];
  const expenseAccounts = accountsData?.data || [];

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={financialYear} onValueChange={setFinancialYear}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(() => {
              const fyYear = parseInt(fy.split('-')[0]);
              return [
                `${fyYear - 1}-${fyYear}`,
                `${fyYear}-${fyYear + 1}`,
                `${fyYear + 1}-${fyYear + 2}`,
              ].map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ));
            })()}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />Add Budget
        </Button>
        <Button variant="outline" size="sm" onClick={() =>
          exportToExcel(bva.map((b: any) => ({ Account: b.accountName, Budget: b.annualBudget, Actual: b.spent, Variance: b.variance, Utilization: `${b.utilization?.toFixed(1)}%` })),
          'BvA', `budget-vs-actual-${financialYear}`)
        }>
          <Download className="h-4 w-4 mr-1" />Export
        </Button>
      </div>

      {/* Budget vs Actual Table */}
      {bva.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Budget vs Actual — {financialYear}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Annual Budget</TableHead>
                  <TableHead className="text-right">Actual Spent</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Utilization</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bva.map((b: any) => {
                  const pct = b.utilization || 0;
                  return (
                    <TableRow key={b._id}>
                      <TableCell className="text-sm">{b.accountName}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(b.annualBudget)}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(b.spent)}</TableCell>
                      <TableCell className={`text-right text-sm ${b.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(b.variance)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-orange-500' : 'bg-green-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-xs w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => {
                          if (confirm('Delete this budget?')) deleteBudget(b._id).unwrap().then(() => toast.success('Deleted')).catch((e: any) => toast.error(e?.data?.message || 'Error'));
                        }} className="p-1 hover:bg-red-50 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Budgets list fallback */}
      {bva.length === 0 && budgets.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No budgets set for {financialYear}. Create one to start tracking.</CardContent></Card>
      )}

      {/* Create budget dialog */}
      {showCreate && (
        <BudgetFormDialog open={showCreate} onClose={() => setShowCreate(false)} accounts={expenseAccounts} financialYear={financialYear}
          onSubmit={(data) => createBudget(data).unwrap().then(() => { toast.success('Budget created'); setShowCreate(false); }).catch((e: any) => toast.error(e?.data?.message || 'Error'))} />
      )}
    </div>
  );
}

function BudgetFormDialog({ open, onClose, accounts, financialYear, onSubmit }: { open: boolean; onClose: () => void; accounts: any[]; financialYear: string; onSubmit: (data: any) => void }) {
  const [accountHeadId, setAccountHeadId] = useState('');
  const [annualBudget, setAnnualBudget] = useState(0);
  const [notes, setNotes] = useState('');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Budget</DialogTitle>
          <DialogDescription>Set annual budget for an expense account — FY {financialYear}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Expense Account</Label>
            <Select value={accountHeadId} onValueChange={setAccountHeadId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a: any) => <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Annual Budget (PKR)</Label><Input type="number" value={annualBudget || ''} onChange={(e) => setAnnualBudget(Number(e.target.value))} placeholder="0" /></div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit({ accountHeadId, financialYear, annualBudget, notes })} disabled={!accountHeadId || !annualBudget}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Financial Statements Tab ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function StatementsTab() {
  const [statementType, setStatementType] = useState<'trial-balance' | 'balance-sheet' | 'income-statement' | 'cash-flow' | 'general-ledger'>('trial-balance');

  const subTabs = [
    { key: 'trial-balance', label: 'Trial Balance' },
    { key: 'balance-sheet', label: 'Balance Sheet' },
    { key: 'income-statement', label: 'Income Statement' },
    { key: 'cash-flow', label: 'Cash Flow' },
    { key: 'general-ledger', label: 'General Ledger' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
        {subTabs.map(({ key, label }) => (
          <button key={key} onClick={() => setStatementType(key)}
            className={`px-3 py-1.5 rounded-md text-sm transition-all ${statementType === key ? 'bg-background shadow text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {statementType === 'trial-balance' && <TrialBalanceStatement />}
      {statementType === 'balance-sheet' && <BalanceSheetStatement />}
      {statementType === 'income-statement' && <IncomeStatementReport />}
      {statementType === 'cash-flow' && <CashFlowStatement />}
      {statementType === 'general-ledger' && <GeneralLedgerStatement />}
    </div>
  );
}

function TrialBalanceStatement() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { data, isLoading } = useGetTrialBalanceQuery({ ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) });
  const tb = data?.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input type="date" className="w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start date" />
        <Input type="date" className="w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End date" />
        <div className="flex-1" />
        {tb && (
          <>
            <Button variant="outline" size="sm" onClick={() =>
              exportToPDF('Trial Balance', ['Code', 'Account', 'Type', 'Debit', 'Credit'],
              tb.accounts.map((a: any) => [a.code, a.name, a.rootType, a.debit?.toFixed(0) || '0', a.credit?.toFixed(0) || '0']),
              'trial-balance', true)
            }><Download className="h-4 w-4 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() =>
              exportToExcel(tb.accounts.map((a: any) => ({ Code: a.code, Account: a.name, Type: a.rootType, Debit: a.debit, Credit: a.credit })),
              'TB', 'trial-balance')
            }><Download className="h-4 w-4 mr-1" />Excel</Button>
          </>
        )}
      </div>

      {isLoading ? <LoadingState /> : tb ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Trial Balance</CardTitle>
              <Badge variant={tb.isBalanced ? 'default' : 'destructive'}>{tb.isBalanced ? 'Balanced' : 'Not Balanced'}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tb.accounts?.map((a: any) => (
                  <TableRow key={a.accountId}>
                    <TableCell className="font-mono text-xs">{a.code}</TableCell>
                    <TableCell className="text-sm">{a.name}</TableCell>
                    <TableCell><Badge className={`text-[10px] ${ROOT_TYPE_COLORS[a.rootType] || ''}`}>{a.rootType}</Badge></TableCell>
                    <TableCell className="text-right text-sm">{a.debit > 0 ? fmt(a.debit) : '-'}</TableCell>
                    <TableCell className="text-right text-sm">{a.credit > 0 ? fmt(a.credit) : '-'}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{fmt(tb.totals?.debit)}</TableCell>
                  <TableCell className="text-right">{fmt(tb.totals?.credit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function BalanceSheetStatement() {
  const [asOfDate, setAsOfDate] = useState('');
  const { data, isLoading } = useGetBalanceSheetQuery({ ...(asOfDate ? { asOfDate } : {}) });
  const bs = data?.data;

  const sections = bs ? [
    { title: 'Assets', items: bs.assets, total: bs.totalAssets, color: 'text-blue-600' },
    { title: 'Liabilities', items: bs.liabilities, total: bs.totalLiabilities, color: 'text-red-600' },
    { title: 'Equity', items: bs.equity, total: bs.totalEquity, color: 'text-purple-600' },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label className="text-sm">As of:</Label>
        <Input type="date" className="w-40" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        <div className="flex-1" />
        {bs && (
          <Button variant="outline" size="sm" onClick={() =>
            exportToPDF('Balance Sheet', ['Account', 'Amount'],
            [...bs.assets.map((a: any) => [a.name, a.balance?.toFixed(0)]), ['Total Assets', bs.totalAssets?.toFixed(0)],
            ...bs.liabilities.map((a: any) => [a.name, a.balance?.toFixed(0)]), ['Total Liabilities', bs.totalLiabilities?.toFixed(0)],
            ...bs.equity.map((a: any) => [a.name, a.balance?.toFixed(0)]), ['Total Equity', bs.totalEquity?.toFixed(0)]],
            'balance-sheet')
          }><Download className="h-4 w-4 mr-1" />PDF</Button>
        )}
      </div>

      {isLoading ? <LoadingState /> : bs ? (
        <div className="space-y-4">
          {sections.map(({ title, items, total, color }) => (
            <Card key={title}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-base ${color}`}>{title}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {items?.map((a: any) => (
                      <TableRow key={a.accountId}>
                        <TableCell className="text-sm">{a.name}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(a.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>Total {title}</TableCell>
                      <TableCell className="text-right">{fmt(total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          {/* Balance equation */}
          <Card className="border-2">
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-4 text-sm font-medium">
                <div>Assets: <span className="text-blue-600">{fmt(bs.totalAssets)}</span></div>
                <span>=</span>
                <div>Liabilities: <span className="text-red-600">{fmt(bs.totalLiabilities)}</span></div>
                <span>+</span>
                <div>Equity: <span className="text-purple-600">{fmt(bs.totalEquity)}</span></div>
                <span>+</span>
                <div>Net Income: <span className="text-green-600">{fmt(bs.netIncome)}</span></div>
                {bs.isBalanced !== undefined && (
                  <Badge variant={bs.isBalanced ? 'default' : 'destructive'} className="ml-2">{bs.isBalanced ? 'Balanced' : 'Not Balanced'}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function IncomeStatementReport() {
  const now = new Date();
  const fy = getCurrentFinancialYear();
  const [startDate, setStartDate] = useState(`${fy.split('-')[0]}-07-01`);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);
  const { data, isLoading } = useGetIncomeStatementQuery({ startDate, endDate });
  const is = data?.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input type="date" className="w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <span className="text-sm text-muted-foreground">to</span>
        <Input type="date" className="w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <div className="flex-1" />
        {is && (
          <Button variant="outline" size="sm" onClick={() =>
            exportToPDF('Income Statement', ['Account', 'Amount'],
            [...is.revenue?.map((r: any) => [r.name, r.balance?.toFixed(0)]), ['Total Revenue', is.totalRevenue?.toFixed(0)],
            ...is.expenses?.map((e: any) => [e.name, e.balance?.toFixed(0)]), ['Total Expenses', is.totalExpenses?.toFixed(0)],
            ['Net Income', is.netIncome?.toFixed(0)]],
            'income-statement')
          }><Download className="h-4 w-4 mr-1" />PDF</Button>
        )}
      </div>

      {isLoading ? <LoadingState /> : is ? (
        <div className="space-y-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-xs text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-bold text-green-600">{fmt(is.totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-xs text-muted-foreground">Total Expenses</p>
                <p className="text-xl font-bold text-red-600">{fmt(is.totalExpenses)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-xs text-muted-foreground">Net Income</p>
                <p className={`text-xl font-bold ${is.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(is.netIncome)}</p>
                {is.netIncomePercentage !== undefined && <p className="text-xs text-muted-foreground">{is.netIncomePercentage.toFixed(1)}% margin</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Revenue */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base text-green-600">Revenue</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {is.revenue?.map((r: any) => (
                      <TableRow key={r.accountId}>
                        <TableCell className="text-sm">{r.name}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-green-50">
                      <TableCell>Total Revenue</TableCell>
                      <TableCell className="text-right">{fmt(is.totalRevenue)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            {/* Expenses */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base text-red-600">Expenses</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {is.expenses?.map((e: any) => (
                      <TableRow key={e.accountId}>
                        <TableCell className="text-sm">{e.name}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(e.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-red-50">
                      <TableCell>Total Expenses</TableCell>
                      <TableCell className="text-right">{fmt(is.totalExpenses)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CashFlowStatement() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { data, isLoading } = useGetCashFlowStatementQuery({ ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) });
  const cf = data?.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input type="date" className="w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <span className="text-sm text-muted-foreground">to</span>
        <Input type="date" className="w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>

      {isLoading ? <LoadingState /> : cf ? (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-xs text-muted-foreground">Total Inflow</p>
                <p className="text-xl font-bold text-green-600">{fmt(cf.totalInflow)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-xs text-muted-foreground">Total Outflow</p>
                <p className="text-xl font-bold text-red-600">{fmt(cf.totalOutflow)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-xs text-muted-foreground">Net Cash Flow</p>
                <p className={`text-xl font-bold ${cf.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(cf.netCashFlow)}</p>
              </CardContent>
            </Card>
          </div>

          {/* By entry type */}
          {cf.byType && cf.byType.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Cash Flow by Type</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={cf.byType}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="inflow" name="Inflow" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" name="Outflow" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GeneralLedgerStatement() {
  const { data: accountsData } = useGetPostingAccountsQuery(undefined);
  const accounts = accountsData?.data || [];
  const [accountId, setAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading } = useGetGeneralLedgerQuery(
    { accountId, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) },
    { skip: !accountId }
  );
  const gl = data?.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select account" /></SelectTrigger>
          <SelectContent>
            {accounts.map((a: any) => <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <span className="text-sm text-muted-foreground">to</span>
        <Input type="date" className="w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <div className="flex-1" />
        {gl && (
          <Button variant="outline" size="sm" onClick={() =>
            exportToExcel(gl.entries?.map((e: any) => ({ Date: fmtDate(e.date), EntryNo: e.entryNumber, Description: e.description, Debit: e.debit, Credit: e.credit, Balance: e.runningBalance })),
            'GL', `general-ledger-${gl.account?.code}`)
          }><Download className="h-4 w-4 mr-1" />Excel</Button>
        )}
      </div>

      {!accountId && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Select an account to view its ledger</CardContent></Card>
      )}

      {accountId && isLoading && <LoadingState />}

      {gl && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{gl.account?.code} — {gl.account?.name}</CardTitle>
              <div className="text-sm">Opening: <strong>{fmt(gl.openingBalance)}</strong> | Closing: <strong>{fmt(gl.closingBalance)}</strong></div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Entry #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gl.entries?.map((e: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{fmtDate(e.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.entryNumber}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{e.description}</TableCell>
                    <TableCell className="text-right text-xs">{e.debit > 0 ? fmt(e.debit) : '-'}</TableCell>
                    <TableCell className="text-right text-xs">{e.credit > 0 ? fmt(e.credit) : '-'}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{fmt(e.runningBalance)}</TableCell>
                  </TableRow>
                ))}
                {(!gl.entries || gl.entries.length === 0) && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No entries found for this account</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Shared ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
