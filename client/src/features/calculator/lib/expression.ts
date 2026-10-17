/**
 * A small, safe arithmetic evaluator for the calculator and for every number field in
 * the business tools (so "4500+350" can be typed straight into a Cost box).
 *
 * No `eval` / `Function`: a hand-written recursive-descent parser over
 *   numbers, + − × ÷ (also * / x), ^, parentheses, unary minus and postfix %.
 *
 * `%` follows the shop-calculator convention rather than the programmer's one:
 *   200 + 10%  → 220    (adds 10% OF 200)
 *   200 − 10%  → 180
 *   200 × 10%  →  20    (10% is just 0.1 here)
 *   50%        →   0.5
 * which is what people at a counter expect when they add GST or knock off a discount.
 */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '^' }
  | { kind: 'pct' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

export class ExpressionError extends Error {}

/** Normalises the many ways people type operators (×, ÷, x, −, Urdu/Arabic digits, commas). */
export function normalizeExpression(input: string): string {
  return (
    input
      // Eastern Arabic (٠-٩) and Persian/Urdu (۰-۹) digits → ASCII.
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[×xX]/g, '*')
      .replace(/÷/g, '/')
      .replace(/[−–—]/g, '-')
      .replace(/٫/g, '.')
      // Thousands separators: "1,250.50" → "1250.50". A comma is never a decimal mark here.
      .replace(/,/g, '')
      .replace(/\s+/g, '')
  )
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i
      while (j < source.length && ((source[j] >= '0' && source[j] <= '9') || source[j] === '.')) j++
      // Scientific notation only appears when we print a huge/tiny result back into the display.
      if (source[j] === 'e' || source[j] === 'E') {
        let k = j + 1
        if (source[k] === '+' || source[k] === '-') k++
        if (source[k] >= '0' && source[k] <= '9') {
          while (k < source.length && source[k] >= '0' && source[k] <= '9') k++
          j = k
        }
      }
      const text = source.slice(i, j)
      if ((text.match(/\./g) ?? []).length > 1) throw new ExpressionError('Too many decimal points')
      const value = Number(text === '.' ? 'NaN' : text)
      if (!Number.isFinite(value)) throw new ExpressionError('Invalid number')
      tokens.push({ kind: 'num', value })
      i = j
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ kind: 'op', value: ch })
    } else if (ch === '%') {
      tokens.push({ kind: 'pct' })
    } else if (ch === '(') {
      tokens.push({ kind: 'lparen' })
    } else if (ch === ')') {
      tokens.push({ kind: 'rparen' })
    } else {
      throw new ExpressionError(`Unexpected "${ch}"`)
    }
    i++
  }
  return tokens
}

interface Operand {
  value: number
  /** The operand was a bare "n%" — additive context turns it into a share of the left side. */
  percent: boolean
}

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    if (this.tokens.length === 0) throw new ExpressionError('Empty')
    const result = this.additive()
    if (this.pos < this.tokens.length) throw new ExpressionError('Unexpected input')
    return result.value
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private additive(): Operand {
    let left = this.multiplicative()
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'op' || (token.value !== '+' && token.value !== '-')) break
      this.pos++
      const right = this.multiplicative()
      const amount = right.percent ? left.value * right.value : right.value
      left = { value: token.value === '+' ? left.value + amount : left.value - amount, percent: false }
    }
    return left
  }

  private multiplicative(): Operand {
    let left = this.unary()
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'op' || (token.value !== '*' && token.value !== '/')) break
      this.pos++
      const right = this.unary()
      if (token.value === '/' && right.value === 0) throw new ExpressionError('Cannot divide by zero')
      left = { value: token.value === '*' ? left.value * right.value : left.value / right.value, percent: false }
    }
    return left
  }

  private unary(): Operand {
    const token = this.peek()
    if (token?.kind === 'op' && (token.value === '-' || token.value === '+')) {
      this.pos++
      const inner = this.unary()
      return { value: token.value === '-' ? -inner.value : inner.value, percent: inner.percent }
    }
    return this.power()
  }

  /** Binds tighter than unary minus, so -2^2 is -4 like on paper. */
  private power(): Operand {
    const base = this.postfix()
    const token = this.peek()
    if (token?.kind === 'op' && token.value === '^') {
      this.pos++
      const exponent = this.unary() // right-associative
      return { value: Math.pow(base.value, exponent.value), percent: false }
    }
    return base
  }

  private postfix(): Operand {
    let operand = this.primary()
    while (this.peek()?.kind === 'pct') {
      this.pos++
      operand = { value: operand.value / 100, percent: true }
    }
    return operand
  }

  private primary(): Operand {
    const token = this.peek()
    if (!token) throw new ExpressionError('Incomplete')
    if (token.kind === 'num') {
      this.pos++
      return { value: token.value, percent: false }
    }
    if (token.kind === 'lparen') {
      this.pos++
      const inner = this.additive()
      // Forgiving: a missing closing bracket at the very end is assumed, like most calculators.
      if (this.peek()?.kind === 'rparen') this.pos++
      else if (this.pos < this.tokens.length) throw new ExpressionError('Missing )')
      return { value: inner.value, percent: false }
    }
    throw new ExpressionError('Incomplete')
  }
}

/** Evaluates an expression. Throws ExpressionError on bad input. */
export function evaluateExpression(input: string): number {
  const source = normalizeExpression(input)
  const value = new Parser(tokenize(source)).parse()
  if (!Number.isFinite(value)) throw new ExpressionError('Result too large')
  return roundFloat(value)
}

/** Non-throwing variant: `null` for empty or invalid input. */
export function tryEvaluate(input: string | null | undefined): number | null {
  if (input == null || !String(input).trim()) return null
  try {
    return evaluateExpression(String(input))
  } catch {
    return null
  }
}

/** True when the text is more than a plain number (so the field should show "= result"). */
export function isExpression(input: string): boolean {
  const source = normalizeExpression(input)
  return /[-+*/^%()]/.test(source.replace(/^[-+]/, ''))
}

/** Removes binary floating-point noise (0.1 + 0.2 → 0.3) without hiding real precision. */
export function roundFloat(value: number): number {
  if (!Number.isFinite(value)) return value
  return Number.parseFloat(value.toPrecision(12))
}
