import { Separator } from '@/components/ui/separator'
import ContentSection from '../components/content-section'
import { AppearanceForm } from './appearance-form'
import { LanguageSettings } from '../language/language-form'
import { RowColorsSection } from './row-colors-section'
import { BranchColorsSection } from './branch-colors-section'
import { ThemeColorSection } from './theme-color-section'
import { ThemePresetSection } from './theme-preset-section'
import { CustomColorsSection } from './custom-colors-section'
import { ZoomSection } from './zoom-section'

export default function SettingsAppearance() {
  return (
    <ContentSection
      title='Appearance'
      desc='The size of the whole app (zoom), a ready-made theme, the app accent colour, your own background, header and menu colours,
          the colour of each branch, and the table row colours you read all day.'
    >
      <div className='space-y-8'>
        <ZoomSection />
        <Separator />
        <ThemePresetSection />
        <Separator />
        <ThemeColorSection />
        <Separator />
        <CustomColorsSection />
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
