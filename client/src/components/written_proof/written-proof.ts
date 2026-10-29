/**
 * Turns a completed tactic proof into a proof written out in words, the way a mathematician
 * would write it ("Let x be arbitrary and suppose x ∈ A. Since A ⊆ B, x ∈ B. ...").
 *
 * The sentences come from templates per tactic, filled in with the goals and assumptions
 * before and after each step (which the game server sends for every step anyway). The result
 * follows the player's own proof, step by step.
 *
 * Sentences are plain text with `$...$` maths in LaTeX, so they can be rendered as Markdown
 * (with KaTeX) in the game and pasted into a LaTeX document as they are.
 */
import type { ProofState, InteractiveGoal } from '../../api/rpc_api'
import { exprToLatex } from './lean-expr'

/** A part of a written proof: sentences, and labelled sub-proofs (cases, directions, claims). */
export interface ProofBlock {
  label?: string
  items: (string | ProofBlock)[]
}

export interface WrittenProof {
  title: string
  /** The theorem, as text with `$...$` maths. */
  statement: string
  proof: ProofBlock
}

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
  for (const [re, tex] of SYMBOLS) s = s.replace(re, tex)
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

/** `a`, `a and b`, `a, b and c` */
function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('')
  return xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Whether `expr` is built with `op` at the top level (outside parentheses and brackets). */
function topLevel(expr: string, op: string): boolean {
  let depth = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if ('([{⟨'.includes(c)) depth++
    else if (')]}⟩'.includes(c)) depth--
    else if (depth === 0 && expr.startsWith(op, i)) return true
  }
  return false
}

/** "show that $P$", or "derive a contradiction" for `False`. */
const showThat = (expr: string) => expr === 'False' ? 'derive a contradiction' : `show that ${math(expr)}`

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
  subset_def: '$\\subseteq$', mem_singleton_iff: 'singleton sets', mem_insert_iff: 'listing elements',
  mem_pair: 'a set of two elements',
  mem_symmDiff: 'symmetric difference', symmDiff_def: 'symmetric difference', mem_univ: '$\\mathcal{U}$',
  mem_empty_iff_false: '$\\emptyset$', not_not: 'double negation', ne_eq: '$\\neq$', ext_iff: 'set equality',
}

const theoremName = (name: string) => `$\\mathtt{${name.replace(/_/g, '\\_')}}$`

interface Reasons { facts: string[], theorems: string[], definitions: string[] }

/** What a step uses: the assumptions (as statements) and the theorems named in `term`. */
function reasons(term: string, goal: InteractiveGoal): Reasons {
  const known = new Map(hyps(goal).map(h => [h.name, h]))
  const facts: string[] = [], theorems: string[] = [], definitions: string[] = []
  for (const token of term.match(/[A-Za-z_][\w.'!?₀-₉]*/g) ?? []) {
    const base = token.split('.')[0]
    const h = known.get(base)
    const def = DEFINITIONS[token.replace(/^Set\./, '')]
    if (h) {
      if (h.assumption && !facts.includes(h.type)) facts.push(h.type)
    } else if (def) {
      if (!definitions.includes(def)) definitions.push(def)
    } else if (/[a-z]/.test(token) && token.length > 1 &&
        !/^(And|Or|Iff|Exists|fun|by|at|with|show|from|left|right|intro|mp|mpr|inl|inr)$/.test(base)) {
      if (!theorems.includes(theoremName(token))) theorems.push(theoremName(token))
    }
  }
  return { facts, theorems, definitions }
}

/** "since $A ⊆ B$ and $x ∈ A$" / "by the definition of $\cap$" / "" */
function because(r: Reasons): string {
  const parts: string[] = []
  if (r.definitions.length) parts.push(`by the definition${r.definitions.length > 1 ? 's' : ''} of ${list(r.definitions)}`)
  if (r.theorems.length) parts.push(`by ${list(r.theorems)}`)
  const by = parts.join(' and ')
  const facts = r.facts.map(math)
  if (facts.length && by) return `since ${list(facts)}, ${by}`
  if (facts.length) return `since ${list(facts)}`
  return by
}

// ---------------------------------------------------------------------------------------------
// Steps

interface Step {
  command: string
  goal: InteractiveGoal        // the goal the step works on
  children: InteractiveGoal[]  // the goals it leaves (none if it closes the goal)
}

/** The words for one step: sentences before its sub-proofs, labels for them, sentences after. */
interface Words {
  before: string[]
  labels?: string[]
  /** `have` without a proof term: the first new goal is a claim proved in its own block. */
  claim?: boolean
  after?: string[]
  /** The statement the last sentence established, if any. */
  stated?: string
}

/** The variable of an existential goal `∃ s, ...` or `∃ s ∈ F, ...`. */
const witnessVar = (goal: string) => goal.match(/^∃\s*([^\s,∈:]+)/)?.[1]

/** "Let $s = A$." for `use A` on `∃ s, ...` ("Take $A$." if that would be confusing). */
function take(goal: string, witness: string): string {
  const v = witnessVar(goal)
  const mentions = v && new RegExp(`(^|[^\\w'])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w'])`).test(witness)
  return v && !mentions ? `Let ${math(`${v} = ${witness}`)}.` : `Take ${math(witness)}.`
}

/** A step that closes its goal with a proof term (`exact`, or `apply` leaving no goals). */
function closing(term: string, step: Step, stated?: string): string[] {
  const g = goalText(step.goal)
  const r = reasons(term, step.goal)
  const contradiction = r.facts.filter(f => f !== 'False')
  if (r.facts.includes('False')) return []  // "this is impossible" was already said
  if (g === 'False') {
    if (contradiction.length >= 2) return [`But ${list(contradiction.map(math))} contradict each other.`]
    return [`This is a contradiction${contradiction.length ? `, since ${list(contradiction.map(math))}` : ''}.`]
  }
  const single = hyps(step.goal).find(h => h.name === term.trim())
  if (single && single.type === g)
    return [stated === g ? 'This is what we needed to show.' : `We already know that ${math(g)}.`]
  const why = because(r)
  return [why ? `${capitalize(why)}, ${math(g)}.` : `Clearly ${math(g)}.`]
}

function words(step: Step, stated?: string): Words {
  const cmd = step.command.trim().replace(/\s+/g, ' ')
  const tactic = cmd.split(' ')[0]
  const g = goalText(step.goal)
  const child = step.children[0]
  const next = child ? goalText(child) : undefined
  const mustShow = (expr = next) => expr === undefined ? [] :
    expr === 'False' ? ['We will derive a contradiction.'] : [`We must show that ${math(expr)}.`]
  const diff = child ? newHyps(step.goal, child) : { objects: [], assumptions: [], changed: [] }
  const target = cmd.match(/ at (\S+)$/)?.[1]
  const changedTarget = target ? diff.changed.filter(h => h.name === target) : []
  const casesLabels = () => step.children.map((c, i) => {
    const { assumptions, changed } = newHyps(step.goal, c)
    const facts = [...assumptions, ...changed].map(h => math(h.type))
    return `Case ${i + 1}${facts.length ? `: ${list(facts)}` : ''}.`
  })
  const partLabels = () => topLevel(g, '↔') && step.children.length === 2
    ? ['($\\Rightarrow$)', '($\\Leftarrow$)']
    : step.children.map(c => `Proof that ${math(goalText(c))}.`)
  /** A changed assumption: "this means $P$", or "this is impossible" if it became `False`. */
  const changedSentence = (lead: string, h: Hyp) =>
    h.type === 'False' ? `${capitalize(lead ? lead + ', this' : 'this')} is impossible.` : `${capitalize(lead || 'so')}, ${math(h.type)}.`

  switch (tactic) {
    case 'intro':
    case 'intros':
    case 'ext': {
      const objs = diff.objects.map(h => math(h.name))
      const sups = diff.assumptions.map(h => math(h.type))
      const parts: string[] = []
      if (objs.length) parts.push(`let ${list(objs)} be arbitrary`)
      if (sups.length) parts.push(`suppose ${list(sups)}`)
      const intro = tactic === 'ext' ? ['We show that both sets have the same elements.'] : []
      return {
        before: [...intro, ...(parts.length ? [capitalize(parts.join(', and ')) + '.'] : []), ...mustShow()],
        after: objs.length ? [`Since ${list(objs)} ${objs.length > 1 ? 'were' : 'was'} arbitrary, this shows that ${math(g)}.`] : [],
      }
    }
    case 'by_contra':
      return { before: diff.assumptions.length ? [`Suppose, for contradiction, that ${math(diff.assumptions[0].type)}.`] : [] }
    case 'exfalso':
      return { before: [] }
    case 'push_neg':
      if (target) return { before: changedTarget.map(h => changedSentence('equivalently', h)), stated: changedTarget[0]?.type }
      return { before: next === undefined ? [] : [`Equivalently, we must ${showThat(next)}.`] }
    case 'rfl': {
      const sides = g.split(/ = | ↔ /)
      return { before: [sides.length === 2 && sides[0].trim() === sides[1].trim() ? 'This is clearly true.' : 'This holds by definition.'] }
    }
    case 'left':
    case 'right':
      return { before: [`It suffices to ${showThat(next!)}.`] }
    case 'use':
      return { before: [take(g, cmd.slice(4).trim()), ...(next === undefined ? ['This choice works.'] : mustShow())] }
    case 'by_cases':
      return { before: ['We consider two cases.'], labels: casesLabels() }
    case 'constructor':
      return { before: [topLevel(g, '↔') ? 'We prove both directions.' : 'We prove both parts.'], labels: partLabels() }
    case 'rcases':
    case 'obtain':
    case 'cases': {
      const of = cmd.match(/:= (.+)$/)?.[1] ?? cmd.match(/^(?:rcases|cases) (\S+)/)?.[1] ?? ''
      const h = hyps(step.goal).find(h => h.name === of.split('.')[0])
      let since = h && !of.includes('.') ? `Since ${math(h.type)}, ` : ''
      if (step.children.length >= 2) {
        const n = step.children.length === 2 ? 'two' : String(step.children.length)
        if (!since) {
          // e.g. `rcases h.left with hA | hB`: the cases together say what was split
          const cases = step.children.map(c => { const d = newHyps(step.goal, c); return [...d.assumptions, ...d.changed][0]?.type })
          if (cases.every(c => c)) since = `Since ${math(cases.map(c => `(${c})`).join(' ∨ '))}, `
        }
        return { before: [since ? `${since}we consider ${n} cases.` : `We consider ${n} cases.`], labels: casesLabels() }
      }
      const sups = [...diff.assumptions, ...diff.changed]
      const facts = list(sups.map(x => math(x.type)))
      const stated = sups[sups.length - 1]?.type
      if (diff.objects.length)
        return { before: [`${since || 'So '}we can choose ${list(diff.objects.map(o => math(o.name)))} such that ${facts}.`], stated }
      return { before: [`${since ? since + 'we know that ' : 'So '}${facts}.`], stated }
    }
    case 'have': {
      if (!cmd.includes(':=') && step.children.length >= 2) return { before: [], claim: true }
      const added = child ? newHyps(step.goal, step.children[step.children.length - 1]).assumptions : []
      const fact = added[0]?.type ?? cmd.match(/^have \S+ : (.+?) :=/)?.[1] ?? ''
      const why = because(reasons(cmd.split(':=').slice(1).join(':='), step.goal))
      return { before: [why ? `${capitalize(why)}, ${math(fact)}.` : `We have ${math(fact)}.`], stated: fact }
    }
    case 'rewrite':
    case 'rw': {
      const rules = cmd.match(/\[(.*)\]/)?.[1] ?? ''
      const why = because(reasons(rules.replace(/←/g, ' '), step.goal))
      if (target) return { before: changedTarget.map(h => changedSentence(why, h)), stated: changedTarget[0]?.type }
      if (next === undefined) return { before: [`${capitalize(why || 'rewriting')}, ${math(g)}.`] }
      return { before: [`${why ? capitalize(why) + ', it' : 'It'} suffices to ${showThat(next)}.`] }
    }
    case 'exact':
    case 'apply': {
      const term = cmd.replace(/^(exact|apply)\s+/, '')
      if (/^Iff\.intro$/.test(term)) return { before: ['We prove both directions.'], labels: partLabels() }
      if (/^And\.intro$/.test(term)) return { before: ['We prove both parts.'], labels: partLabels() }
      const exists = term.match(/^Exists\.intro (\S+)(.*)$/)
      if (exists) {
        if (next === undefined) {
          const why = because(reasons(exists[2], step.goal))
          return { before: [take(g, exists[1]), why ? `${capitalize(why)}, this choice works.` : 'This choice works.'] }
        }
        return { before: [take(g, exists[1]), ...mustShow()] }
      }
      if (/^Or\.in[lr]$/.test(term)) return { before: [`It suffices to ${showThat(next!)}.`] }
      if (next === undefined) return { before: closing(term, step, stated) }
      const why = because(reasons(term, step.goal))
      const goals = step.children.map(c => goalText(c))
      const lead = why ? `${capitalize(why)}, it suffices` : 'It suffices'
      if (step.children.length >= 2)
        return { before: [`${lead} to show that ${list(goals.map(math))}.`], labels: partLabels() }
      return { before: [`${lead} to ${showThat(goals[0])}.`] }
    }
    default:
      return { before: [`Next we use ${theoremName(cmd)}.`, ...mustShow()] }
  }
}

// ---------------------------------------------------------------------------------------------
// The whole proof

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
      goal: before[0],
      children: after.filter(g => !ids.has(g.mvarId)),
    })
  }
  return out
}

const tacticOf = (s: Step) => s.command.trim().split(/\s/)[0]
const rewriteTarget = (s: Step) => s.command.match(/ at (\S+)/)?.[1] ?? ''

/** Several steps that read better as one sentence: rewrites of the same thing, and intros. */
function merge(step: Step, steps: Map<string, Step>): Step {
  for (;;) {
    if (step.children.length !== 1) return step
    const next = steps.get(step.children[0].mvarId!)
    if (!next || !next.children.length) return step
    const t = tacticOf(step), u = tacticOf(next)
    if (/^(rewrite|rw)$/.test(t) && /^(rewrite|rw)$/.test(u) && rewriteTarget(step) === rewriteTarget(next)) {
      const rules = (s: Step) => s.command.match(/\[(.*)\]/)?.[1] ?? ''
      step = { command: step.command.replace(/\[(.*)\]/, `[${rules(step)}, ${rules(next)}]`), goal: step.goal, children: next.children }
    } else if (t === 'intro' && u === 'intro' && !newHyps(step.goal, step.children[0]).assumptions.length) {
      // `intro x` then `intro h`: "Let x be arbitrary, and suppose ...".
      step = { command: 'intro', goal: step.goal, children: next.children }
    } else return step
  }
}

function render(goal: InteractiveGoal, steps: Map<string, Step>, stated?: string): (string | ProofBlock)[] {
  const first = steps.get(goal.mvarId!)
  if (!first) return []
  const step = merge(first, steps)
  const w = words(step, stated)
  const items: (string | ProofBlock)[] = [...w.before]
  const kids = step.children
  if (w.claim) {
    items.push({ label: `Claim: ${math(goalText(kids[0]))}.`, items: render(kids[0], steps) })
    for (const k of kids.slice(1)) items.push(...render(k, steps, goalText(kids[0])))
  } else if (kids.length === 1) {
    items.push(...render(kids[0], steps, w.stated))
  } else if (kids.length > 1) {
    kids.forEach((k, i) => items.push({ label: w.labels?.[i] ?? `Part ${i + 1}.`, items: render(k, steps) }))
  }
  items.push(...(w.after ?? []))
  return items
}

/** The written proof of a completed level, or `undefined` if there is nothing to write. */
export function writtenProof(state: ProofState, level: { title?: string | null, descrText?: string | null }): WrittenProof | undefined {
  const start = state.steps[0]?.goals[0]?.goal
  if (!start) return undefined
  const items = render(start, stepsByGoal(state))
  if (!items.length) return undefined
  return {
    title: level.title ?? '',
    statement: latexMath((level.descrText ?? math(goalText(start))).trim()),
    proof: { items },
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
}

/** Sentences as paragraphs; sub-proofs next to each other as one `description` list. */
function blockToLatex(block: ProofBlock, indent = ''): string {
  const out: string[] = []
  let para: string[] = []
  let inList = false
  const flush = () => { if (para.length) out.push(indent + para.join(' ')); para = [] }
  const endList = () => { if (inList) out.push(`${indent}\\end{description}`); inList = false }
  for (const item of block.items) {
    if (typeof item === 'string') { endList(); para.push(item); continue }
    flush()
    if (!inList) out.push(`${indent}\\begin{description}`)
    inList = true
    out.push(`${indent}  \\item[{${item.label ?? ''}}] ${blockToLatex(item, indent + '    ').trimStart()}`)
  }
  flush()
  endList()
  return out.join('\n')
}

/** A standalone LaTeX document with the proofs. */
export function toLatexDocument(proofs: WrittenProof[], title: string): string {
  const body = proofs.map(p => [
    `\\section*{${markdownToLatex(p.title)}}`,
    `\\begin{theorem}`,
    markdownToLatex(p.statement),
    `\\end{theorem}`,
    `\\begin{proof}`,
    blockToLatex(p.proof),
    `\\end{proof}`,
  ].join('\n')).join('\n\n')
  return [
    '\\documentclass{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{amsmath,amssymb,amsthm,mathrsfs}',
    '\\newtheorem*{theorem}{Theorem}',
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
