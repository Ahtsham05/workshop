import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/** Mouse: a small move starts a drag (a click stays a click). Touch: press and hold. */
export function useArrangeSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
}

export function reorder(ids: string[], event: DragEndEvent): string[] | null {
  const { active, over } = event
  if (!over || active.id === over.id) return null
  const from = ids.indexOf(String(active.id))
  const to = ids.indexOf(String(over.id))
  if (from < 0 || to < 0) return null
  return arrayMove(ids, from, to)
}

/**
 * Scroll the page only when the pointer is really at the top/bottom edge (10%), not in the
 * library's default 20% band — on a tall screen that band covers whole rows of cards, which
 * then scroll away under the card being dropped.
 */
export const ARRANGE_AUTOSCROLL = { threshold: { x: 0, y: 0.1 } }
