/**
 * Font size (a CSS length) at which `text` still fits on one line inside a size container: the
 * container's own width (`cqw` — so the element using it must sit inside one, e.g. `@container`)
 * divided by ~0.64em per glyph (about the widest an average digit/separator gets in bold tabular
 * type), capped at `capRem` so short numbers keep their normal size and floored at `floorRem`.
 *
 * Used for the phone layouts of stat cards, where a half-width card can't be assumed to hold a
 * long amount at full size.
 */
export function fitValueSize(text: string, capRem = 1.25, floorRem = 0.75): string {
  const glyphs = Math.max(text.length, 4)
  return `max(${floorRem}rem, min(${capRem}rem, calc(100cqw / ${(glyphs * 0.64).toFixed(2)})))`
}
