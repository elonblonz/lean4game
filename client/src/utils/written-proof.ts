/**
 * @fileOverview The "reads as" templates of the game's tactic docs (`TacticDoc intro reads "..."`),
 * which the written proof uses for tactics it has no sentence of its own for.
 *
 * A template is Markdown with placeholders, filled in from the proof step (as code):
 * - `{args}`: everything after the tactic's name;
 * - `{1}`, `{2}`, …: the first, second, … argument (`[…]`, `⟨…⟩`, `(…)` count as one);
 * - `{1:type}`, …: the statement (or type) of the hypothesis named by that argument, after the step;
 * - `{goal}`: the main goal before the step, `{goalAfter}`: the main goal after it;
 * - `{new}`: the hypotheses the step introduced (`h : x ∈ A`).
 * A placeholder that can't be filled in becomes `…`.
 */
import type { InteractiveGoal, GameHypothesisBundle } from '../api/rpc_api'

/** The plain text of Lean's tagged code (`CodeWithInfos`). */
export function plainText(t: any): string {
  if (!t) return ''
  if (typeof t === 'string') return t
  if (typeof t.text === 'string') return t.text
  if (Array.isArray(t.append)) return t.append.map(plainText).join('')
  if (Array.isArray(t.tag)) return plainText(t.tag[1])
  return ''
}

/** A tactic's name as a key: `«have»` and `have` are the same tactic. */
export const tacticKey = (name: string) => name.replace(/[«»]/g, '')

const OPEN = '([{⟨'
const CLOSE = ')]}⟩'

/** Split a tactic's arguments at spaces, keeping bracketed groups like `[h₁, h₂]` together. */
export function splitArgs(s: string): string[] {
  const args: string[] = []
  let depth = 0, current = ''
  for (const c of s.trim()) {
    if (OPEN.includes(c)) depth++
    else if (CLOSE.includes(c)) depth = Math.max(0, depth - 1)
    if (depth === 0 && /\s/.test(c)) {
      if (current) args.push(current)
      current = ''
    } else {
      current += c
    }
  }
  if (current) args.push(current)
  return args
}

interface Hyp { name: string, type: string }

function hyps(goal: InteractiveGoal | undefined): Hyp[] {
  if (!goal) return []
  return (goal.hyps as GameHypothesisBundle[]).flatMap(h =>
    h.names.map(name => ({ name, type: plainText(h.type) })))
}

/** Inline code, with enough backticks for code that contains backticks. */
export function code(s: string): string {
  const ticks = s.includes('`') ? '``' : '`'
  return `${ticks}${s.includes('`') ? ' ' + s + ' ' : s}${ticks}`
}

/** The values the placeholders stand for in a step from `before` to `after`. */
export interface StepContext {
  args: string
  before?: InteractiveGoal
  after?: InteractiveGoal
  /** Whether the step closed the last goal. */
  noGoalsAfter: boolean
}

/** Fill in a template's placeholders. `noGoals` is what `{goalAfter}` becomes when no goals are
 * left (e.g. "*no goals*"); placeholders that can't be filled in become `…`. */
export function fillTemplate(template: string, ctx: StepContext, noGoals: string): string {
  const args = splitArgs(ctx.args)
  const value = (key: string): string | undefined => {
    if (key === 'args') return ctx.args ? code(ctx.args) : undefined
    if (key === 'goal') return ctx.before ? code(plainText(ctx.before.type)) : undefined
    if (key === 'goalAfter') {
      if (ctx.after) return code(plainText(ctx.after.type))
      return ctx.noGoalsAfter ? noGoals : undefined
    }
    if (key === 'new') {
      const old = new Set(hyps(ctx.before).map(h => `${h.name} : ${h.type}`))
      const added = hyps(ctx.after).filter(h => !old.has(`${h.name} : ${h.type}`))
      return added.length ? list(added.map(h => code(`${h.name} : ${h.type}`))) : undefined
    }
    const m = key.match(/^(\d+)(:type)?$/)
    if (m) {
      const arg = args[Number(m[1]) - 1]
      if (arg === undefined) return undefined
      if (!m[2]) return code(arg)
      const hyp = [...hyps(ctx.after), ...hyps(ctx.before)].find(h => h.name === arg)
      return hyp ? code(hyp.type) : undefined
    }
    return undefined
  }
  return template.replace(/\{(args|goal|goalAfter|new|\d+(?::type)?)\}/g, (_, key) => value(key) ?? '…')
}

/** `a`, `a and b`, `a, b and c` */
function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('')
  return xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]
}
