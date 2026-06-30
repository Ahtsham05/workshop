import { useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'

export function useBranchName() {
  return useSelector((state: RootState) => state.auth.activeBranchName) ?? undefined
}
