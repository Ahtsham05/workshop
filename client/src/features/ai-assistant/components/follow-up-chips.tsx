export function FollowUpChips({ items, onSelect }: { items: string[]; onSelect: (text: string) => void }) {
  if (items.length === 0) return null
  return (
    <div className='mt-2 flex flex-wrap gap-1.5'>
      {items.map((label) => (
        <button
          key={label}
          type='button'
          onClick={() => onSelect(label)}
          className='rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
        >
          {label}
        </button>
      ))}
    </div>
  )
}
