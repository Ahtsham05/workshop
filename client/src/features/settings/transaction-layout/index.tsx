import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TransactionLayoutForm } from '@/components/transaction-layout-form'
import ContentSection from '../components/content-section'

export default function SettingsTransactionLayout() {
  return (
    <ContentSection
      title='Invoice & Purchase screens'
      desc='Turn toolbar buttons and side cards on or off on New Invoice and New Purchase. With Summary and Payment both off, the items list takes the full width.'
    >
      <Tabs defaultValue='sale'>
        <TabsList className='mb-4'>
          <TabsTrigger value='sale'>New Invoice</TabsTrigger>
          <TabsTrigger value='purchase'>New Purchase</TabsTrigger>
        </TabsList>
        <TabsContent value='sale'>
          <TransactionLayoutForm kind='sale' />
        </TabsContent>
        <TabsContent value='purchase'>
          <TransactionLayoutForm kind='purchase' />
        </TabsContent>
      </Tabs>
    </ContentSection>
  )
}
