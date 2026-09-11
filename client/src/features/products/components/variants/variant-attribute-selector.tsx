import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Check, Layers, Plus, Tag, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { usePermissions } from '@/context/permission-context'
import { toneColor, type StatCardTone } from '@/lib/stat-card-tones'
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

// Cycled per attribute (by its position in the org's attribute list) so Size, Color,
// Volt etc. each keep a stable, distinct accent — makes multi-attribute products easy
// to scan at a glance instead of every chip looking the same.
const ATTRIBUTE_TONES: StatCardTone[] = ['violet', 'sky', 'emerald', 'amber', 'indigo', 'rose', 'cyan', 'orange']

/** Pick which attributes (Size, Color, ...) apply to this product, and which values of each to use. */
export function VariantAttributeSelector({ selected, onChange }: Props) {
  const { hasExplicitPermission } = usePermissions()
  const canManageAttributes = hasExplicitPermission('editProducts')
  const { data: attributes = [], isLoading } = useGetAllProductAttributesQuery()
  const [createProductAttribute, { isLoading: isCreatingAttribute }] = useCreateProductAttributeMutation()
  const [updateProductAttribute] = useUpdateProductAttributeMutation()
  const [deleteProductAttribute] = useDeleteProductAttributeMutation()
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({})
  const [newAttributeName, setNewAttributeName] = useState('')
  const [attributePendingDelete, setAttributePendingDelete] = useState<ProductAttribute | null>(null)

  const toneFor = (name: string): StatCardTone => {
    const index = attributes.findIndex((a) => a.name === name)
    return ATTRIBUTE_TONES[Math.max(0, index) % ATTRIBUTE_TONES.length]
  }

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
    return (
      <div className='space-y-2'>
        <Skeleton className='h-4 w-20' />
        <div className='flex gap-2'>
          <Skeleton className='h-8 w-20 rounded-full' />
          <Skeleton className='h-8 w-24 rounded-full' />
          <Skeleton className='h-8 w-16 rounded-full' />
        </div>
      </div>
    )
  }

  const newAttributeRow = !canManageAttributes ? null : (
    <div className='flex items-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-muted/20 p-1.5 focus-within:border-primary/50'>
      <Plus className='ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground' />
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
        className='h-7 max-w-[220px] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0'
      />
      <Button
        type='button'
        size='sm'
        variant='secondary'
        disabled={isCreatingAttribute || !newAttributeName.trim()}
        onClick={addNewAttribute}
        className='h-7 shrink-0 px-2.5 text-xs'
      >
        Add attribute
      </Button>
    </div>
  )

  if (attributes.length === 0) {
    return (
      <div className='space-y-3 rounded-xl border border-dashed border-border/70 bg-muted/10 px-6 py-8 text-center'>
        <div className='mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'>
          <Layers className='h-5 w-5' />
        </div>
        <p className='mx-auto max-w-sm text-sm text-muted-foreground'>
          No attributes defined yet for your organization. Create one below to start building
          variants (e.g. "Size", then add values like S/M/L once it's created).
        </p>
        {newAttributeRow && <div className='mx-auto max-w-xs'>{newAttributeRow}</div>}
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='space-y-2'>
        <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Attributes</p>
        <div className='flex flex-wrap items-center gap-2'>
          {attributes.map((attr) => {
            const isSelected = isAttributeSelected(attr.name)
            const tone = toneFor(attr.name)
            return (
              <Badge
                key={attr.id || attr._id}
                variant='outline'
                className={cn(
                  'group cursor-pointer select-none gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                  isSelected ? 'border-transparent text-white shadow-sm' : 'border-border/70 bg-background hover:bg-muted'
                )}
                style={isSelected ? { backgroundColor: toneColor(tone) } : undefined}
                onClick={() => toggleAttribute(attr.name)}
              >
                <Tag className='h-3 w-3' />
                {attr.name}
                {canManageAttributes && (
                  <button
                    type='button'
                    title={`Delete "${attr.name}"`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setAttributePendingDelete(attr)
                    }}
                    className={cn(
                      'rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100',
                      isSelected ? 'hover:bg-white/20' : 'hover:bg-muted-foreground/20'
                    )}
                  >
                    <Trash2 className='h-3 w-3' />
                  </button>
                )}
              </Badge>
            )
          })}
        </div>
        {newAttributeRow}
      </div>

      {selected.map((attr) => {
        const definition = attributes.find((a) => a.name === attr.name)
        // Union with the product's own selection, not just the master list — a value
        // just added via addCustomValue is selected immediately but only lands in the
        // master list once its save round-trip resolves; this keeps it visible in the
        // meantime instead of it briefly vanishing.
        const availableValues = Array.from(new Set([...(definition?.values || []), ...attr.values]))
        const tone = toneFor(attr.name)
        return (
          <div key={attr.name} className='overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm'>
            <div className='flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-2'>
              <div className='flex items-center gap-2'>
                <span className='h-2 w-2 shrink-0 rounded-full' style={{ backgroundColor: toneColor(tone) }} />
                <p className='text-sm font-semibold'>{attr.name} values</p>
              </div>
              <Badge variant='secondary' className='rounded-full font-normal'>
                {attr.values.length} selected
              </Badge>
            </div>
            <div className='space-y-2.5 p-3'>
              {availableValues.length > 0 ? (
                <div className='flex flex-wrap gap-1.5'>
                  {availableValues.map((value) => {
                    const isChecked = attr.values.includes(value)
                    return (
                      <Badge
                        key={value}
                        variant='outline'
                        onClick={() => toggleValue(attr.name, value)}
                        className={cn(
                          'group cursor-pointer select-none gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                          isChecked ? 'border-transparent text-white shadow-sm' : 'border-border/70 bg-background hover:bg-muted'
                        )}
                        style={isChecked ? { backgroundColor: toneColor(tone) } : undefined}
                      >
                        {isChecked && <Check className='h-3 w-3' />}
                        {value}
                        {canManageAttributes && (
                          <button
                            type='button'
                            title={`Remove "${value}" from ${attr.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (definition) removeMasterValue(definition, value)
                            }}
                            className={cn(
                              'rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100',
                              isChecked ? 'hover:bg-white/20' : 'hover:bg-muted-foreground/20'
                            )}
                          >
                            <X className='h-2.5 w-2.5' />
                          </button>
                        )}
                      </Badge>
                    )
                  })}
                </div>
              ) : (
                <p className='text-xs text-muted-foreground'>No values yet — add one below.</p>
              )}
              {canManageAttributes && (
                <div className='flex items-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-muted/20 p-1 focus-within:border-primary/50'>
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
                    className='h-7 flex-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-0'
                  />
                  <Button
                    type='button'
                    size='sm'
                    variant='secondary'
                    className='h-7 shrink-0 px-2'
                    onClick={() => addCustomValue(attr.name)}
                  >
                    <Plus className='h-3.5 w-3.5' />
                  </Button>
                </div>
              )}
            </div>
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
