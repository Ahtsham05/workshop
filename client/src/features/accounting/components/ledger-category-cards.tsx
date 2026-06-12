import { Badge } from '@/components/ui/badge';
import { Receipt } from 'lucide-react';
import type { LedgerStatementEntry } from '@/features/accounting/components/ledger-statement-table';

export interface LedgerCategoryGroup {
  category: { key: string; labelKey: string; sortOrder: number };
  entries: LedgerStatementEntry[];
  totalDebit: number;
  totalCredit: number;
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#94a3b8',
];

const fmt = (v: number) =>
  `Rs ${Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  groups: LedgerCategoryGroup[];
  totalActivity: number;
  t: (key: string) => string;
  onSelectCategory: (group: LedgerCategoryGroup) => void;
}

export function LedgerCategoryCards({ groups, totalActivity, t, onSelectCategory }: Props) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <Receipt className="h-10 w-10 mb-2 opacity-30" />
        <p>{t('No transactions found')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {groups.map((group, idx) => {
        const activity = group.totalDebit + group.totalCredit;
        const share = totalActivity ? ((activity / totalActivity) * 100).toFixed(1) : '0';
        const avg = group.entries.length ? activity / group.entries.length : 0;
        const color = COLORS[idx % COLORS.length];

        return (
          <button
            key={group.category.key}
            type="button"
            onClick={() => onSelectCategory(group)}
            className="text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold"
                style={{ backgroundColor: color }}
              >
                {t(group.category.labelKey).charAt(0).toUpperCase()}
              </span>
              <Badge variant="secondary" className="text-xs">{share}%</Badge>
            </div>
            <p className="font-semibold text-sm leading-tight mb-0.5 line-clamp-2">
              {t(group.category.labelKey)}
            </p>
            <p className="text-xl font-bold tabular-nums" style={{ color }}>
              {fmt(activity)}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{group.entries.length} {t('entries')}</span>
              <span>{t('avg')} {fmt(avg)}</span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${share}%`, backgroundColor: color }}
              />
            </div>
            <p className="mt-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              {t('Click to view details →')}
            </p>
          </button>
        );
      })}
    </div>
  );
}
