import ContentSection from '../components/content-section'
import { AppearanceForm } from './appearance-form'
import { LanguageSettings } from '../language/language-form'

export default function SettingsAppearance() {
  return (
    <ContentSection
      title='Appearance'
      desc='Customize the appearance of the app. Automatically switch between day
          and night themes.'
    >
      <div className="space-y-8">
        <AppearanceForm />
        <LanguageSettings />
      </div>
    </ContentSection>
  )
}
