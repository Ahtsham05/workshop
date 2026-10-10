import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLanguage } from '@/context/language-context';
import { formatAppDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import {
  LEDGER_PERIOD_PRESETS,
  isAllTimePeriod,
  resolveLedgerPeriod,
  type LedgerPeriod,
} from '../utils/ledger-period';

/** "YYYY-MM-DD" → local calendar date, without the UTC shift `new Date(key)` applies. */
const keyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

interface LedgerPeriodSelectorProps {
  period: LedgerPeriod;
  onChange: (period: LedgerPeriod) => void;
}

/** Statement Period card for the customer / supplier ledger: quick presets + custom range. */
export function LedgerPeriodSelector({ period, onChange }: LedgerPeriodSelectorProps) {
  const { t } = useLanguage();
  const allTime = isAllTimePeriod(period);

  const pickDate = (field: 'startDate' | 'endDate', date: Date | undefined) => {
    if (!date) return;
    const next = { ...period, preset: 'custom' as const, [field]: format(date, 'yyyy-MM-dd') };
    // Keep the range the right way round when one end is moved past the other.
    if (next.startDate > next.endDate) {
      if (field === 'startDate') next.endDate = next.startDate;
      else next.startDate = next.endDate;
    }
    onChange(next);
  };

  const dateButton = (field: 'startDate' | 'endDate', label: string) => (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">
              {field === 'startDate' && allTime ? t('Beginning') : formatAppDate(keyToDate(period[field]))}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={keyToDate(period[field])}
            defaultMonth={keyToDate(period[field])}
            onSelect={(date) => pickDate(field, date)}
            disabled={{ after: new Date() }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="mb-3 text-sm font-medium">{t('Statement Period')}</p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t('Statement Period')}>
        {LEDGER_PERIOD_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            size="sm"
            variant={period.preset === preset.value ? 'default' : 'outline'}
            aria-pressed={period.preset === preset.value}
            className={cn('h-7 rounded-full px-3 text-xs')}
            onClick={() => onChange(resolveLedgerPeriod(preset.value))}
          >
            {t(preset.label)}
          </Button>
        ))}
        {period.preset === 'custom' && (
          <span className="inline-flex h-7 items-center rounded-full border border-dashed px-3 text-xs text-muted-foreground">
            {t('Custom')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {dateButton('startDate', t('start_date'))}
        {dateButton('endDate', t('end_date'))}
      </div>
    </div>
  );
}

/** Short human label for the selected period — used in captions and on the printed statement. */
export function formatLedgerPeriodRange(period: { startDate: string; endDate: string }, beginningLabel: string) {
  const start = isAllTimePeriod(period) ? beginningLabel : formatAppDate(keyToDate(period.startDate));
  return `${start} — ${formatAppDate(keyToDate(period.endDate))}`;
}
