import React from "react"
import { useTranslation } from "react-i18next"
import { GameEditor } from "../editor/GameEditor"

/** The center-piece of a playable level */
export function ExercisePanel({codeviewRef, visible=true, id}: {codeviewRef: React.RefObject<HTMLDivElement>, visible?: boolean, id?: string}) {
  const { t } = useTranslation()
  return <div className={`exercise-panel exercise ${visible ? '' : 'hidden'}`} id={id} role="main" aria-label={t("Proof")}>
    <GameEditor codeviewRef={codeviewRef} />
  </div>
}
