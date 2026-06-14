import ContentSection from '../components/content-section'
import { LocalDatabaseForm } from './local-database-form'

export default function SettingsLocalDatabase() {
  return (
    <ContentSection
      title="Local Database"
      desc="Configure local MongoDB for fully offline shops, or switch back to cloud Atlas."
    >
      <LocalDatabaseForm />
    </ContentSection>
  )
}
