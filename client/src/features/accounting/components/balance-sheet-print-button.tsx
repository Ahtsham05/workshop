import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/context/language-context';
import type { RootState } from '@/stores/store';
import { useGetBranchQuery } from '@/stores/branch.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { useCurrencyMeta } from '@/lib/format-money';
import { resolveBranchCompanyName } from '@/utils/branch-company-name';
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils';
import {
  generateBalanceSheetHTML,
  type BalanceSheetLanguage,
  type BalanceSheetParty,
  type BalanceSheetRow,
} from '../utils/party-balance-sheet-print';

const PRINT_LANGUAGE_KEY = 'party-balance-sheet-language';

function getStoredPrintLanguage(): BalanceSheetLanguage {
  try {
    return localStorage.getItem(PRINT_LANGUAGE_KEY) === 'en' ? 'en' : 'ur';
  } catch {
    return 'ur';
  }
}

const copy = {
  customer: {
    title: 'Print Customer Balances',
    description:
      'All customers with phone and balance, highest balance first, with an empty Received column to fill in by hand.',
    zeroHint: '{{count}} customers have no balance',
    hideZero: 'Hide zero-balance customers',
    action: 'Print {{count}} customers',
  },
  supplier: {
    title: 'Print Supplier Balances',
    description:
      'All suppliers with phone and balance, highest balance first, with an empty Paid column to fill in by hand.',
    zeroHint: '{{count}} suppliers have no balance',
    hideZero: 'Hide zero-balance suppliers',
    action: 'Print {{count}} suppliers',
  },
} as const;

interface BalanceSheetPrintButtonProps {
  party: BalanceSheetParty;
  /** The whole list — the sheet ignores the current page and search. */
  rows: BalanceSheetRow[];
  disabled?: boolean;
}

/** "Print List" button + options dialog for the customer / supplier ledger lists. */
export function BalanceSheetPrintButton({ party, rows, disabled }: BalanceSheetPrintButtonProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<BalanceSheetLanguage>(getStoredPrintLanguage);
  const [hideSettled, setHideSettled] = useState(false);
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId);
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId });
  const { data: orgData } = useGetMyOrganizationQuery();
  const currencyMeta = useCurrencyMeta();
  const text = copy[party];

  const settledCount = rows.filter((r) => Math.abs(Number(r.balance) || 0) < 0.005).length;
  const printCount = hideSettled ? rows.length - settledCount : rows.length;

  const print = () => {
    try {
      try {
        localStorage.setItem(PRINT_LANGUAGE_KEY, language);
      } catch {
        // Remembering the language is a convenience only.
      }
      const html = generateBalanceSheetHTML({
        party,
        rows,
        language,
        hideSettled,
        companyName: resolveBranchCompanyName(orgData?.name, branchData?.name),
        companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim(),
        companyAddress: [branchData?.location?.address, branchData?.location?.city]
          .filter(Boolean)
          .join(', '),
        companyPhone: branchData?.phone,
        companyLogo: orgData?.logo?.url,
        currencyMeta,
      });
      openPrintWindowForFormat(html, 'a4');
      setOpen(false);
    } catch (error: any) {
      console.error('Print error:', error);
      toast.error(error?.message || t('print_error'));
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled || rows.length === 0}
        className="shrink-0"
      >
        <Printer className="w-4 h-4 mr-2" />
        {t('Print List')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(text.title)}</DialogTitle>
            <DialogDescription>{t(text.description)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>{t('Print language')}</Label>
              <RadioGroup
                value={language}
                onValueChange={(v) => setLanguage(v === 'en' ? 'en' : 'ur')}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor={`${party}-balance-sheet-ur`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem id={`${party}-balance-sheet-ur`} value="ur" />
                  <span>اردو</span>
                </Label>
                <Label
                  htmlFor={`${party}-balance-sheet-en`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem id={`${party}-balance-sheet-en`} value="en" />
                  <span>English</span>
                </Label>
              </RadioGroup>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <Label htmlFor={`${party}-balance-sheet-hide-settled`}>{t(text.hideZero)}</Label>
                <p className="text-xs text-muted-foreground">{t(text.zeroHint, { count: settledCount })}</p>
              </div>
              <Switch
                id={`${party}-balance-sheet-hide-settled`}
                checked={hideSettled}
                onCheckedChange={setHideSettled}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={print} disabled={printCount === 0}>
              <Printer className="w-4 h-4 mr-2" />
              {t(text.action, { count: printCount })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
