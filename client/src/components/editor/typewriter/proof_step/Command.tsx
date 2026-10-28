import { useTranslation } from "react-i18next"
import { GameHint, ProofState } from "../../../../api/rpc_api"
import React from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faDeleteLeft } from "@fortawesome/free-solid-svg-icons"
import { filterHints } from "../../../hints"
import { useAtom } from "jotai"
import { editor } from 'monaco-editor'
import { deleteProofFromStepAtom, lastProofStepHasErrorsAtom } from "../../../../store/editor-atoms"
import { Button } from "../../../button"

/** The display of a single entered lean command */
export function Command({ proof, i }: { proof: ProofState, i: number }) {
  let {t} = useTranslation()
  const [lastProofStepHasErrors,] = useAtom(lastProofStepHasErrorsAtom)
  const [, deleteProofFromStep] = useAtom(deleteProofFromStepAtom)

  // The first step will always have an empty command
  if (!proof.steps[i]?.command) { return <></> }

  // Only the last command can be the failed one; the commands before it were accepted.
  if (lastProofStepHasErrors && i == proof.steps.length - 1) {
    // If the last step has errors, we display the command in a different style
    // indicating that it will be removed on the next try.
    return <div className="failed-command">
      <i>{t("Failed command")}</i>: {proof.steps[i].command}
    </div>
  } else {
    return <div className="command">
      <div className="command-text">{proof.steps[i].command}</div>
      <Button className="undo-button btn btn-inverted" title={t("Retry proof from here")} onClick={ev => {
        deleteProofFromStep(i)
        ev.stopPropagation()
      }}>
        <FontAwesomeIcon icon={faDeleteLeft} />&nbsp;{t("Undo")}
      </Button>
    </div>
  }
}
