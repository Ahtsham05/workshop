/**
 * Ctrl/Cmd + Alt + S. Matched on the typed key 's' first; the physical S key also counts when
 * the active layout isn't a Latin one (Urdu, Arabic, …: Windows' Alt+Shift silently switches
 * to it, after which event.key is 'س' and the shortcut used to stop working). A Latin layout
 * that types its own character with Ctrl+Alt+S (AltGr, e.g. Polish 'ś') is still left alone.
 */
export function isQuickTransferShortcut(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>) {
  if (!event.altKey || !(event.ctrlKey || event.metaKey) || event.shiftKey) return false
  const key = event.key ?? ''
  if (key.toLowerCase() === 's') return true
  // A named key ('Unidentified', 'Process', 'Dead') from an IME or dead-key layout counts too.
  return event.code === 'KeyS' && ([...key].length !== 1 || !/\p{Script=Latin}/u.test(key))
}
