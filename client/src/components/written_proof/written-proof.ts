/**
 * Turns a completed tactic proof into a proof written out the way a mathematician would,
 * with every logical step on its own numbered line and its justification:
 *
 *    1. A ⊆ B, that is, every element of A is an element of B.     [given]
 *       To prove A ⊆ C, we show that every element of A is an element of C.
 *       │ Let x be arbitrary.
 *       │ 3. x ∈ A                                                  [assumption]
 *       │ 4. x ∈ B                    [from 1 and 3: every element of A is an element of B]
 *
 * The lines come from templates per tactic, filled in with the goals and assumptions before
 * and after each step (which the game server sends for every step anyway), and from reading
 * the proof terms (`explain-term.ts`). The result follows the player's own proof, step by step.
 *
 * Text is plain text with `$...$` maths in LaTeX, so it can be rendered as Markdown (with
 * KaTeX) in the game and put into a LaTeX document as it is.
 */
import type { ProofState, InteractiveGoal } from '../../api/rpc_api'
import { Expr, parse, tex, words, meaning, equal, negated, exprToLatex } from './lean-expr'
import { Derived, Env, explainTerm } from './explain-term'
import { fillTemplate, tacticKey } from '../../utils/written-proof'

/** A numbered statement that later lines can refer to. */
export interface FactLine { kind: 'fact', n: number, text: string, why: string, step?: number }
/** Explanations: how we go about proving something, what is left to show. */
export interface NoteLine { kind: 'note', text: string, step?: number }
/** A part of the proof with its own assumptions: a case, a direction, a claim, "let x be ...". */
export interface BlockLine { kind: 'block', header?: string, lines: Line[], step?: number }
export type Line = FactLine | NoteLine | BlockLine

export interface WrittenProof {
  title: string
  /** The theorem, as text with `$...$` maths. */
  statement: string
  lines: Line[]
  /** The (full) names of the theorems from the inventory that the proof uses. */
  theorems?: string[]
  /** For a collection of proofs: the world's title, to group them by. */
  world?: string
}

/** A theorem from the inventory: its names, and its statement (`(h : a ⊆ b) : ...`) if known. */
export interface TheoremInfo { name: string, displayName: string, statement?: string }

// ---------------------------------------------------------------------------------------------
// Expressions

/** The plain text of Lean's tagged code (`CodeWithInfos`). */
export function plainText(t: any): string {
  if (!t) return ''
  if (typeof t.text === 'string') return t.text
  if (Array.isArray(t.append)) return t.append.map(plainText).join('')
  if (Array.isArray(t.tag)) return plainText(t.tag[1])
  return ''
}

const SYMBOLS: [RegExp, string][] = [
  [/⋃₀/g, '\\bigcup '], [/⋂₀/g, '\\bigcap '],
  [/∈/g, '\\in '], [/∉/g, '\\notin '], [/⊆/g, '\\subseteq '], [/⊂/g, '\\subset '],
  [/∩/g, '\\cap '], [/∪/g, '\\cup '], [/∆/g, '\\mathbin{\\triangle} '],
  [/∀/g, '\\forall '], [/∃/g, '\\exists '], [/¬/g, '\\neg '], [/∧/g, '\\land '], [/∨/g, '\\lor '],
  [/↔/g, '\\leftrightarrow '], [/→/g, '\\to '], [/≠/g, '\\neq '], [/∅/g, '\\emptyset '],
  [/𝒫/g, '\\mathcal{P}'], [/⟨/g, '\\langle '], [/⟩/g, '\\rangle '], [/✝/g, '^\\dagger'],
]

/** Unicode symbols in maths as LaTeX commands, e.g. in `x ∈ A ∪ Bᶜ`. */
function symbolsToLatex(s: string): string {
  for (const [re, t] of SYMBOLS) s = s.replace(re, t)
  // Complements: `Aᶜᶜ` becomes `A^{c}{}^{c}` (two superscripts in a row are not allowed).
  return s.replace(/ᶜ+/g, m => '^{c}' + '{}^{c}'.repeat(m.length - 1))
}

/** An expression as Lean prints it (`x ∈ A ∩ B ∪ Cᶜ`), in LaTeX (`x \in (A \cap B) \cup C^{c}`). */
export function toLatex(expr: string): string {
  const parsed = exprToLatex(expr)
  if (parsed !== undefined) return parsed
  // Not understood: convert the symbols only.
  let s = expr.trim().replace(/ \\ /g, ' \u0000 ')
  s = s.replace(/[{}#%&_]/g, c => '\\' + c).replace(/\u0000/g, '\\setminus')
  s = symbolsToLatex(s).replace(/ \| /g, ' \\mid ')
  s = s.replace(/\bFalse\b/g, '\\bot').replace(/\bTrue\b/g, '\\top').replace(/\buniv\b/g, '\\mathcal{U}')
  return s.replace(/ +/g, ' ').trim()
}

const math = (expr: string) => `$${toLatex(expr)}$`

/** A statement in words ("$x \in A$ or $x \in B$"), or in symbols if it isn't understood. */
function say(expr: string | Expr): string {
  const e = typeof expr === 'string' ? parse(expr) : expr
  if (!e) return math(expr as string)
  return words(e)
}

/** `a`, `a and b`, `a, b and c` */
function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('')
  return xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const isFalse = (e?: Expr) => e?.kind === 'atom' && e.text === 'False'
const isBinOp = (e: Expr | undefined, op: string) => e?.kind === 'bin' && e.op === op

// ---------------------------------------------------------------------------------------------
// Goals and assumptions

interface Hyp { name: string, fvarId: string, type: string, assumption: boolean }

function hyps(goal: InteractiveGoal): Hyp[] {
  const out: Hyp[] = []
  for (const h of goal.hyps as any[]) {
    if (h.isType) continue  // the universe `U`
    h.names.forEach((name: string, i: number) =>
      out.push({ name, fvarId: h.fvarIds[i], type: plainText(h.type), assumption: !!h.isAssumption }))
  }
  return out
}

const goalText = (goal: InteractiveGoal) => plainText(goal.type)

/** The assumptions and objects in `after` that are not in `before`. */
function newHyps(before: InteractiveGoal, after: InteractiveGoal) {
  const old = hyps(before)
  const oldIds = new Set(old.map(h => h.fvarId))
  const oldTypes = new Map(old.map(h => [h.name, h.type]))
  const added = hyps(after).filter(h => !oldIds.has(h.fvarId))
  return {
    objects: added.filter(h => !h.assumption && !oldTypes.has(h.name)),
    assumptions: added.filter(h => h.assumption && !oldTypes.has(h.name)),
    /** Assumptions whose statement changed (e.g. by `rewrite ... at h`). */
    changed: added.filter(h => h.assumption && oldTypes.has(h.name) && oldTypes.get(h.name) !== h.type),
  }
}

/** Theorems used in rewrites, as what they express. */
const DEFINITIONS: Record<string, string> = {
  mem_inter_iff: '$\\cap$', mem_union: '$\\cup$', mem_compl_iff: 'complement', mem_diff: 'set difference',
  mem_sUnion: '$\\bigcup$', mem_sInter: '$\\bigcap$', mem_powerset_iff: 'power set',
  mem_setOf_eq: 'set-builder notation', mem_setOf: 'set-builder notation',
  subset_def: '$\\subseteq$', mem_singleton_iff: 'a set with one element', mem_insert_iff: 'listing elements',
  mem_pair: 'a set of two elements',
  mem_symmDiff: 'symmetric difference', symmDiff_def: 'symmetric difference', mem_univ: '$\\mathcal{U}$',
  mem_empty_iff_false: '$\\emptyset$', not_not: 'double negation', ne_eq: '$\\neq$', ext_iff: 'set equality',
}

const codeName = (name: string) => `$\\mathtt{${name.replace(/_/g, '\\_')}}$`

// ---------------------------------------------------------------------------------------------
// Steps

interface Step {
  command: string
  /** The index of this step in the proof (as in the typewriter). */
  index: number
  goal: InteractiveGoal        // the goal the step works on
  children: InteractiveGoal[]  // the goals it leaves (none if it closes the goal)
}

/** One `Step` per goal: what was done to it. */
function stepsByGoal(state: ProofState): Map<string, Step> {
  const out = new Map<string, Step>()
  for (let i = 1; i < state.steps.length; i++) {
    const before = state.steps[i - 1].goals.map(g => g.goal)
    const after = state.steps[i].goals.map(g => g.goal)
    if (!before.length || !state.steps[i].command.trim()) continue
    const ids = new Set(before.map(g => g.mvarId))
    out.set(before[0].mvarId!, {
      command: state.steps[i].command,
      index: i,
      goal: before[0],
      children: after.filter(g => !ids.has(g.mvarId)),
    })
  }
  return out
}

const tacticOf = (s: Step) => s.command.trim().split(/\s/)[0]
const rewriteTarget = (s: Step) => s.command.match(/ at (\S+)/)?.[1] ?? ''

/** Several steps that read better as one: rewrites of the same thing, `intro x` + `intro h`. */
function merge(step: Step, steps: Map<string, Step>): Step {
  for (;;) {
    if (step.children.length !== 1) return step
    const next = steps.get(step.children[0].mvarId!)
    if (!next || !next.children.length) return step
    const t = tacticOf(step), u = tacticOf(next)
    if (/^(rewrite|rw)$/.test(t) && /^(rewrite|rw)$/.test(u) && rewriteTarget(step) === rewriteTarget(next)) {
      const rules = (s: Step) => s.command.match(/\[(.*)\]/)?.[1] ?? ''
      step = { ...step, command: step.command.replace(/\[(.*)\]/, `[${rules(step)}, ${rules(next)}]`), children: next.children }
    } else if (t === 'intro' && u === 'intro' && !newHyps(step.goal, step.children[0]).assumptions.length) {
      step = { ...step, command: 'intro', children: next.children }
    } else return step
  }
}

// ---------------------------------------------------------------------------------------------
// Writing the proof

/** Which line each assumption is on (by its `fvarId`). Sub-proofs extend a copy. */
type Scope = Map<string, number>

class Writer {
  private n = 0
  private explained = new Set<string>()
  /** Full names of the inventory theorems used. */
  used = new Set<string>()

  constructor(private steps: Map<string, Step>, private theorems: TheoremInfo[],
    private readsAs: Map<string, string> = new Map()) {}

  /** How to cite a theorem: its name, and the first time also what it says. */
  theorem(name: string): string {
    const info = this.theorems.find(t => t.name === name || t.displayName === name) ??
      this.theorems.find(t => t.name.endsWith('.' + name))
    if (!info) return `the theorem ${codeName(name)}`
    const cited = `the theorem ${codeName(info.displayName)}`
    // The rules of logic (`And.intro`, ...) are explained by the lines themselves.
    if (this.used.has(info.name) || /^(And|Or|Iff|Exists)\./.test(info.name)) return cited
    this.used.add(info.name)
    const says = info.statement ? theoremSays(info.statement) : undefined
    return says ? `${cited} (${says})` : cited
  }

  /** Write a numbered line; the first time a statement like `A ⊆ B` appears, say what it means. */
  fact(out: Line[], stmt: Expr | string, why: string, step?: number): number {
    const e = typeof stmt === 'string' ? parse(stmt) : stmt
    let text: string
    if (!e) text = math(stmt as string)
    else if (isFalse(e)) text = 'Contradiction.'
    else {
      text = capitalize(words(e))
      const m = meaning(e)
      if (m && !this.explained.has(tex(e))) { this.explained.add(tex(e)); text += `, that is, ${m}` }
    }
    out.push({ kind: 'fact', n: ++this.n, text, why, step })
    return this.n
  }

  note(out: Line[], text: string, step?: number) {
    out.push({ kind: 'note', text, step })
  }

  /** Lines for the assumptions of `goal` that aren't written yet. */
  catchUp(goal: InteractiveGoal, scope: Scope, out: Line[], why: string, step?: number) {
    for (const h of hyps(goal))
      if (h.assumption && !scope.has(h.fvarId)) scope.set(h.fvarId, this.fact(out, h.type, why, step))
  }

  /** The environment for reading a proof term in `goal`. */
  env(goal: InteractiveGoal, scope: Scope, out: Line[], step: number): Env {
    return {
      fact: name => {
        const h = [...hyps(goal)].reverse().find(h => h.name === name && h.assumption)
        if (!h) return undefined
        if (!scope.has(h.fvarId)) scope.set(h.fvarId, this.fact(out, h.type, 'assumption', step))
        return { line: scope.get(h.fvarId)!, stmt: parse(h.type) }
      },
      emit: d => this.fact(out, d.stmt!, why(d), step),
      theorem: name => this.theorem(name),
    }
  }

  /** Justify `stmt` by the proof term `term`: one line per inference. */
  derive(out: Line[], stmt: string | Expr, term: string, goal: InteractiveGoal, scope: Scope, step: number): number {
    const expected = typeof stmt === 'string' ? parse(stmt) : stmt
    const env = this.env(goal, scope, out, step)
    const d = explainTerm(term, expected, env)
    if (d?.line !== undefined && d.stmt && expected && equal(d.stmt, expected)) return d.line
    if (d) return this.fact(out, stmt, why(d), step)
    // Not understood: cite the assumptions the term mentions.
    const refs: number[] = [], others: string[] = []
    for (const token of term.match(/[A-Za-z_][\w.'!?₀-₉]*/g) ?? []) {
      const f = env.fact(token.split('.')[0])
      if (f) { if (!refs.includes(f.line)) refs.push(f.line) }
      else if (token.length > 1 && /[a-z]/.test(token) && !others.includes(token)) others.push(token)
    }
    return this.fact(out, stmt, why({ refs, by: others.length ? `using ${list(others.map(codeName))}` : undefined }), step)
  }

  /** For the rules of a rewrite: the lines they cite, and "the definition of $\cup$" or
   * "the theorem ..." for the others. */
  rewriteReasons(rules: string, goal: InteractiveGoal, scope: Scope, out: Line[], step: number): { refs: number[], by: string } {
    const env = this.env(goal, scope, out, step)
    const refs: number[] = [], defs: string[] = [], thms: string[] = []
    for (const rule of rules.split(',').map(r => r.replace(/←/g, '').trim()).filter(r => r)) {
      const name = rule.split(/\s/)[0]
      const f = env.fact(name)
      const def = DEFINITIONS[name.replace(/^Set\./, '')]
      if (f) { if (!refs.includes(f.line)) refs.push(f.line) }
      else if (def) { if (!defs.includes(def)) defs.push(def) }
      else if (!thms.includes(name)) thms.push(name)
    }
    const parts: string[] = []
    if (defs.length) parts.push(`the definition${defs.length > 1 ? 's' : ''} of ${list(defs)}`)
    if (thms.length) parts.push(list(thms.map(t => this.theorem(t))))
    return { refs, by: list(parts) }
  }

  /** Lines for an assumption that a step changed (`rewrite ... at h`, `push_neg at h`). */
  changed(step: Step, child: InteractiveGoal, scope: Scope, out: Line[], why: (old?: number) => string) {
    const before = new Map(hyps(step.goal).map(h => [h.name, h.fvarId]))
    const target = step.command.match(/ at (\S+)/)?.[1]
    for (const h of newHyps(step.goal, child).changed) {
      if (target && h.name !== target) continue
      const old = scope.get(before.get(h.name)!)
      scope.set(h.fvarId, this.fact(out, h.type, why(old), step.index))
    }
  }

  /** Continue with a goal: write the lines of its assumptions not written yet, then its proof. */
  go(goal: InteractiveGoal, scope: Scope, out: Line[], step?: number) {
    this.catchUp(goal, scope, out, 'assumption', step)
    this.prove(goal, scope, out)
  }

  /** The lines proving `goal`. */
  prove(goal: InteractiveGoal, scope: Scope, out: Line[]) {
    const first = this.steps.get(goal.mvarId!)
    if (!first) return
    const step = merge(first, this.steps)
    const i = step.index
    const cmd = step.command.trim().replace(/\s+/g, ' ')
    const tactic = cmd.split(' ')[0]
    const g = goalText(step.goal), ge = parse(g)
    const kids = step.children
    const next = kids[0]
    const d = next ? newHyps(step.goal, next) : { objects: [], assumptions: [], changed: [] }
    const mustShow = (lines: Line[], c: InteractiveGoal) => {
      const t = goalText(c)
      this.note(lines, t === 'False' ? 'We must derive a contradiction.' : `We must show that ${say(t)}.`, i)
    }
    const term = cmd.replace(/^(exact|apply)\s+/, '')

    switch (tactic) {
      case 'intro':
      case 'intros':
      case 'ext': {
        const objs = d.objects.map(h => math(h.name))
        if (tactic === 'ext') this.note(out, `Two sets are equal if they have the same elements. So we show that ${say(goalText(next))} for every $${d.objects.map(h => toLatex(h.name)).join(', ')}$.`, i)
        else if (ge && isBinOp(ge, '⊆')) this.note(out, `To prove ${say(g)}, we show that ${meaning(ge)}.`, i)
        else if (ge && negated(ge) && !d.objects.length)
          this.note(out, `To prove ${say(g)}, we suppose ${say(negated(ge)!)} and derive a contradiction.`, i)
        const block: BlockLine = { kind: 'block', header: objs.length ? `Let ${list(objs)} be arbitrary.` : undefined, lines: [], step: i }
        const sc = new Map(scope)
        for (const h of d.assumptions) sc.set(h.fvarId, this.fact(block.lines, h.type, 'assumption', i))
        if (next) {
          if (tactic !== 'ext') mustShow(block.lines, next)  // the note above said it already
          this.go(next, sc, block.lines, i)
        }
        out.push(block)
        if (objs.length) {
          const was = objs.length > 1 ? 'were' : 'was'
          const what = tactic === 'ext' ? `the two sets have the same elements, that is, ${say(g)}`
            : ge && meaning(ge) ? `${meaning(ge)}, that is, ${say(g)}` : say(g)
          this.note(out, `Since ${list(objs)} ${was} arbitrary, ${what}.`, i)
        } else this.note(out, `This shows that ${say(g)}.`, i)
        return
      }

      case 'by_contra': {
        this.note(out, 'We argue by contradiction.', i)
        const block: BlockLine = { kind: 'block', lines: [], step: i }
        const sc = new Map(scope)
        for (const h of d.assumptions) sc.set(h.fvarId, this.fact(block.lines, h.type, 'assumption, for contradiction', i))
        if (next) this.go(next, sc, block.lines, i)
        out.push(block)
        this.note(out, `This contradiction shows that ${say(g)}.`, i)
        return
      }

      case 'exfalso':
        this.note(out, `To show ${say(g)}, it suffices to derive a contradiction.`, i)
        if (next) this.go(next, new Map(scope), out, i)
        return

      case 'push_neg': {
        const sc = new Map(scope)
        if (/ at /.test(cmd)) this.changed(step, next, sc, out, old => `from ${old}, moving the negation inside`)
        else if (next) this.note(out, `Moving the negation inside, we must show that ${say(goalText(next))}.`, i)
        if (next) this.go(next, sc, out, i)
        return
      }

      case 'rewrite':
      case 'rw': {
        const sc = new Map(scope)
        const r = this.rewriteReasons(cmd.match(/\[(.*)\]/)?.[1] ?? '', step.goal, sc, out, i)
        if (/ at /.test(cmd)) {
          this.changed(step, next, sc, out, old =>
            why({ refs: [old, ...r.refs].filter((x): x is number => x !== undefined), by: r.by ? `by ${r.by}` : undefined }))
        } else {
          const lines = r.refs.length ? `line${r.refs.length > 1 ? 's' : ''} ${list(r.refs.map(String))}` : ''
          const by = list([r.by, lines].filter(x => x)) || 'rewriting'
          if (next) this.note(out, `By ${by}, to show ${say(g)} we must show that ${say(goalText(next))}.`, i)
          else this.note(out, `By ${by}, ${say(g)}.`, i)
        }
        if (next) this.go(next, sc, out, i)
        return
      }

      case 'rfl': {
        const sides = g.split(/ = | ↔ /)
        this.note(out, sides.length === 2 && sides[0].trim() === sides[1].trim()
          ? 'Both sides are the same, so this holds.' : `${capitalize(say(g))} holds by definition.`, i)
        return
      }

      case 'left':
      case 'right':
        this.note(out, `To show ${say(g)}, it suffices to show that ${say(goalText(next))}.`, i)
        this.go(next, new Map(scope), out, i)
        return

      case 'use':
        this.take(step, cmd.slice(4).trim(), scope, out)
        return

      case 'by_cases':
      case 'rcases':
      case 'obtain':
      case 'cases': {
        const sc = new Map(scope)
        let source: number | undefined, sourceStmt: string | undefined
        const of = cmd.match(/:= (.+)$/)?.[1] ?? cmd.match(/^(?:rcases|cases) (.+?) with/)?.[1]
        if (of) {
          const h = [...hyps(step.goal)].reverse().find(h => h.name === of && h.assumption)
          sourceStmt = h?.type
          source = h ? sc.get(h.fvarId) : undefined
          if (source === undefined) {
            const r = explainTerm(of, undefined, this.env(step.goal, sc, out, i))
            if (r?.stmt) { source = r.line ?? this.fact(out, r.stmt, why(r), i); sourceStmt = tex(r.stmt) }
          }
        }
        const from = source !== undefined ? `from ${source}` : 'from the above'
        if (kids.length >= 2) {
          const n = kids.length === 2 ? 'two' : String(kids.length)
          if (tactic === 'by_cases') {
            const p = cmd.match(/^by_cases \S+ : (.+)$/)?.[1]
            this.note(out, p ? `We consider two cases: either ${say(p)}, or not.` : 'We consider two cases.', i)
          } else this.note(out, source !== undefined ? `By line ${source}, there are ${n} cases.` : `We consider ${n} cases.`, i)
          kids.forEach((c, k) => {
            const block: BlockLine = { kind: 'block', header: `Case ${k + 1}.`, lines: [], step: i }
            const csc = new Map(sc)
            const nd = newHyps(step.goal, c)
            for (const h of [...nd.assumptions, ...nd.changed]) csc.set(h.fvarId, this.fact(block.lines, h.type, 'case assumption', i))
            this.go(c, csc, block.lines, i)
            out.push(block)
          })
          this.note(out, `So in ${kids.length === 2 ? 'both' : 'all'} cases, ${say(g)}.`, i)
          return
        }
        const objs = d.objects.map(o => math(o.name))
        for (const h of [...d.assumptions, ...d.changed])
          sc.set(h.fvarId, this.fact(out, h.type, objs.length ? `${from}, choosing ${list(objs)}` : from, i))
        if (next) this.go(next, sc, out, i)
        return
      }

      case 'constructor':
        this.parts(step, ge && isBinOp(ge, '↔') ? 'directions' : 'parts', scope, out)
        return

      case 'have': {
        const sc = new Map(scope)
        if (!cmd.includes(':=') && kids.length >= 2) {
          // A claim, proved first.
          const block: BlockLine = { kind: 'block', header: `Claim: ${say(goalText(kids[0]))}.`, lines: [], step: i }
          this.go(kids[0], new Map(sc), block.lines, i)
          out.push(block)
          for (const k of kids.slice(1)) {
            const ksc = new Map(sc)
            for (const h of newHyps(step.goal, k).assumptions) ksc.set(h.fvarId, this.fact(out, h.type, 'the claim above', i))
            this.go(k, ksc, out, i)
          }
          return
        }
        const h = next ? newHyps(step.goal, next).assumptions[0] : undefined
        const stmt = h?.type ?? cmd.match(/^have \S+ : (.+?) :=/)?.[1] ?? ''
        const n = this.derive(out, stmt, cmd.split(':=').slice(1).join(':=').trim(), step.goal, sc, i)
        if (h) sc.set(h.fvarId, n)
        if (next) this.go(next, sc, out, i)
        return
      }

      case 'exact':
      case 'apply': {
        if (/^Iff\.intro$/.test(term)) { this.parts(step, 'directions', scope, out); return }
        if (/^And\.intro$/.test(term)) { this.parts(step, 'parts', scope, out); return }
        const firstPart = term.match(/^And\.intro (\S+)$/)
        if (firstPart && kids.length === 1 && ge?.kind === 'bin' && ge.op === '∧') {
          // `apply And.intro h`: the first part is known, the second is left to show.
          const sc = new Map(scope)
          const n = this.derive(out, ge.left, firstPart[1], step.goal, sc, i)
          this.note(out, `So to show ${say(g)}, it remains to show that ${say(goalText(next))} (we have the first part, line ${n}).`, i)
          this.go(next, sc, out, i)
          return
        }
        const exists = term.match(/^Exists\.intro (\S+)(.*)$/)
        if (exists && kids.length) { this.take(step, exists[1], scope, out); return }
        if (/^Or\.in[lr]$/.test(term)) {
          this.note(out, `To show ${say(g)}, it suffices to show that ${say(goalText(next))}.`, i)
          this.go(next, new Map(scope), out, i)
          return
        }
        const sc = new Map(scope)
        if (!kids.length) {
          // The term proves the goal.
          const n = this.derive(out, g, term, step.goal, sc, i)
          const last = out[out.length - 1]
          if (!(last?.kind === 'fact' && last.n === n))
            this.note(out, g === 'False' ? `Line ${n} is a contradiction.` : `This is line ${n}, which is what we needed to show.`, i)
          return
        }
        // Working backwards: the term proves the goal from what is left to show.
        const head = term.split(' ')[0]
        const f = this.env(step.goal, sc, out, i).fact(head.split('.')[0])
        let by: string
        if (f && term !== head) {
          const r = explainTerm(term, undefined, this.env(step.goal, sc, out, i))
          by = r?.stmt ? `line ${r.line ?? this.fact(out, r.stmt, why(r), i)}` : `line ${f.line}`
        } else by = f ? `line ${f.line}` : this.theorem(head)
        const goals = kids.map(c => say(goalText(c)))
        this.note(out, `By ${by}, to show ${say(g)} it suffices to show that ${list(goals)}.`, i)
        if (kids.length === 1) { this.go(next, sc, out, i); return }
        kids.forEach(c => {
          const block: BlockLine = { kind: 'block', header: `Proof that ${say(goalText(c))}:`, lines: [], step: i }
          this.go(c, new Map(sc), block.lines, i)
          out.push(block)
        })
        this.note(out, `So, by ${f ? by : this.theorem(head)}, ${say(g)}.`, i)  // (named again: short)
        return
      }

      default: {
        // The game's own sentence for the tactic (`TacticDoc foo reads "..."`), if it has one.
        const template = this.readsAs.get(tacticKey(tactic))
        if (template) {
          this.note(out, fillTemplate(template, {
            args: cmd.slice(tactic.length).trim(), before: step.goal, after: next, noGoalsAfter: !next,
          }, 'we are done'), i)
          if (kids.length > 1) kids.forEach(c => { mustShow(out, c); this.go(c, new Map(scope), out, i) })
          else if (next) this.go(next, new Map(scope), out, i)
          return
        }
        this.note(out, `Next we use ${codeName(cmd)}.`, i)
        kids.forEach(c => { mustShow(out, c); this.go(c, new Map(scope), out, i) })
      }
    }
  }

  /** `use w`: choose the object an existential statement asks for. */
  private take(step: Step, w: string, scope: Scope, out: Line[]) {
    const g = goalText(step.goal), ge = parse(g)
    const v = ge?.kind === 'binder' ? ge.vars.map(tex).join(', ') : undefined
    const choose = v && v !== toLatex(w) ? `we take $${v} = ${toLatex(w)}$` : `we take ${math(w)}`
    this.note(out, `To show ${say(g)}, ${choose}.`, step.index)
    const next = step.children[0]
    if (!next) { this.note(out, 'With this choice, what we need holds by the lines above.', step.index); return }
    this.note(out, `We must show that ${say(goalText(next))}.`, step.index)
    this.go(next, new Map(scope), out, step.index)
  }

  /** `constructor`, `apply Iff.intro`, `apply And.intro`: prove each part. */
  private parts(step: Step, what: 'directions' | 'parts', scope: Scope, out: Line[]) {
    const g = goalText(step.goal)
    this.note(out, `We prove both ${what}.`, step.index)
    step.children.forEach((c, k) => {
      const header = what === 'directions' && step.children.length === 2
        ? `${k === 0 ? '($\\Rightarrow$)' : '($\\Leftarrow$)'} We show that ${say(goalText(c))}.`
        : `We show that ${say(goalText(c))}.`
      const block: BlockLine = { kind: 'block', header, lines: [], step: step.index }
      this.go(c, new Map(scope), block.lines, step.index)
      out.push(block)
    })
    this.note(out, `So ${say(g)}.`, step.index)
  }
}

/**
 * What a theorem says, from its statement as the game shows it:
 * `{α} {a b} (h₁ : a ⊆ b) (h₂ : b ⊆ a) : a = b` says "if $a \subseteq b$ and $b \subseteq a$,
 * then $a = b$", and `{U} (A B : Set U) : A ∩ B ⊆ B ∩ A` says "$A \cap B \subseteq B \cap A$".
 */
export function theoremSays(statement: string): string | undefined {
  // The binders `(...)`, `{...}`, `[...]` before the last ` : `, at the top level.
  const assumptions: Expr[] = []
  let depth = 0, start = -1, colon = -1
  for (let k = 0; k < statement.length; k++) {
    const c = statement[k]
    if ('({['.includes(c)) { if (depth === 0) start = k; depth++ }
    else if (')}]'.includes(c)) {
      depth--
      if (depth === 0 && statement[start] === '(') {
        const inner = statement.slice(start + 1, k)
        const sep = inner.indexOf(' : ')
        const type = sep >= 0 ? parse(inner.slice(sep + 3)) : undefined
        if (type && isProposition(type)) assumptions.push(type)
      }
    } else if (depth === 0 && c === ':' ) colon = k
  }
  if (colon < 0) return undefined
  const conclusion = parse(statement.slice(colon + 1))
  if (!conclusion) return undefined
  return assumptions.length
    ? `if ${list(assumptions.map(a => words(a)))}, then ${words(conclusion)}`
    : words(conclusion)
}

/** Whether an expression is a statement (rather than a type such as `Set U`). */
function isProposition(e: Expr): boolean {
  return e.kind === 'bin' || e.kind === 'not' || e.kind === 'binder'
}

/** "from 1 and 3: every element of $A$ is an element of $B$" */
function why(d: Pick<Derived, 'refs' | 'by' | 'explain'>): string {
  const parts: string[] = []
  if (d.refs.length) parts.push(`from ${list(d.refs.map(String))}`)
  if (d.by) parts.push(d.by)
  const s = parts.join(', ') || 'by the above'
  return d.explain ? `${s}: ${d.explain}` : s
}

/** The written proof of a completed level, or `undefined` if there is nothing to write. */
export function writtenProof(state: ProofState, level: {
  title?: string | null, descrText?: string | null, theorems?: TheoremInfo[],
  /** The game's "reads as" templates by tactic (`tacticKey`), already translated. */
  readsAs?: Map<string, string>
}): WrittenProof | undefined {
  const start = state.steps[0]?.goals[0]?.goal
  if (!start) return undefined
  const w = new Writer(stepsByGoal(state), level.theorems ?? [], level.readsAs)
  const lines: Line[] = []
  const scope: Scope = new Map()
  w.catchUp(start, scope, lines, 'given')
  w.prove(start, scope, lines)
  if (!lines.length) return undefined
  return {
    title: level.title ?? '',
    statement: latexMath((level.descrText ?? math(goalText(start))).trim()),
    lines,
    theorems: [...w.used],
  }
}

// ---------------------------------------------------------------------------------------------
// Output

/** Maths in the author's statement may use Unicode (`$x ∈ A$`); LaTeX needs commands. */
const latexMath = (text: string) => text.replace(/\$([^$]+)\$/g, (_, m) => `$${symbolsToLatex(m).replace(/ +/g, ' ').trim()}$`)

/** The game's Markdown (`*emphasis*`, `` `code` ``) in LaTeX. */
function markdownToLatex(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
    .replace(/\*([^*]+)\*/g, '\\emph{$1}')
    .replace(/`([^`]+)`/g, (_, c) => `\\texttt{${c.replace(/[_#%&{}]/g, (x: string) => '\\' + x)}}`)
    .replace(/"([^"]+)"/g, '``$1\'\'')
}

function linesToLatex(lines: Line[], indent = ''): string {
  return lines.map(l => {
    switch (l.kind) {
      case 'fact': return `${indent}\\pline{${l.n}.}{${markdownToLatex(l.text)}}{${markdownToLatex(l.why)}}`
      case 'note': return `${indent}\\pnote{${markdownToLatex(l.text)}}`
      case 'block': return [
        `${indent}\\begin{subproof}`,
        ...(l.header ? [`${indent}  \\pnote{\\textbf{${markdownToLatex(l.header)}}}`] : []),
        linesToLatex(l.lines, indent + '  '),
        `${indent}\\end{subproof}`,
      ].join('\n')
    }
  }).join('\n')
}

/** A standalone LaTeX document with the proofs. */
export function toLatexDocument(proofs: WrittenProof[], title: string): string {
  let world: string | undefined
  const body = proofs.map(p => [
    // Grouped by world, if they come from several.
    ...(p.world && p.world !== world ? [`\\section*{${markdownToLatex((world = p.world))}}`] : []),
    `\\${p.world ? 'subsection' : 'section'}*{${markdownToLatex(p.title)}}`,
    `\\begin{theorem}`,
    markdownToLatex(p.statement),
    `\\end{theorem}`,
    `\\begin{proof}\\leavevmode`,
    linesToLatex(p.lines),
    `\\end{proof}`,
  ].join('\n')).join('\n\n')
  return [
    '\\documentclass{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{amsmath,amssymb,amsthm,mathrsfs}',
    '\\newtheorem*{theorem}{Theorem}',
    '% A numbered line with its justification, a note, and an indented part of a proof.',
    '\\newcommand{\\pline}[3]{\\par\\noindent\\hangindent=2.8em\\makebox[2.2em][r]{#1}\\hspace{.6em}#2\\hspace*{1em}\\hfill{\\small[#3]}}',
    '\\newcommand{\\pnote}[1]{\\par\\noindent\\hangindent=2.8em\\hspace{2.8em}\\emph{#1}}',
    '% (Not a list: proofs nest deeper than LaTeX allows lists to.)',
    '\\newenvironment{subproof}{\\par\\advance\\leftskip 1.5em\\relax}{\\par}',
    `\\title{${markdownToLatex(title)}}`,
    '\\date{}',
    '\\begin{document}',
    '\\maketitle',
    '',
    body,
    '',
    '\\end{document}',
    '',
  ].join('\n')
}
