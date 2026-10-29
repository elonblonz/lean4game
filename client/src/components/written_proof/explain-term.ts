/**
 * Explains a proof term (`h2 (h1 h3)`, `And.intro h.left hB`, `h1 t ht.left`) step by step:
 * works out what each part proves from the statements of the assumptions it uses, and writes
 * one line per inference ("x ∈ B, from 1 and 3: every element of A is an element of B").
 *
 * This is a small checker for the shapes of proof that set theory needs, not Lean's elaborator:
 * applying `A ⊆ B`, `P → Q`, `∀ x ∈ S, P x` and `¬P`, taking the parts of `P ∧ Q` (also of
 * `x ∈ A ∩ B`), and the constructors `And.intro`, `Or.inl`/`Or.inr` and `Exists.intro`. For
 * anything else (e.g. a theorem from the inventory) it relies on the statement the term must
 * prove. If it gets stuck, it returns `undefined` and the caller says less.
 */
import { Expr, parse, substitute, bin, atom, negated, meaning, tex } from './lean-expr'

/** An inference: what it shows, the lines it uses, and why it holds. */
export interface Derived {
  stmt?: Expr
  refs: number[]
  /** e.g. "by the definition of $\cap$", "by $\mathtt{Subset.refl}$" */
  by?: string
  /** e.g. "every element of $A$ is an element of $B$" */
  explain?: string
  /** Set if the term is just an earlier line. */
  line?: number
}

export interface Env {
  /** The line and statement of an assumption, by its name. */
  fact(name: string): { line: number, stmt?: Expr } | undefined
  /** Write a line for an inference; returns its number. */
  emit(d: Derived): number
  /** How to refer to a theorem, e.g. `$\mathtt{Subset.refl}$`. */
  theorem(name: string): string
}

class Stuck extends Error {}

const math = (e: Expr) => `$${tex(e)}$`

function spine(n: Expr): { head: Expr, args: Expr[] } {
  const args: Expr[] = []
  while (n.kind === 'app') { args.unshift(n.arg); n = n.fn }
  return { head: n, args }
}

export function explainTerm(term: string, expected: Expr | undefined, env: Env): Derived | undefined {
  const t = parse(term)
  if (!t) return undefined
  try {
    return elab(t, expected, env)
  } catch (e) {
    if (e instanceof Stuck) return undefined
    throw e
  }
}

/** The line number of an inference, writing it out if it isn't a line yet. */
function cite(d: Derived, env: Env): number {
  if (d.line !== undefined) return d.line
  if (!d.stmt) throw new Stuck()
  return env.emit(d)
}

/** Whether a term is a proof (of something), rather than an object such as a set. */
function isProof(n: Expr, env: Env): boolean {
  const { head } = spine(n)
  if (head.kind !== 'atom') return false
  const base = head.text.split('.')[0]
  return !!env.fact(base) || /^(And|Or|Exists|Iff)\./.test(head.text)
}

function elab(n: Expr, expected: Expr | undefined, env: Env): Derived {
  const { head, args } = spine(n)
  if (head.kind !== 'atom') throw new Stuck()
  const [base, ...projections] = head.text.split('.')
  const fact = env.fact(base)

  if (fact) {
    let d: Derived = { stmt: fact.stmt, refs: [fact.line], line: fact.line }
    for (const p of projections) d = project(d, p, env)
    for (const a of args) d = apply(d, a, env)
    return d
  }

  const elabArg = (a: Expr, exp?: Expr) => cite(elab(a, exp, env), env)
  switch (head.text) {
    case 'And.intro': {
      if (args.length !== 2) throw new Stuck()
      const sides = expected?.kind === 'bin' && expected.op === '∧' ? [expected.left, expected.right] : [undefined, undefined]
      const parts = args.map((a, i) => elab(a, sides[i], env))
      const refs = parts.map(p => cite(p, env))
      const stmt = expected ?? (parts[0].stmt && parts[1].stmt ? bin('∧', parts[0].stmt, parts[1].stmt) : undefined)
      return { stmt, refs }
    }
    case 'Or.inl':
    case 'Or.inr': {
      if (args.length !== 1 || !expected) throw new Stuck()
      const side = expected.kind === 'bin' && expected.op === '∨' ? (head.text === 'Or.inl' ? expected.left : expected.right) : undefined
      return { stmt: expected, refs: [elabArg(args[0], side)] }
    }
    case 'Exists.intro': {
      if (args.length !== 2 || !expected) throw new Stuck()
      const [w, proof] = args
      let inner: Expr | undefined
      if (expected.kind === 'binder' && expected.op === '∃' && expected.vars.length === 1 && expected.vars[0].kind === 'atom') {
        const v = expected.vars[0].text
        const body = substitute(expected.body, v, w)
        inner = expected.bound ? bin('∧', bin(expected.bound.op, w, expected.bound.set), body) : body
      }
      const v = expected.kind === 'binder' ? expected.vars.map(tex).join(', ') : undefined
      return { stmt: expected, refs: [elabArg(proof, inner)], explain: v ? `taking ${math(w)} for $${v}$` : undefined }
    }
  }

  // A theorem: use the statement the term must prove.
  if (!expected) throw new Stuck()
  const refs = args.filter(a => isProof(a, env)).map(a => elabArg(a))
  return { stmt: expected, refs, by: `by ${env.theorem(head.text)}` }
}

/** `h.left`, `h.right` (also `.1`, `.2`, and `.mp`, `.mpr` of `↔`). */
function project(d: Derived, p: string, env: Env): Derived {
  const s = d.stmt
  if (!s || s.kind !== 'bin') throw new Stuck()
  const first = p === 'left' || p === '1', second = p === 'right' || p === '2'
  if (s.op === '∧' && (first || second))
    return { stmt: first ? s.left : s.right, refs: [cite(d, env)] }
  // `x ∈ A ∩ B` is by definition `x ∈ A ∧ x ∈ B`, and `x ∈ A \ B` is `x ∈ A ∧ x ∉ B`.
  if (s.op === '∈' && s.right.kind === 'bin' && (s.right.op === '∩' || s.right.op === '\\') && (first || second)) {
    const set = s.right
    const stmt = first ? bin('∈', s.left, set.left) : bin(set.op === '∩' ? '∈' : '∉', s.left, set.right)
    return { stmt, refs: [cite(d, env)], by: `by the definition of ${set.op === '∩' ? '$\\cap$' : 'set difference'}` }
  }
  if (s.op === '↔' && (p === 'mp' || p === 'mpr'))
    return { stmt: p === 'mp' ? bin('→', s.left, s.right) : bin('→', s.right, s.left), refs: [cite(d, env)] }
  throw new Stuck()
}

/** Apply a proven statement to an argument. */
function apply(d: Derived, arg: Expr, env: Env): Derived {
  const s = d.stmt
  if (!s) throw new Stuck()

  // `∀ x ∈ S, P x` applied to `t`: `t ∈ S → P t`
  if (s.kind === 'binder' && s.op === '∀' && !isProof(arg, env)) {
    const [v, ...rest] = s.vars
    if (v.kind !== 'atom') throw new Stuck()
    const body = substitute(rest.length ? { ...s, vars: rest, bound: undefined } : s.body, v.text, arg)
    const stmt = s.bound ? bin('→', bin(s.bound.op, arg, s.bound.set), body) : body
    const same = arg.kind === 'atom' && arg.text === v.text
    return { stmt, refs: [cite(d, env)], explain: same ? `applied to ${math(arg)}` : `applied to ${math(arg)} in place of ${math(v)}` }
  }
  // `A ⊆ B` applied to a proof of `x ∈ A`: `x ∈ B`
  if (s.kind === 'bin' && s.op === '⊆') {
    const a = elab(arg, undefined, env)
    if (!a.stmt || a.stmt.kind !== 'bin' || a.stmt.op !== '∈') throw new Stuck()
    return { stmt: bin('∈', a.stmt.left, s.right), refs: [cite(d, env), cite(a, env)], explain: meaning(s) }
  }
  // `P → Q` applied to a proof of `P`: `Q`
  if (s.kind === 'bin' && s.op === '→') {
    const a = elab(arg, s.left, env)
    return { stmt: s.right, refs: [cite(d, env), cite(a, env)] }
  }
  // `¬P` applied to a proof of `P`: a contradiction
  const p = negated(s)
  if (p) {
    const a = elab(arg, p, env)
    return { stmt: atom('False'), refs: [cite(d, env), cite(a, env)] }
  }
  throw new Stuck()
}
