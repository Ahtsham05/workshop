import { useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import type { SupportContext } from '@/config/support'

/** The signed-in user + current branch, pre-filled into support WhatsApp / email messages. */
export function useSupportContext(): SupportContext {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  return { userName: user?.name, email: user?.email, businessName: branch?.name }
}
