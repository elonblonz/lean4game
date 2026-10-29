/**
 * @fileOverview The game's view of the proof: the player's code (saved in the progress), the
 * proof state Lean returned for it, and the actions on it (submit a command, undo steps).
 *
 * The connection to Lean itself is in `lean-atoms.ts`.
 */
import { atom } from "jotai";
import { levelProgressAtom, progressAtom } from "./progress-atoms";
import { levelInfoAtom } from "./query-atoms";
import { modelAtom, proofQueryAtom } from './lean-atoms';
import { clearTypewriterAtom } from './typewriter-atoms';
import { deletedChatAtom, helpAtom, selectedStepAtom } from './chat-atoms';
import { lastStepHasErrors, lastValidStep, stepHints, visibleHints } from '../utils/proof';

/** The code of the current level as stored in local storage.
 *
 * The setter must not be used directly, expect inside the
 * listener which listens to changes of the editor's content.
 * This is because the editor won't update leading to inconsistent state.
 *
 * Instead, use `codeAtom` to set the editor's content and the code
 * in storage.
*/
export const codeStorageAtom = atom(
  get => {
    const levelProgress = get(levelProgressAtom)
    return levelProgress?.code
  },
  (get, set, val: string) => {
    const levelProgress = get(levelProgressAtom)
    if (levelProgress == null) return
    set(levelProgressAtom, { ...levelProgress, code: val })
  }
)

/**
 * The code of the current level as stored in local storage.
 *
 * Can be used to manually update the editor's content which
 * in turn keeps the code in local storage up to date.
*/
export const codeAtom = atom(
  get => get(codeStorageAtom),
  (get, set, val: string) => {
    const model = get(modelAtom)
    model?.setValue(val)
  }
)

/**
 * The proof consists of multiple steps that are processed one after the other.
 * In particular multi-line terms like `match`-statements will not be supported.
 *
 * Note that the first step will always have "" as command
 */
export const proofAtom = atom(get => get(proofQueryAtom).data ?? undefined)

/** The proof state for the current text, or `undefined` while that is still being checked
 * (when `proofAtom` may still show the previous version's). */
export const currentProofAtom = atom(get => {
  const query = get(proofQueryAtom)
  return query.isPlaceholderData ? undefined : query.data ?? undefined
})

/** Whether the current text has not been checked yet. */
export const proofPendingAtom = atom(get => get(currentProofAtom) === undefined)

/** Whether the proof's last command failed (see `lastStepHasErrors`). */
export const lastProofStepHasErrorsAtom = atom(get => lastStepHasErrors(get(proofAtom)))

/** The proof's last command, if it failed. */
export const lastProofStepErrorCommandAtom = atom(get => {
  const proof = get(proofAtom)
  if (!proof?.steps.length || !get(lastProofStepHasErrorsAtom)) return null
  return proof.steps[proof.steps.length - 1].command
})

/** The last step Lean accepted: its goals and hints are the current ones, and "Show more help!"
 * applies to it. */
export const lastValidStepAtom = atom(get => lastValidStep(get(proofAtom)))

/** Appends a new line of code at the end of the current code.
 *
 * If the last command failed, it is replaced instead: otherwise Lean's error recovery
 * counts the failed command as having closed the goal, and the new command would then
 * fail with "no goals".
*/
export const appendCodeLineAtom = atom(null, (get, set, line: string) => {
  const code = get(codeAtom)

  let lines = (code?.trimEnd() ?? '').split('\n')
  const failedCommand = get(lastProofStepErrorCommandAtom)
  if (failedCommand != null && lines[lines.length - 1].trim() == failedCommand.trim()) {
    lines.pop()
  }
  const oldCode = lines.join('\n').trimEnd()
  const newCode = oldCode.length > 0 ? `${oldCode}\n${line}\n` : `${line}\n`
  set(codeAtom, newCode)
})

/** Delete the proof from step `step` on. Step 0 is the start of the proof (before any
 * command), and step `i` is the result of the code's line `i - 1`. */
export const deleteProofFromStepAtom = atom(null, (get, set, step: number) => {
  const code = get(codeAtom)
  if (code == undefined) return

  set(selectedStepAtom, undefined)
  set(clearTypewriterAtom)

  // Show the hints of the deleted steps as deleted hints.
  const help = get(helpAtom)
  const proof = get(proofAtom)
  if (proof) {
    const newDeletedChat = proof.steps.slice(step).flatMap((s, j) =>
      visibleHints(stepHints(proof, step + j), help.get(step + j) ?? 0)
    )
    set(deletedChatAtom, newDeletedChat)
  }

  // Forget which hidden hints were shown for the deleted steps.
  set(helpAtom, new Map(Array.from(help).filter(([i]) => i < step)))

  set(codeAtom, code.split("\n").slice(0, Math.max(0, step - 1)).join("\n"))
})

/** If a level has a template, the user is forced to use editor mode */
export const lockEditorModeAtom = atom(get => {
  const { data: levelInfo } = get(levelInfoAtom)
  return levelInfo?.template != null
})

/** Whether the current game is in typewriter mode */
export const typewriterModeAtom = atom(
  get => {
    // force editor mode
    const lockEditorMode = get(lockEditorModeAtom)
    if (lockEditorMode) return false

    // read setting from local storage
    const progress = get(progressAtom)
    return progress?.typewriterMode ?? true
  },
  (get, set, val: boolean | null) => {
    const progress = get(progressAtom)
    if (!progress) return
    const valMod = (val === null) ? undefined : val
    set(progressAtom, { ...progress, typewriterMode: valMod })
  }
)
