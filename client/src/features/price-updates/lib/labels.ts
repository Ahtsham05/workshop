import type { RowIssue } from './session'

export type Tone = 'danger' | 'warn' | 'info'

/** What each flag on a review row means, in words a shop owner would use. */
export const ISSUE_INFO: Record<RowIssue, { label: string; tone: Tone; hint: string }> = {
  below_cost: { label: 'Below cost', tone: 'danger', hint: 'After this update the selling price is lower than the cost — you would lose money on every sale.' },
  big_cost_change: { label: 'Big cost change', tone: 'warn', hint: 'The cost moves by 25% or more. Check for a typo, a pack/dozen price, or a wrong match.' },
  big_price_change: { label: 'Big price change', tone: 'warn', hint: 'The selling price moves by 25% or more. Check the rule and the numbers.' },
  no_price_set: { label: 'No selling price', tone: 'info', hint: 'This product has no selling price yet and the rule leaves it alone.' },
  no_cost_history: { label: 'No margin history', tone: 'info', hint: 'This product had no cost or price to copy a margin from, so the fixed margin from the rule was used.' },
  raised_to_min_margin: { label: 'Raised to min. margin', tone: 'info', hint: 'The rule’s minimum margin raised this selling price.' },
  kept_higher_price: { label: 'Price kept', tone: 'info', hint: '“Don’t lower selling prices” kept today’s higher price.' },
  list_price_missing: { label: 'No price in list', tone: 'warn', hint: 'The rule uses the list’s selling price, but this line only had a cost.' },
  no_list_price: { label: 'Nothing to apply', tone: 'warn', hint: 'This line has no number for the list type you chose.' },
  duplicate_target: { label: 'Listed twice', tone: 'warn', hint: 'This product appears on more than one line. Only the last line is applied.' },
  pack_price: { label: 'Pack price?', tone: 'warn', hint: 'This looks like a price per dozen / carton / box. Check it is per single item.' },
  range: { label: 'Price range', tone: 'warn', hint: 'The list gives a range. The first number is used — edit it if the other one is right.' },
  signed_change: { label: '+/− amount?', tone: 'warn', hint: 'A number with a “+” looks like a change amount, not a price.' },
}

/** Why the matcher wants a human to look at a suggestion. */
export const MATCH_FLAG_INFO: Record<string, string> = {
  ambiguous: 'Several similar products fit this line.',
  spec_conflict: 'A model number or RAM/storage size differs.',
  product_more_specific: 'Your product has details (size/RAM/colour) the list doesn’t mention.',
  query_more_specific: 'The list has details your product name doesn’t.',
  variant_word: 'A version word differs (Pro / Max / PTA / Non-PTA …).',
  fuzzy_words: 'Spelling differs slightly.',
  section_used: 'Matched using the brand heading above this line.',
}

export const IGNORED_REASON: Record<string, string> = {
  no_price: 'No price found on this line',
  price_without_name: 'A price with no product name',
  no_name: 'No product name',
  too_long: 'List is too long — the rest was skipped',
}
