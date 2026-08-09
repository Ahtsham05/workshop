import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useUrduDisplay } from '@/context/urdu-display-context'

export function DisplayForm() {
  const { showUrdu, setShowUrdu } = useUrduDisplay()

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <span>Urdu Text</span>
          <span className='text-sm font-normal text-muted-foreground'>/ اردو متن</span>
        </CardTitle>
        <CardDescription>
          Show Urdu names alongside English throughout the app (products, categories,
          customers, suppliers, invoices, and more).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex flex-row items-center justify-between rounded-lg border p-4'>
          <div className='space-y-0.5'>
            <Label htmlFor='show-urdu-toggle' className='text-base'>
              Show Urdu text
            </Label>
            <p className='text-sm text-muted-foreground'>
              Turn this off to display English names only.
            </p>
          </div>
          <Switch id='show-urdu-toggle' checked={showUrdu} onCheckedChange={setShowUrdu} />
        </div>
      </CardContent>
    </Card>
  )
}
