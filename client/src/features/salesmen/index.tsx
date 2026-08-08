import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/context/language-context';
import { usePermissions } from '@/context/permission-context';
import { SalesmenTab } from './salesmen-tab';
import { CommissionRulesTab } from './commission-rules-tab';
import { CommissionLedgerTab } from './commission-ledger-tab';

export default function SalesmenPage() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const canViewCommissionRules = hasPermission('viewCommissionRules');
  const canViewCommissionLedger = hasPermission('viewCommissionLedger');
  const hasExtraTabs = canViewCommissionRules || canViewCommissionLedger;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('salesmen_management') || 'Salesmen'}</h1>
        <p className="text-muted-foreground mt-2">
          {t('salesmen_management_description') ||
            'Turn staff logins into a tracked sales team with commission rates.'}
        </p>
      </div>

      {hasExtraTabs ? (
        <Tabs defaultValue="salesmen">
          <TabsList>
            <TabsTrigger value="salesmen">{t('salesmen_management') || 'Salesmen'}</TabsTrigger>
            {canViewCommissionRules && (
              <TabsTrigger value="commission-rules">{t('commission_rules') || 'Commission Rules'}</TabsTrigger>
            )}
            {canViewCommissionLedger && (
              <TabsTrigger value="commission-ledger">{t('commission_ledger') || 'Commission Ledger'}</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="salesmen" className="mt-4">
            <SalesmenTab />
          </TabsContent>
          {canViewCommissionRules && (
            <TabsContent value="commission-rules" className="mt-4">
              <CommissionRulesTab />
            </TabsContent>
          )}
          {canViewCommissionLedger && (
            <TabsContent value="commission-ledger" className="mt-4">
              <CommissionLedgerTab />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <SalesmenTab />
      )}
    </div>
  );
}
