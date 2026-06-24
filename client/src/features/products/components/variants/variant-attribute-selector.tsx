import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useGetAllProductAttributesQuery,
  useCreateProductAttributeMutation,
} from '@/stores/productAttribute.api'
import type { SelectedAttribute } from './generate-variant-combinations'

interface Props {
  selected: SelectedAttribute[]
  onChange: (selected: SelectedAttribute[]) => void
}

/** Pick which attributes (Size, Color, ...) apply to this product, and which values of each to use. */
export function VariantAttributeSelector({ selected, onChange }: Props) {
  const { data: attributes = [], isLoading } = useGetAllProductAttributesQuery()
  const [createProductAttribute, { isLoading: isCreatingAttribute }] = useCreateProductAttributeMutation()
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({})
  const [newAttributeName, setNewAttributeName] = useState('')

  const addNewAttribute = async () => {
    const name = newAttributeName.trim()
    if (!name) return
    if (attributes.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists`)
      return
    }
    try {
      const created = await createProductAttribute({ name, values: [] }).unwrap()
      setNewAttributeName('')
      onChange([...selected, { name: created.name, values: [] }])
    } catch {
      toast.error(`Failed to create attribute "${name}"`)
    }
  }

  const isAttributeSelected = (name: string) => selected.some((a) => a.name === name)

  const toggleAttribute = (name: string) => {
    if (isAttributeSelected(name)) {
      onChange(selected.filter((a) => a.name !== name))
    } else {
      onChange([...selected, { name, values: [] }])
    }
  }

  const toggleValue = (attrName: string, value: string) => {
    onChange(
      selected.map((a) => {
        if (a.name !== attrName) return a
        const has = a.values.includes(value)
        return { ...a, values: has ? a.values.filter((v) => v !== value) : [...a.values, value] }
      })
    )
  }

  const addCustomValue = (attrName: string) => {
    const value = (valueDraft[attrName] || '').trim()
    if (!value) return
    const attr = selected.find((a) => a.name === attrName)
    if (attr?.values.includes(value)) return
    onChange(
      selected.map((a) => (a.name === attrName ? { ...a, values: [...a.values, value] } : a))
    )
    setValueDraft((prev) => ({ ...prev, [attrName]: '' }))
  }

  if (isLoading) {
    return <p className='text-sm text-muted-foreground'>Loading attributes…</p>
  }

  const newAttributeRow = (
    <div className='flex items-center gap-2'>
      <Input
        placeholder='New attribute name, e.g. Size'
        value={newAttributeName}
        showVoiceInput={false}
        onChange={(e) => setNewAttributeName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addNewAttribute()
          }
        }}
        className='h-8 max-w-xs'
      />
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={isCreatingAttribute || !newAttributeName.trim()}
        onClick={addNewAttribute}
      >
        <Plus className='mr-1 h-3.5 w-3.5' />
        Add attribute
      </Button>
    </div>
  )

  if (attributes.length === 0) {
    return (
      <div className='space-y-2'>
        <p className='text-sm text-muted-foreground'>
          No attributes defined yet for your organization. Create one below to start building
          variants (e.g. "Size", then add values like S/M/L once it's created).
        </p>
        {newAttributeRow}
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        {attributes.map((attr) => (
          <Badge
            key={attr.id || attr._id}
            variant={isAttributeSelected(attr.name) ? 'default' : 'outline'}
            className='cursor-pointer select-none px-3 py-1.5'
            onClick={() => toggleAttribute(attr.name)}
          >
            {attr.name}
          </Badge>
        ))}
      </div>
      {newAttributeRow}

      {selected.map((attr) => {
        const definition = attributes.find((a) => a.name === attr.name)
        const availableValues = definition?.values || []
        return (
          <div key={attr.name} className='rounded-lg border border-border/60 p-3'>
            <p className='mb-2 text-sm font-medium'>{attr.name} values</p>
            <div className='mb-2 flex flex-wrap gap-2'>
              {availableValues.map((value) => (
                <label key={value} className='flex items-center gap-1.5 text-sm'>
                  <Checkbox
                    checked={attr.values.includes(value)}
                    onCheckedChange={() => toggleValue(attr.name, value)}
                  />
                  {value}
                </label>
              ))}
            </div>
            <div className='flex items-center gap-2'>
              <Input
                placeholder={`Add a custom ${attr.name.toLowerCase()} value`}
                value={valueDraft[attr.name] || ''}
                showVoiceInput={false}
                onChange={(e) => setValueDraft((prev) => ({ ...prev, [attr.name]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomValue(attr.name)
                  }
                }}
                className='h-8 max-w-xs'
              />
              <Button type='button' size='sm' variant='outline' onClick={() => addCustomValue(attr.name)}>
                <Plus className='h-3.5 w-3.5' />
              </Button>
            </div>
            {attr.values.length > 0 && (
              <div className='mt-2 flex flex-wrap gap-1.5'>
                {attr.values.map((value) => (
                  <Badge key={value} variant='secondary' className='gap-1 pr-1'>
                    {value}
                    <button type='button' onClick={() => toggleValue(attr.name, value)} className='ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20'>
                      <X className='h-3 w-3' />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
