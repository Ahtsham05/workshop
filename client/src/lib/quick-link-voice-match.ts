import type { QuickLinkAction } from '@/stores/quickLinks.api'

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()

const tokenize = (value: string) => normalize(value).split(/\s+/).filter(Boolean)

// Command phrases people actually say before the target action ("open stock
// transfer", "go to leads") — stripped so they don't dilute the match against a
// candidate label that obviously doesn't include them. Longest first so "please open"
// strips as one unit rather than leaving a dangling "please".
const FILLER_PREFIXES = [
  'please open',
  'please go to',
  'take me to',
  'navigate to',
  'show me the',
  'show me',
  'go to',
  'open',
  'show',
  'launch',
].sort((a, b) => b.length - a.length)

const stripFillerPrefix = (transcript: string) => {
  const lower = normalize(transcript)
  const hit = FILLER_PREFIXES.find((prefix) => lower === prefix || lower.startsWith(`${prefix} `))
  return hit ? lower.slice(hit.length).trim() : lower
}

/** Classic iterative Levenshtein edit distance — no fuzzy-match library is in this
 *  repo's dependencies, and this is the standard small building block for one. */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let curr = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/** 1 = identical, 0 = completely different. Tolerates near-miss speech-to-text
 *  transcription ("stop" heard for "stock", a dropped trailing "s") instead of
 *  requiring an exact string. */
const similarity = (a: string, b: string) => {
  if (!a && !b) return 1
  const dist = levenshtein(a, b)
  return 1 - dist / Math.max(a.length, b.length, 1)
}

/** Average, over each of the candidate phrase's own words, of that word's best
 *  fuzzy match against any word actually heard — extra filler words left in the
 *  transcript don't dilute the score, only a genuinely poor match per candidate word
 *  does. */
const wordFuzzyScore = (transcriptTokens: string[], candidateTokens: string[]) => {
  if (!candidateTokens.length || !transcriptTokens.length) return 0
  const perWord = candidateTokens.map((ct) => Math.max(...transcriptTokens.map((tt) => similarity(tt, ct))))
  return perWord.reduce((sum, s) => sum + s, 0) / perWord.length
}

const scorePhrase = (transcript: string, transcriptTokens: string[], candidate: string) => {
  const normalizedCandidate = normalize(candidate)
  const whole = similarity(transcript, normalizedCandidate)
  const perWord = wordFuzzyScore(transcriptTokens, tokenize(candidate))
  return Math.max(whole, perWord)
}

export interface QuickLinkVoiceMatch {
  action: QuickLinkAction
  score: number
}

// Fuzzy scores run softer than the old exact-match ones did — 0.5 tolerates realistic
// speech-to-text noise (mis-heard words, a missing plural "s") without matching
// something the speaker clearly didn't mean.
const MATCH_THRESHOLD = 0.5

/** Matches a spoken phrase against every offered action's label + synonyms — the exact
 *  same registry (via getQuickLinkActions) the Quick Links panel itself pins from, so
 *  a newly registered action is voice-reachable with zero extra wiring. */
export function matchVoiceCommand(transcript: string, actions: QuickLinkAction[]): QuickLinkVoiceMatch | null {
  const cleaned = stripFillerPrefix(transcript)
  const transcriptTokens = tokenize(cleaned)
  if (!transcriptTokens.length) return null

  let best: QuickLinkVoiceMatch | null = null
  for (const action of actions) {
    const candidates = [action.label, ...(action.synonyms || [])]
    const score = Math.max(...candidates.map((candidate) => scorePhrase(cleaned, transcriptTokens, candidate)))
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { action, score }
    }
  }
  return best
}
