import ContentSection from '../components/content-section'
import { SyncConflictsForm } from './sync-conflicts-form'

export default function SettingsSyncConflicts() {
  return (
    <ContentSection
      title="Sync Conflicts"
      desc="Review and resolve changes that conflict between this device and the server."
    >
      <SyncConflictsForm />
    </ContentSection>
  )
}
