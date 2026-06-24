import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, X, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  useGetAllProductAttributesQuery,
  useCreateProductAttributeMutation,
  useUpdateProductAttributeMutation,
  useDeleteProductAttributeMutation,
  type ProductAttribute,
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
  const [updateProductAttribute] = useUpdateProductAttributeMutation()
  const [deleteProductAttribute] = useDeleteProductAttributeMutation()
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({})
  const [newAttributeName, setNewAttributeName] = useState('')
  const [attributePendingDelete, setAttributePendingDelete] = useState<ProductAttribute | null>(null)

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

  const confirmDeleteAttribute = async () => {
    if (!attributePendingDelete) return
    const id = attributePendingDelete._id || attributePendingDelete.id || ''
    try {
      await deleteProductAttribute(id).unwrap()
      onChange(selected.filter((a) => a.name !== attributePendingDelete.name))
      toast.success(`Deleted "${attributePendingDelete.name}"`)
    } catch {
      toast.error(`Failed to delete "${attributePendingDelete.name}"`)
    } finally {
      setAttributePendingDelete(null)
    }
  }

  /** Persists a value onto the attribute's master list so it's remembered for future products. */
  const removeMasterValue = async (definition: ProductAttribute, value: string) => {
    const id = definition._id || definition.id || ''
    try {
      await updateProductAttribute({ attributeId: id, data: { values: definition.values.filter((v) => v !== value) } }).unwrap()
      onChange(selected.map((a) => (a.name === definition.name ? { ...a, values: a.values.filter((v) => v !== value) } : a)))
    } catch {
      toast.error(`Failed to remove "${value}"`)
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

  const addCustomValue = async (attrName: string) => {
    const value = (valueDraft[attrName] || '').trim()
    if (!value) return
    const attr = selected.find((a) => a.name === attrName)
    if (attr?.values.includes(value)) return

    onChange(
      selected.map((a) => (a.name === attrName ? { ...a, values: [...a.values, value] } : a))
    )
    setValueDraft((prev) => ({ ...prev, [attrName]: '' }))

    // Persist onto the attribute's master list so it's remembered for future products too.
    const definition = attributes.find((a) => a.name === attrName)
    if (definition && !definition.values.includes(value)) {
      const id = definition._id || definition.id || ''
      try {
        await updateProductAttribute({ attributeId: id, data: { values: [...definition.values, value] } }).unwrap()
      } catch {
        toast.error(`"${value}" was added to this product but couldn't be saved for future use`)
      }
    }
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
            className='cursor-pointer select-none gap-1.5 px-3 py-1.5'
            onClick={() => toggleAttribute(attr.name)}
          >
            {attr.name}
            <button
              type='button'
              title={`Delete "${attr.name}"`}
              onClick={(e) => {
                e.stopPropagation()
                setAttributePendingDelete(attr)
              }}
              className='rounded-full p-0.5 hover:bg-black/10'
            >
              <Trash2 className='h-3 w-3' />
            </button>
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
            <div className='mb-2 flex flex-wrap gap-3'>
              {availableValues.map((value) => (
                <div key={value} className='flex items-center gap-1.5 text-sm'>
                  <label className='flex items-center gap-1.5'>
                    <Checkbox
                      checked={attr.values.includes(value)}
                      onCheckedChange={() => toggleValue(attr.name, value)}
                    />
                    {value}
                  </label>
                  <button
                    type='button'
                    title={`Remove "${value}" from ${attr.name}`}
                    onClick={() => definition && removeMasterValue(definition, value)}
                    className='rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/20'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
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

      <ConfirmDialog
        open={!!attributePendingDelete}
        onOpenChange={(open) => !open && setAttributePendingDelete(null)}
        title='Delete attribute?'
        desc={`This removes "${attributePendingDelete?.name}" for your whole organization, not just this product. Existing variants that already use it keep their values — only future selection is affected.`}
        destructive
        confirmText='Delete'
        handleConfirm={confirmDeleteAttribute}
      />
    </div>
  )
}
