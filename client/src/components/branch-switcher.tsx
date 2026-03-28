import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Check, ChevronsUpDown, GitBranch, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { setActiveBranch } from '@/stores/auth.slice'
import { AppDispatch, RootState } from '@/stores/store'
import { useNavigate } from '@tanstack/react-router'

export function BranchSwitcher() {
  const [open, setOpen] = useState(false)
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()

  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const activeBranchName = useSelector((state: RootState) => state.auth.activeBranchName)
  const user = useSelector((state: RootState) => state.auth.data?.user)

  const isSuperAdmin = user?.systemRole === 'superAdmin'

  const { data: branches = [] } = useGetMyBranchesQuery()

  // Auto-select the default branch (or first branch) on first load when no branch is selected
  useEffect(() => {
    if (branches.length > 0 && !activeBranchId) {
      const defaultBranch = branches.find((b) => b.isDefault) ?? branches[0]
      dispatch(setActiveBranch({ id: defaultBranch.id, name: defaultBranch.name }))
    }
  }, [branches, activeBranchId, dispatch])

  const handleSelect = (branch: { id: string; name: string }) => {
    if (branch.id === activeBranchId) { setOpen(false); return }
    dispatch(setActiveBranch({ id: branch.id, name: branch.name }))
    setOpen(false)
    window.location.reload()
  }

  const displayName = activeBranchName || (branches.length > 0 ? 'Select Branch' : 'No branches')

  // Non-superAdmin users can only belong to one branch — show it as a static badge
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 text-sm rounded-md border bg-muted/40 truncate">
        <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm">{displayName}</span>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select branch"
          className="w-full justify-between h-9 px-3 text-sm"
        >
          <div className="flex items-center gap-2 truncate">
            <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{displayName}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search branches..." />
          <CommandList>
            <CommandEmpty>No branches found.</CommandEmpty>
            <CommandGroup heading="Branches">
              {branches.map((branch) => (
                <CommandItem
                  key={branch.id}
                  onSelect={() => handleSelect({ id: branch.id, name: branch.name })}
                  className="gap-2"
                >
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{branch.name}</span>
                  {branch.isDefault && (
                    <span className="ml-auto text-xs text-muted-foreground">default</span>
                  )}
                  {activeBranchId === branch.id && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false)
                  navigate({ to: '/branches' })
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Manage Branches
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
