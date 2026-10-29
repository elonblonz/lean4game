import * as React from 'react';
import { Markdown } from './markdown';
import { Button } from "./button";
import { useGameTranslation } from "../utils/translation";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { helpAtom, noHintsAtom } from "../store/chat-atoms";
import { proofAtom } from "../store/proof-atoms";
import { GameHint } from '../api/rpc_api';
import { hiddenHintCount, lastValidStep } from '../utils/proof';

/** Plug-in the variable names in a hint. We do this client-side to prepare
 * for i18n in the future. i.e. one should be able translate the `rawText`
 * and have the variables substituted just before displaying.
 */
function useHintText(hint: GameHint): string {
  let { t: gT } = useGameTranslation()
  if (hint.rawText) {
    // Replace the variable names used in the hint with the ones used by the player
    // variable names are marked like `«{g}»` inside the text.
    return gT(hint.rawText).replaceAll(/«\{(.*?)\}»/g, ((_: string, v: string) =>
      // `hint.varNames` contains tuples `[oldName, newName]`
      (hint.varNames.find(x => x[0] == v))?.[1] ?? ""))
  } else {
    // hints created in the frontend do not have a `rawText`
    // TODO: `hint.text` could be removed in theory.
    return gT(hint.text)
  }
}

export function Hint({hint, step, selected, toggleSelection, lastLevel} : {hint: GameHint, step: number, selected?: number, toggleSelection: any, lastLevel?: boolean}) {
  return <div className={`message information step-${step}` + (step == selected ? ' selected' : '') + (lastLevel ? ' recent' : '')} onClick={toggleSelection}>
    <Markdown>{useHintText(hint)}</Markdown>
  </div>
}

/** A hidden hint the player asked for. `rung` and `rungs` say which of the step's hidden hints
 * it is (they are revealed one at a time), shown if there are several. */
export function HiddenHint({hint, step, selected, toggleSelection, lastLevel, rung, rungs} : {hint: GameHint, step: number, selected?: number, toggleSelection: any, lastLevel?: boolean, rung?: number, rungs?: number}) {
  const { t } = useTranslation()
  return <div className={`message warning hidden-hint step-${step}` + (step == selected ? ' selected' : '') + (lastLevel ? ' recent' : '')} onClick={toggleSelection}>
    {rung !== undefined && rungs !== undefined && rungs > 1 &&
      <div className="hint-rung">{t("Hint {{n}} of {{total}}", {n: rung, total: rungs})}</div>}
    <Markdown>{useHintText(hint)}</Markdown>
  </div>
}

/** The hints of a proof step: the open ones, and the first `revealed` hidden ones. */
export function Hints({hints, revealed, step, selected, toggleSelection, lastLevel} : {hints: GameHint[], revealed: number, step: number, selected?: number, toggleSelection: any, lastLevel?: boolean}) {
  if (!hints) {return <></>}
  const openHints = hints.filter(hint => !hint.hidden)
  const hiddenHints = hints.filter(hint => hint.hidden)

  // TODO: Should not use index as key.
  return <>
    {openHints.map((hint, j) => <Hint key={`hint-${step}-${j}`} hint={hint} step={step} selected={selected} toggleSelection={toggleSelection} lastLevel={lastLevel} />)}
    {hiddenHints.slice(0, revealed).map((hint, j) => <HiddenHint key={`hidden-hint-${step}-${j}`} hint={hint} step={step} selected={selected} toggleSelection={toggleSelection} lastLevel={lastLevel} rung={j + 1} rungs={hiddenHints.length} />)}
  </>
}

export function DeletedHint({hint} : {hint: GameHint}) {
  return <div className="message information deleted-hint">
    <Markdown>{useHintText(hint)}</Markdown>
  </div>
}

export function DeletedHints({hints} : {hints: GameHint[]}) {

  const openHints = hints.filter(hint => !hint.hidden)
  const hiddenHints = hints.filter(hint => hint.hidden)

  // TODO: Should not use index as key.
  return <>
    {openHints.map((hint, i) => <DeletedHint key={`deleted-hint-${i}`} hint={hint} />)}
    {hiddenHints.map((hint, i) => <DeletedHint key={`deleted-hidden-hint-${i}`} hint={hint}/>)}
  </>
}

/** Reveals the current step's hidden hints one at a time: "Show more help!" for the first,
 * then "Next hint" until all are shown. */
export function MoreHelpButton({selected=null} : {selected: number | null}) {

  const { t } = useTranslation()
  const [help, setHelp] = useAtom(helpAtom)
  const [noHints] = useAtom(noHintsAtom)

  const [proof] = useAtom(proofAtom)

  // If the last step has errors, the hidden hints are the ones of the step before it.
  let k = proof?.steps.length ? (selected ?? lastValidStep(proof)) : 0
  const total = hiddenHintCount(proof?.steps[k])
  const revealed = Math.min(help.get(k) ?? 0, total)

  const revealNextHint = () => {
    if (!(proof?.steps.length)) {return}
    // state must not be mutated, therefore we need to clone the map
    setHelp(new Map(help).set(k, revealed + 1))
  }

  if (noHints || revealed >= total) return null
  return <Button onClick={revealNextHint}
      title={total > 1 ? t("Hint {{n}} of {{total}}", {n: revealed + 1, total}) : undefined}>
    {revealed == 0 ? t("Show more help!") : t("Next hint ({{n}} of {{total}})", {n: revealed + 1, total})}
  </Button>
}
