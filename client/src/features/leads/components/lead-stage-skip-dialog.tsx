import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useLanguage } from '@/context/language-context'
import type { LeadStage } from '@/stores/lead.api'
import { STAGE_LABELS } from '../utils/stage-config'

interface LeadStageSkipDialogProps {
  open: boolean
  fromStage: LeadStage | null
  toStage: LeadStage | null
  onCancel: () => void
  onConfirm: () => void
  isLoading?: boolean
}

export function LeadStageSkipDialog({ open, fromStage, toStage, onCancel, onConfirm, isLoading }: LeadStageSkipDialogProps) {
  const { t } = useLanguage()
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Skip pipeline stages?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {fromStage && toStage && (
              t(`Moving this lead from "${STAGE_LABELS[fromStage]}" to "${STAGE_LABELS[toStage]}" skips one or more stages in between. Are you sure you want to proceed?`)
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isLoading ? t('Moving...') : t('Yes, move it')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
