import { useLanguage } from "@/context/language-context"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function LanguageSettings() {
  const { language, setLanguage } = useLanguage()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Language / زبان</CardTitle>
        <CardDescription>
          Choose your preferred language / اپنی پسندیدہ زبان کا انتخاب کریں
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <RadioGroup
          defaultValue={language}
          onValueChange={(value) => setLanguage(value as 'en' | 'ur')}
          className="grid grid-cols-2 gap-4"
        >
          <div>
            <RadioGroupItem value="en" id="en" className="peer sr-only" />
            <Label
              htmlFor="en"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <span>English</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem value="ur" id="ur" className="peer sr-only" />
            <Label
              htmlFor="ur"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary font-urdu"
            >
              <span>اردو</span>
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  )
}
