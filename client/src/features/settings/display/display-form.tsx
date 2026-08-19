import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useUrduDisplay } from '@/context/urdu-display-context'

export function DisplayForm() {
  const { showUrdu, setShowUrdu, showUrduInput, setShowUrduInput } = useUrduDisplay()

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <span>Urdu Text</span>
          <span className='text-sm font-normal text-muted-foreground'>/ اردو متن</span>
        </CardTitle>
        <CardDescription>
          Control where Urdu shows up in the app — in lists and invoices, in the auto-filled
          name fields on forms, or both. Turn either off if it gets in your way.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex flex-row items-center justify-between rounded-lg border p-4'>
          <div className='space-y-0.5'>
            <Label htmlFor='show-urdu-toggle' className='text-base'>
              Show Urdu text
            </Label>
            <p className='text-sm text-muted-foreground'>
              Show Urdu names alongside English in lists, tables, and invoices. Turn this off
              to display English names only.
            </p>
          </div>
          <Switch id='show-urdu-toggle' checked={showUrdu} onCheckedChange={setShowUrdu} />
        </div>
        <div className='flex flex-row items-center justify-between rounded-lg border p-4'>
          <div className='space-y-0.5'>
            <Label htmlFor='show-urdu-input-toggle' className='text-base'>
              Auto-translate Urdu name fields
            </Label>
            <p className='text-sm text-muted-foreground'>
              Show the "Name (Urdu)" field on add/edit forms (products, categories, customers,
              suppliers, and more) and auto-fill it as you type. Turn this off if the automatic
              Urdu suggestions bother you.
            </p>
          </div>
          <Switch
            id='show-urdu-input-toggle'
            checked={showUrduInput}
            onCheckedChange={setShowUrduInput}
          />
        </div>
      </CardContent>
    </Card>
  )
}
