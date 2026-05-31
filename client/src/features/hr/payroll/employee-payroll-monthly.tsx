import { useMemo } from 'react';
import { useLanguage } from '@/context/language-context';
import { useGetEmployeeMonthlyPayrollSummaryQuery } from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type MonthlyPayrollRow = {
  month: number;
  year: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  totalSalary: number;
  salaryPaid: number;
  advancePaid: number;
  grossSalary: number;
  advanceDeduction: number;
  totalPaid: number;
  remainingPayable: number;
  overpaymentFromPreviousMonth: number;
  extraPaidThisMonth: number;
  overpaymentToNextMonth: number;
  openingBalance: number;
  closingBalance: number;
  status: string;
  hasActivity: boolean;
};

type Props = {
  employeeId: string;
  year: number;
  onYearChange: (year: number) => void;
};

export function EmployeePayrollMonthlySummary({ employeeId, year, onYearChange }: Props) {
  const { t } = useLanguage();
  const { data, isLoading } = useGetEmployeeMonthlyPayrollSummaryQuery(
    { employeeId, year },
    { skip: !employeeId },
  );

  const years = useMemo(
    () => Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i),
    [],
  );

  const defaultTab = useMemo(() => {
    if (!data?.months?.length) return '1';
    const currentMonth = new Date().getMonth() + 1;
    const activeMonth = [...data.months]
      .reverse()
      .find((m) => m.hasActivity)?.month || currentMonth;
    return String(activeMonth);
  }, [data?.months]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(amount || 0);

  if (!employeeId) return null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{t('Monthly Payroll Summary')}</CardTitle>
          {data?.employee?.name && (
            <p className="text-sm text-muted-foreground mt-1">
              {data.employee.name} ({data.employee.employeeId})
            </p>
          )}
        </div>
        <Select value={String(year)} onValueChange={(value) => onYearChange(Number(value))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t('Loading...')}
          </div>
        ) : !data?.months?.length ? (
          <p className="text-center py-8 text-muted-foreground">{t('No payroll data found')}</p>
        ) : (
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              {data.months.map((monthRow: MonthlyPayrollRow) => (
                <TabsTrigger
                  key={monthRow.month}
                  value={String(monthRow.month)}
                  className="text-xs sm:text-sm"
                >
                  {t(MONTHS[monthRow.month - 1]).slice(0, 3)}
                </TabsTrigger>
              ))}
            </TabsList>

            {data.months.map((monthRow: MonthlyPayrollRow) => (
              <TabsContent key={monthRow.month} value={String(monthRow.month)} className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {t(MONTHS[monthRow.month - 1])} {monthRow.year}
                  </Badge>
                  <Badge variant={monthRow.status === 'Paid' ? 'default' : 'secondary'}>
                    {monthRow.status}
                  </Badge>
                </div>

                {monthRow.overpaymentFromPreviousMonth > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {t('Overpayment from previous month')}:{' '}
                    <strong>{formatCurrency(monthRow.overpaymentFromPreviousMonth)}</strong>
                    {' — '}
                    {t('This amount was paid extra last month and is adjusted in this month.')}
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SummaryTile label={t('Total Days')} value={String(monthRow.workingDays)} />
                  <SummaryTile label={t('Present Days')} value={String(monthRow.presentDays)} tone="green" />
                  <SummaryTile label={t('Absent Days')} value={String(monthRow.absentDays)} tone="red" />
                  <SummaryTile label={t('Leave Days')} value={String(monthRow.leaveDays)} tone="orange" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <SummaryTile
                    label={t('Total Salary')}
                    value={formatCurrency(monthRow.totalSalary)}
                    tone="blue"
                  />
                  <SummaryTile
                    label={t('Salary Paid')}
                    value={formatCurrency(monthRow.salaryPaid)}
                    tone="green"
                  />
                  <SummaryTile
                    label={t('Advance Paid')}
                    value={formatCurrency(monthRow.advancePaid)}
                    tone="orange"
                  />
                  <SummaryTile
                    label={t('Remaining Payable')}
                    value={formatCurrency(monthRow.remainingPayable)}
                    tone="red"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">{t('Gross Salary')}</p>
                    <p className="font-semibold">{formatCurrency(monthRow.grossSalary)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">{t('Advance Deduction')}</p>
                    <p className="font-semibold">{formatCurrency(monthRow.advanceDeduction)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">{t('Total Paid This Month')}</p>
                    <p className="font-semibold">{formatCurrency(monthRow.totalPaid)}</p>
                  </div>
                </div>

                {monthRow.extraPaidThisMonth > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    {t('Extra paid this month')}:{' '}
                    <strong>{formatCurrency(monthRow.extraPaidThisMonth)}</strong>
                    {monthRow.overpaymentToNextMonth > 0 && (
                      <>
                        {' — '}
                        {t('Carried to next month')}:{' '}
                        <strong>{formatCurrency(monthRow.overpaymentToNextMonth)}</strong>
                      </>
                    )}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'blue' | 'green' | 'red' | 'orange';
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-green-50'
      : tone === 'red'
        ? 'bg-red-50'
        : tone === 'orange'
          ? 'bg-orange-50'
          : tone === 'blue'
            ? 'bg-blue-50'
            : 'bg-muted/40';

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
