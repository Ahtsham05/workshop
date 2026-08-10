import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/context/language-context';
import { usePermissions } from '@/context/permission-context';
import { PartnersTab } from './partners-tab';
import { ProfitShareRulesTab } from './profit-share-rules-tab';
import { PartnerLedgerTab } from './partner-ledger-tab';

export default function PartnersPage() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const canViewRules = hasPermission('viewPartnerProfitShareRules');
  const canViewLedger = hasPermission('viewPartnerProfitShareLedger');
  const hasExtraTabs = canViewRules || canViewLedger;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('partners_management') || 'Partners & Investors'}</h1>
        <p className="text-muted-foreground mt-2">
          {t('partners_management_description') ||
            'Track business partners and product investors, and pay out their share of profit automatically as sales happen.'}
        </p>
      </div>

      {hasExtraTabs ? (
        <Tabs defaultValue="partners">
          <TabsList>
            <TabsTrigger value="partners">{t('partners_management') || 'Partners'}</TabsTrigger>
            {canViewRules && (
              <TabsTrigger value="profit-share-rules">{t('profit_share_rules') || 'Profit-Share Rules'}</TabsTrigger>
            )}
            {canViewLedger && (
              <TabsTrigger value="partner-ledger">{t('partner_ledger') || 'Ledger & Payouts'}</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="partners" className="mt-4">
            <PartnersTab />
          </TabsContent>
          {canViewRules && (
            <TabsContent value="profit-share-rules" className="mt-4">
              <ProfitShareRulesTab />
            </TabsContent>
          )}
          {canViewLedger && (
            <TabsContent value="partner-ledger" className="mt-4">
              <PartnerLedgerTab />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <PartnersTab />
      )}
    </div>
  );
}
