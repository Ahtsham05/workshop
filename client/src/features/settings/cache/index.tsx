import ContentSection from '../components/content-section'
import { CacheManagementForm } from './cache-management-form'

export default function SettingsCacheManagement() {
  return (
    <ContentSection
      title="Cache Management"
      desc="Monitor offline API cache usage, configure TTL expiry, and refresh or clear cached data."
    >
      <CacheManagementForm />
    </ContentSection>
  )
}
