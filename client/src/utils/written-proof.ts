/**
 * @fileOverview The player's tactic proof translated line by line into English, using the
 * "reads as" templates of the game's tactic docs (`TacticDoc intro reads "..."`).
 *
 * A template is Markdown with placeholders, filled in from the proof step (as code):
 * - `{args}`: everything after the tactic's name;
 * - `{1}`, `{2}`, …: the first, second, … argument (`[…]`, `⟨…⟩`, `(…)` count as one);
 * - `{1:type}`, …: the statement (or type) of the hypothesis named by that argument, after the step;
 * - `{goal}`: the main goal before the step, `{goalAfter}`: the main goal after it;
 * - `{new}`: the hypotheses the step introduced (`h : x ∈ A`).
 * A placeholder that can't be filled in becomes `…`.
 */
import type { ProofState, InteractiveGoal, GameHypothesisBundle } from '../api/rpc_api'
import { lastStepHasErrors } from './proof'

/** One line of the written proof. */
export interface WrittenLine {
  /** The proof step (index into `ProofState.steps`) this line describes. */
  step: number
  /** The command as the player wrote it, without indentation and focusing dots. */
  command: string
  /** The tactic's name (the command's first word). */
  tactic: string
  /** How deep the line is nested (focusing dots `·` and indentation). */
  depth: number
  /** The line in words (Markdown), or `null` if the tactic has no template. */
  text: string | null
}

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

/** A command's nesting depth, tactic name and arguments: `  · rw [h] at g` gives
 * depth 2, `rw` and `[h] at g`. */
export function parseCommand(command: string): { depth: number, tactic: string, args: string, command: string } {
  const indent = command.match(/^\s*/)![0].replace(/\t/g, '  ').length
  let rest = command.trim()
  let dots = 0
  while (/^[·.]\s/.test(rest) || rest === '·' || rest === '.') {
    dots++
    rest = rest.slice(1).trim()
  }
  const match = rest.match(/^(\S+)\s*([\s\S]*)$/)
  return {
    depth: Math.max(dots, Math.floor(indent / 2)),
    tactic: match?.[1] ?? '',
    args: match?.[2]?.trim() ?? '',
    command: rest,
  }
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

/**
 * The written proof: one line per command Lean accepted (not the failed last one), in words if
 * the tactic has a template in `readsAs` (keyed by `tacticKey`), otherwise `text` is `null`.
 * Templates are translated with `translate` before filling them in.
 */
export function writtenProof(proof: ProofState | null | undefined, readsAs: Map<string, string>,
    noGoals: string, translate: (s: string) => string = s => s): WrittenLine[] {
  if (!proof?.steps.length) return []
  const end = proof.steps.length - (lastStepHasErrors(proof) ? 1 : 0)
  const lines: WrittenLine[] = []
  for (let i = 1; i < end; i++) {
    const step = proof.steps[i]
    if (!step.command?.trim()) continue
    const { depth, tactic, args, command } = parseCommand(step.command)
    const template = readsAs.get(tacticKey(tactic))
    const text = template ? fillTemplate(translate(template), {
      args,
      before: proof.steps[i - 1]?.goals[0]?.goal,
      after: step.goals[0]?.goal,
      noGoalsAfter: step.goals.length === 0,
    }, noGoals) : null
    lines.push({ step: i, command, tactic, depth, text })
  }
  return lines
}
