import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link } from '@tanstack/react-router'
import { useUrduDisplay } from '@/context/urdu-display-context'
import { useProductDisplay } from '@/context/product-display-context'

const PRODUCT_NAME_WIDTH_OPTIONS = [
  { value: '25', label: 'Compact (~25 characters)' },
  { value: '45', label: 'Normal (~45 characters)' },
  { value: '65', label: 'Wide (~65 characters)' },
  { value: '80', label: 'Extra wide (~80 characters)' },
]

export function DisplayForm() {
  const {
    showUrduPreference,
    setShowUrdu,
    showUrduInputPreference,
    setShowUrduInput,
    nativeLanguage,
  } = useUrduDisplay()
  const { productNameMaxChars, setProductNameMaxChars } = useProductDisplay()
  const languageName = nativeLanguage?.label ?? ''

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <span>{nativeLanguage ? `${languageName} Text` : 'Native Language Text'}</span>
          {nativeLanguage && (
            <span className='text-sm font-normal text-muted-foreground' dir='auto'>
              / {nativeLanguage.nativeLabel}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {nativeLanguage ? (
            <>
              Control where {languageName} shows up in the app — in lists and invoices, in the
              auto-filled name fields on forms, or both. Turn either off if it gets in your way.
              Your business language is set in{' '}
              <Link to='/settings/localization' className='font-medium text-foreground underline underline-offset-2'>
                Localization
              </Link>
              .
            </>
          ) : (
            <>
              Your business is set to English only, so no second-language names show anywhere.
              Pick a native language (for example Urdu or Arabic) in{' '}
              <Link to='/settings/localization' className='font-medium text-foreground underline underline-offset-2'>
                Localization
              </Link>{' '}
              to turn these on.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex flex-row items-center justify-between rounded-lg border p-4'>
          <div className='space-y-0.5'>
            <Label htmlFor='show-urdu-toggle' className='text-base'>
              Show {languageName || 'native'} text
            </Label>
            <p className='text-sm text-muted-foreground'>
              Show {languageName || 'native-language'} names alongside English in lists, tables,
              and invoices. Turn this off to display English names only.
            </p>
          </div>
          <Switch
            id='show-urdu-toggle'
            checked={showUrduPreference && !!nativeLanguage}
            disabled={!nativeLanguage}
            onCheckedChange={setShowUrdu}
          />
        </div>
        <div className='flex flex-row items-center justify-between rounded-lg border p-4'>
          <div className='space-y-0.5'>
            <Label htmlFor='show-urdu-input-toggle' className='text-base'>
              Auto-translate {languageName || 'native'} name fields
            </Label>
            <p className='text-sm text-muted-foreground'>
              Show the "Name ({languageName || 'native'})" field on add/edit forms (products,
              categories, customers, suppliers, and more) and auto-fill it as you type. Turn this
              off if the automatic {languageName || 'native-language'} suggestions bother you.
            </p>
          </div>
          <Switch
            id='show-urdu-input-toggle'
            checked={showUrduInputPreference && !!nativeLanguage}
            disabled={!nativeLanguage}
            onCheckedChange={setShowUrduInput}
          />
        </div>
        <div className='flex flex-row items-center justify-between rounded-lg border p-4'>
          <div className='space-y-0.5'>
            <Label htmlFor='product-name-width' className='text-base'>
              Product name column width
            </Label>
            <p className='text-sm text-muted-foreground'>
              How much of a product's name shows before it's cut off in the Products list.
              Names longer than this still show in full on hover.
            </p>
          </div>
          <Select
            value={String(productNameMaxChars)}
            onValueChange={(value) => setProductNameMaxChars(Number(value))}
          >
            <SelectTrigger id='product-name-width' className='w-[220px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_NAME_WIDTH_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
