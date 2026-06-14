import ContentSection from '../components/content-section'
import { BackupRestoreForm } from './backup-restore-form'

export default function SettingsBackupRestore() {
  return (
    <ContentSection
      title="Backup & Restore"
      desc="Back up local SQLite data, sync queues, and local MongoDB to a folder, USB drive, or network share."
    >
      <BackupRestoreForm />
    </ContentSection>
  )
}
