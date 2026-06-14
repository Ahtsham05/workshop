import ContentSection from '../components/content-section'
import { OfflineModeForm } from './offline-mode-form'

export default function SettingsOfflineMode() {
  return (
    <ContentSection
      title="Offline Mode"
      desc="Download all business data to this device for full offline use across every module."
    >
      <OfflineModeForm />
    </ContentSection>
  )
}
