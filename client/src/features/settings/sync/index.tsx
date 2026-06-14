import ContentSection from '../components/content-section'
import { SyncDashboardForm } from './sync-dashboard-form'

export default function SettingsSyncDashboard() {
  return (
    <ContentSection
      title="Synchronization"
      desc="Monitor offline sync status, retry failed uploads, and manage the local data cache."
    >
      <SyncDashboardForm />
    </ContentSection>
  )
}
