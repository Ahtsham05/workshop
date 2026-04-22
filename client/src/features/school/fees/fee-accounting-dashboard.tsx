import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Wallet, AlertCircle, CheckCircle, Clock, Banknote, ArrowUpRight, ArrowDownRight, CalendarDays, Zap } from 'lucide-react';
import {
  useGetSchoolAccountingDashboardQuery,
} from '@/stores/school.api';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function FeeAccountingDashboard() {
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());

  const { data: dashboard, isLoading } = useGetSchoolAccountingDashboardQuery({ month, year });

  const txnSummary = dashboard?.transactions ?? { income: 0, expense: 0, profit: 0 };
  // Use the feeCollection data returned by the dashboard (single source of truth)
  const fc = dashboard?.feeCollection ?? {
    totalExpected: 0, totalCollected: 0, totalPending: 0, collectionRate: 0,
    paid: 0, unpaid: 0, partial: 0, overdue: 0,
  };
  const recentTxns: any[] = dashboard?.recentTransactions ?? [];
  const pendingStudents: any[] = dashboard?.topPendingStudents ?? [];

  return (
    <div className="h-full w-full p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounting Dashboard</h1>
          <p className="text-muted-foreground">Financial overview for {month} {year}</p>
        </div>
        <div className="flex gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards — Row 1: Income/Expense focus */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Today's Income */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <div className="rounded-lg bg-teal-100 p-2 shrink-0 mt-0.5"><Zap className="h-4 w-4 text-teal-600" /></div>
              <div>
                <p className="text-[11px] text-muted-foreground leading-tight">Today's Income</p>
                {isLoading ? <div className="h-6 w-16 bg-muted animate-pulse rounded mt-1" /> : (
                  <p className="text-base font-bold text-teal-600 mt-0.5">PKR {(txnSummary.todayIncome || 0).toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Today's Expense */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <div className="rounded-lg bg-rose-100 p-2 shrink-0 mt-0.5"><CalendarDays className="h-4 w-4 text-rose-600" /></div>
              <div>
                <p className="text-[11px] text-muted-foreground leading-tight">Today's Expense</p>
                {isLoading ? <div className="h-6 w-16 bg-muted animate-pulse rounded mt-1" /> : (
                  <p className="text-base font-bold text-rose-600 mt-0.5">PKR {(txnSummary.todayExpense || 0).toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Month Income */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <div className="rounded-lg bg-green-100 p-2 shrink-0 mt-0.5"><TrendingUp className="h-4 w-4 text-green-600" /></div>
              <div>
                <p className="text-[11px] text-muted-foreground leading-tight">Month Income</p>
                {isLoading ? <div className="h-6 w-16 bg-muted animate-pulse rounded mt-1" /> : (
                  <p className="text-base font-bold text-green-600 mt-0.5">PKR {(fc.totalCollected || 0).toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Month Expense */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <div className="rounded-lg bg-red-100 p-2 shrink-0 mt-0.5"><TrendingDown className="h-4 w-4 text-red-600" /></div>
              <div>
                <p className="text-[11px] text-muted-foreground leading-tight">Month Expense</p>
                {isLoading ? <div className="h-6 w-16 bg-muted animate-pulse rounded mt-1" /> : (
                  <p className="text-base font-bold text-red-600 mt-0.5">PKR {(txnSummary.expense || 0).toLocaleString()}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Net Profit */}
        {(() => {
          const netProfit = (fc.totalCollected || 0) - (txnSummary.expense || 0);
          return (
            <Card className="lg:col-span-1">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-2.5">
                  <div className={`rounded-lg p-2 shrink-0 mt-0.5 ${netProfit >= 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
                    <Wallet className={`h-4 w-4 ${netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-tight">Net Profit</p>
                    {isLoading ? <div className="h-6 w-16 bg-muted animate-pulse rounded mt-1" /> : (
                      <p className={`text-base font-bold mt-0.5 ${netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        PKR {netProfit.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}
        {/* Collection Rate */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <div className="rounded-lg bg-purple-100 p-2 shrink-0 mt-0.5"><CheckCircle className="h-4 w-4 text-purple-600" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground leading-tight">Collection Rate</p>
                {isLoading ? <div className="h-6 w-12 bg-muted animate-pulse rounded mt-1" /> : (
                  <>
                    <p className="text-base font-bold text-purple-600 mt-0.5">{fc.collectionRate}%</p>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-1">
                      <div className="h-1 bg-purple-500 rounded-full" style={{ width: `${fc.collectionRate || 0}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {(fc.totalCollected || 0).toLocaleString()} / {(fc.totalExpected || 0).toLocaleString()}
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fee Collection Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Voucher Status Breakdown */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Voucher Status — {month} {year}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: 'paid', label: 'Paid', icon: CheckCircle, color: 'text-green-600 bg-green-50' },
                  { key: 'unpaid', label: 'Unpaid', icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
                  { key: 'partial', label: 'Partial', icon: TrendingUp, color: 'text-orange-600 bg-orange-50' },
                  { key: 'overdue', label: 'Overdue', icon: AlertCircle, color: 'text-red-600 bg-red-50' },
                ].map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className={`rounded-lg p-3 ${color.split(' ')[1]} text-center`}>
                    <Icon className={`h-5 w-5 mx-auto mb-1 ${color.split(' ')[0]}`} />
                    <p className={`text-2xl font-bold ${color.split(' ')[0]}`}>{(fc as any)[key] || 0}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fee Amount Breakdown */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-1.5"><Banknote className="h-4 w-4 text-blue-500" /> Fee Collection — {month} {year}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-5 bg-muted animate-pulse rounded" />)}</div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Expected</span>
                  <span className="font-semibold">PKR {(fc.totalExpected || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-green-600"><ArrowUpRight className="h-3.5 w-3.5" /> Collected</span>
                  <span className="font-semibold text-green-600">PKR {(fc.totalCollected || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-red-500"><ArrowDownRight className="h-3.5 w-3.5" /> Pending</span>
                  <span className="font-semibold text-red-500">PKR {(fc.totalPending || 0).toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-2 bg-green-500 rounded-full transition-all"
                    style={{ width: `${fc.collectionRate || 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">{fc.collectionRate || 0}% collected</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Recent Transactions */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recent Transactions — {month} {year}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
            ) : recentTxns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No transactions this period</p>
            ) : (
              <div className="space-y-2">
                {recentTxns.slice(0, 8).map((t: any) => (
                  <div key={t.id || t._id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.description || t.categoryId?.name || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                        {t.paymentMethod && <span className="ml-1 capitalize">· {t.paymentMethod}</span>}
                      </p>
                    </div>
                    <Badge variant={t.type === 'INCOME' ? 'default' : 'destructive'} className="text-[10px] shrink-0">
                      {t.type === 'INCOME' ? '+' : '-'}PKR {(t.amount || 0).toLocaleString()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Pending Students */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-1.5"><AlertCircle className="h-4 w-4 text-orange-500" /> Top Pending Fees</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
            ) : pendingStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No pending fees 🎉</p>
            ) : (
              <div className="space-y-2">
                {pendingStudents.slice(0, 8).map((s: any) => (
                  <div key={s._id || s.studentId} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.studentName || s.name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{s.admissionNumber || ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-orange-600 font-semibold">PKR {(s.totalPending || s.pendingAmount || 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{s.voucherCount} voucher{s.voucherCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
