/**
 * @fileOverview Pure functions on the proof state Lean sends (`ProofState`): which step failed,
 * which hints to show. Used by the proof atoms and by the components showing hints.
 */
import { DiagnosticSeverity } from 'vscode-languageserver-types'
import { GameHint, InteractiveGoalsWithHints, ProofState } from '../api/rpc_api'

/** Whether the proof's last step has errors: it is then the failed command, which is replaced
 * by the next one, so its hints are not shown and help applies to the step before it. */
export function lastStepHasErrors(proof: ProofState | null | undefined): boolean {
  if (!proof?.steps.length) return false
  const diags = [...proof.steps[proof.steps.length - 1].diags, ...proof.diagnostics]
  return diags.some(d => d.severity == DiagnosticSeverity.Error)
}

/** Whether step `i` is the proof's failed last command. */
export function isLastStepWithErrors(proof: ProofState | null | undefined, i: number): boolean {
  return !!proof && i == proof.steps.length - 1 && lastStepHasErrors(proof)
}

/** The last step that Lean accepted, i.e. the one whose goals and hints are the current ones.
 * Step 0 is the start of the proof. */
export function lastValidStep(proof: ProofState | null | undefined): number {
  return proof?.steps.length ? proof.steps.length - (lastStepHasErrors(proof) ? 2 : 1) : 0
}

/** Filter hints to not show consecutive identical hints twice.
 * Hidden hints are not filtered.
 */
export function filterHints(hints: GameHint[] | undefined, prevHints: GameHint[] | undefined): GameHint[] {
  if (!hints) {
    return []
  } else if (!prevHints) {
    return hints
  } else {
    return hints.filter((hint) => hint.hidden ||
      (prevHints.find(x => (x.text == hint.text && x.hidden == hint.hidden)) === undefined)
    )
  }
}

/** The hints of proof step `i`, without the ones already shown at the step before. */
export function stepHints(proof: ProofState, i: number): GameHint[] {
  return filterHints(proof.steps[i]?.goals[0]?.hints, proof.steps[i - 1]?.goals[0]?.hints)
}

/** Whether a proof step has hidden hints (shown with "Show more help!"). */
export function hasHiddenHints(step?: InteractiveGoalsWithHints): boolean {
  return step !== undefined && (step.goals[0]?.hints.some((hint) => hint.hidden) ?? false)
}

/** How many hidden hints a proof step has. */
export function hiddenHintCount(step?: InteractiveGoalsWithHints): number {
  return step?.goals[0]?.hints.filter(hint => hint.hidden).length ?? 0
}

/** The hints to show: all open ones, and the first `revealed` hidden ones (the "hint ladder":
 * hidden hints are revealed one at a time, in the order the game defines them). */
export function visibleHints(hints: GameHint[], revealed: number): GameHint[] {
  let k = 0
  return hints.filter(hint => !hint.hidden || k++ < revealed)
}
