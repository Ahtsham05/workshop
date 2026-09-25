import { Separator } from '@/components/ui/separator'
import ContentSection from '../components/content-section'
import { AppearanceForm } from './appearance-form'
import { LanguageSettings } from '../language/language-form'
import { RowColorsSection } from './row-colors-section'
import { BranchColorsSection } from './branch-colors-section'
import { ThemeColorSection } from './theme-color-section'
import { ThemePresetSection } from './theme-preset-section'

export default function SettingsAppearance() {
  return (
    <ContentSection
      title='Appearance'
      desc='A ready-made theme, the app accent colour, the colour of each branch,
          and the table row colours you read all day.'
    >
      <div className='space-y-8'>
        <ThemePresetSection />
        <Separator />
        <ThemeColorSection />
        <Separator />
        <BranchColorsSection />
        <Separator />
        <RowColorsSection />
        <Separator />
        <AppearanceForm />
        <LanguageSettings />
      </div>
    </ContentSection>
  )
}
