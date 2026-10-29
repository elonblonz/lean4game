/**
 * Lean's printed expressions (`x ∈ A ∩ B ∪ Cᶜ`) in LaTeX, with the brackets a reader needs.
 *
 * Lean leaves out brackets wherever its precedences allow: it prints `(A ∩ B) ∪ C` as
 * `A ∩ B ∪ C`, and `(A ∪ B) ∪ C` as `A ∪ B ∪ C`. On paper both need brackets, so the
 * expression is parsed and printed again, with brackets around every nested set operation.
 * Only the notation used in set theory is understood; anything else is kept as it is.
 */

type Node =
  | { kind: 'atom', text: string }
  | { kind: 'bin', op: string, left: Node, right: Node }
  | { kind: 'not', arg: Node }
  | { kind: 'compl', arg: Node }
  | { kind: 'prefix', op: string, arg: Node }        // ⋃₀ ⋂₀ 𝒫 (as ℘)
  | { kind: 'binder', op: string, vars: Node[], bound?: { op: string, set: Node }, body: Node }
  | { kind: 'set', items: Node[] }                    // {a, b}
  | { kind: 'builder', v: Node, body: Node }          // {x | P x}
  | { kind: 'app', fn: Node, arg: Node }

const BINARY: Record<string, [number, 'left' | 'right' | 'none']> = {
  '↔': [20, 'none'], '→': [25, 'right'], '∨': [30, 'right'], '∧': [35, 'right'],
  '=': [50, 'none'], '≠': [50, 'none'], '∈': [50, 'none'], '∉': [50, 'none'],
  '⊆': [50, 'none'], '⊂': [50, 'none'], '⊈': [50, 'none'],
  '∪': [65, 'left'], '∩': [70, 'left'], '\\': [70, 'left'], '∆': [100, 'left'],
}
const SET_OPS = new Set(['∪', '∩', '\\', '∆'])
const LOGIC_OPS = new Set(['↔', '→', '∨', '∧'])
const RELATIONS = new Set(['=', '≠', '∈', '∉', '⊆', '⊂', '⊈'])

function tokenize(s: string): string[] {
  const out: string[] = []
  // `𝒫` is outside the Basic Multilingual Plane (two UTF-16 code units, which `.` would split
  // without the `u` flag): use `℘` instead.
  s = s.replace(/𝒫/g, '℘')
  const re = /\s*(⋃₀|⋂₀|[A-Za-z_Ͱ-Ͽ][\w'!?.Ͱ-Ͽ₀-₉✝]*|\d+|.)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) && m[0]) if (m[1].trim()) out.push(m[1])
  return out
}

class Parser {
  i = 0
  constructor(private toks: string[]) {}
  peek() { return this.toks[this.i] }
  next() { return this.toks[this.i++] }
  expect(t: string) { if (this.next() !== t) throw new Error(`expected ${t}`) }
  done() { return this.i >= this.toks.length }

  expr(min = 0): Node {
    let left = this.prefix()
    for (;;) {
      const t = this.peek()
      if (t === undefined) break
      if (t === 'ᶜ') { this.next(); left = { kind: 'compl', arg: left }; continue }
      const b = BINARY[t]
      if (b) {
        const [prec, assoc] = b
        if (prec < min) break
        this.next()
        const right = this.expr(assoc === 'right' ? prec : prec + 1)
        left = { kind: 'bin', op: t, left, right }
        continue
      }
      // Function application, e.g. `Set U`.
      if (min <= 1024 && this.startsAtom(t)) { left = { kind: 'app', fn: left, arg: this.primary() }; continue }
      break
    }
    return left
  }

  startsAtom(t: string) { return t === '(' || t === '{' || /^[A-Za-z_\dͰ-Ͽ∅]/.test(t) }

  /** An atom with its complements. */
  primary(): Node {
    let n = this.atom()
    while (this.peek() === 'ᶜ') { this.next(); n = { kind: 'compl', arg: n } }
    return n
  }

  prefix(): Node {
    const t = this.peek()
    if (t === '¬') { this.next(); return { kind: 'not', arg: this.expr(40) } }
    if (t === '⋃₀' || t === '⋂₀') { this.next(); return { kind: 'prefix', op: t, arg: this.expr(110) } }
    if (t === '℘') { this.next(); return { kind: 'prefix', op: t, arg: this.expr(100) } }
    if (t === '∀' || t === '∃') return this.binder()
    return this.primary()
  }

  binder(): Node {
    const op = this.next()
    const vars: Node[] = []
    let bound: { op: string, set: Node } | undefined
    while (!this.done() && this.peek() !== ',') {
      if (this.peek() === '(') {
        // `(F : Set (Set U))`: keep the names, drop the type.
        this.next()
        while (this.peek() !== ':' && this.peek() !== ')') vars.push({ kind: 'atom', text: this.next() })
        let depth = 0
        while (!this.done() && !(depth === 0 && this.peek() === ')')) {
          const c = this.next(); if (c === '(') depth++; if (c === ')') depth--
        }
        this.expect(')')
      } else if (BINARY[this.peek()] && RELATIONS.has(this.peek())) {
        const rel = this.next()
        bound = { op: rel, set: this.expr(51) }
      } else if (this.peek() === ':') {
        // `x : U`: drop the type
        this.next(); this.expr(51)
      } else vars.push({ kind: 'atom', text: this.next() })
    }
    this.expect(',')
    return { kind: 'binder', op, vars, bound, body: this.expr(0) }
  }

  atom(): Node {
    const t = this.next()
    if (t === undefined) throw new Error('unexpected end')
    if (t === '(') { const e = this.expr(0); this.expect(')'); return e }
    if (t === '{') {
      if (this.peek() === '}') { this.next(); return { kind: 'atom', text: '∅' } }
      const first = this.expr(0)
      if (this.peek() === '|') { this.next(); const body = this.expr(0); this.expect('}'); return { kind: 'builder', v: first, body } }
      const items = [first]
      while (this.peek() === ',') { this.next(); items.push(this.expr(0)) }
      this.expect('}')
      return { kind: 'set', items }
    }
    if (BINARY[t] || t === ')' || t === '}' || t === ',') throw new Error(`unexpected ${t}`)
    return { kind: 'atom', text: t }
  }
}

const TEX_OP: Record<string, string> = {
  '↔': '\\leftrightarrow', '→': '\\to', '∨': '\\lor', '∧': '\\land',
  '=': '=', '≠': '\\neq', '∈': '\\in', '∉': '\\notin', '⊆': '\\subseteq', '⊂': '\\subsetneq', '⊈': '\\not\\subseteq',
  '∪': '\\cup', '∩': '\\cap', '\\': '\\setminus', '∆': '\\mathbin{\\triangle}',
}
const NEGATED: Record<string, string> = { '⊆': '⊈', '=': '≠', '∈': '∉' }

const GREEK: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ι: 'iota', κ: 'kappa',
  λ: 'lambda', μ: 'mu', σ: 'sigma', τ: 'tau', φ: 'varphi', ψ: 'psi', ω: 'omega',
}

function atomTex(text: string): string {
  if (text === 'False') return '\\bot'
  if (text === 'True') return '\\top'
  if (text === 'univ') return '\\mathcal{U}'
  if (text === '∅') return '\\emptyset'
  let t = text.replace(/✝/g, '^{\\dagger}')
  t = t.replace(/[₀-₉]+/g, d => `_{${[...d].map(c => c.charCodeAt(0) - 0x2080).join('')}}`)
  t = t.replace(/[Ͱ-Ͽ]/g, c => GREEK[c] ? `\\${GREEK[c]} ` : c)
  // `x_1`, `x'`: fine as they are; longer names upright.
  if (/^[A-Za-z](_\{?\d+\}?)?'*(\^\{\\dagger\})?$/.test(t) || /^\\/.test(t) || /^\d+$/.test(t)) return t.trim()
  return `\\mathit{${t.replace(/_/g, '\\_')}}`
}

const isBin = (n: Node, ops?: Set<string>) => n.kind === 'bin' && (!ops || ops.has(n.op))

function tex(n: Node): string {
  switch (n.kind) {
    case 'atom': return atomTex(n.text)
    case 'compl': {
      // `Aᶜᶜ` as `(A^c)^c`, since two superscripts in a row are not allowed
      const inner = n.arg.kind === 'atom' || n.arg.kind === 'set' || n.arg.kind === 'builder' ? tex(n.arg) : `(${tex(n.arg)})`
      return `${inner}^{c}`
    }
    case 'not': {
      const a = n.arg
      if (a.kind === 'bin' && NEGATED[a.op]) return tex({ ...a, op: NEGATED[a.op] })
      return a.kind === 'atom' ? `\\neg ${tex(a)}` : `\\neg (${tex(a)})`
    }
    case 'prefix': {
      if (n.op === '℘') return `\\mathcal{P}(${tex(n.arg)})`
      const big = n.op === '⋃₀' ? '\\bigcup' : '\\bigcap'
      const a = n.arg
      return a.kind === 'bin' || a.kind === 'prefix' || a.kind === 'app' ? `${big} (${tex(a)})` : `${big} ${tex(a)}`
    }
    case 'binder': {
      const q = n.op === '∀' ? '\\forall' : '\\exists'
      const vars = n.vars.map(tex).join(', ')
      const bound = n.bound ? ` ${TEX_OP[n.bound.op]} ${tex(n.bound.set)}` : ''
      return `${q} ${vars}${bound},\\ ${tex(n.body)}`
    }
    case 'set': return `\\{${n.items.map(tex).join(', ')}\\}`
    case 'builder': return `\\{${tex(n.v)} \\mid ${tex(n.body)}\\}`
    case 'app': {
      const arg = n.arg.kind === 'atom' || n.arg.kind === 'set' ? tex(n.arg) : `(${tex(n.arg)})`
      return `${tex(n.fn)}\\,${arg}`
    }
    case 'bin': {
      const wrap = (child: Node, side: 'left' | 'right') => needsParens(n, child, side) ? `(${tex(child)})` : tex(child)
      return `${wrap(n.left, 'left')} ${TEX_OP[n.op] ?? n.op} ${wrap(n.right, 'right')}`
    }
  }
}

function needsParens(parent: Node & { kind: 'bin' }, child: Node, side: 'left' | 'right'): boolean {
  if (child.kind === 'binder') return true
  if (SET_OPS.has(parent.op)) {
    // Every nested set operation gets brackets, also `(A ∪ B) ∪ C`, and so do `⋃ F` and `⋂ F`.
    return isBin(child) || (child.kind === 'prefix' && child.op !== '℘')
  }
  if (RELATIONS.has(parent.op)) return isBin(child, LOGIC_OPS) || isBin(child, RELATIONS)
  if (LOGIC_OPS.has(parent.op)) {
    if (child.kind !== 'bin' || !LOGIC_OPS.has(child.op)) return false
    const [prec, assoc] = BINARY[parent.op]
    if (child.op === parent.op) return !(assoc === 'right' && side === 'right')
    // Brackets where they are needed, and where `∧` and `∨` are mixed.
    return BINARY[child.op][0] < prec || (child.op === '∧' && parent.op === '∨') || (child.op === '∨' && parent.op === '∧')
  }
  return isBin(child)
}

/** An expression as Lean prints it, in LaTeX; `undefined` if it isn't understood. */
export function exprToLatex(expr: string): string | undefined {
  try {
    const p = new Parser(tokenize(expr))
    const n = p.expr(0)
    if (!p.done()) return undefined
    return tex(n)
  } catch {
    return undefined
  }
}
