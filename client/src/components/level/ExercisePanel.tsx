import React from "react"
import { useTranslation } from "react-i18next"
import { GameEditor } from "../editor/GameEditor"
import { LevelNotes } from "../learning/LevelNotes"

/** The center-piece of a playable level: the editor (or typewriter), and below it the
 * player's notes. */
export function ExercisePanel({codeviewRef, visible=true, id}: {codeviewRef: React.RefObject<HTMLDivElement>, visible?: boolean, id?: string}) {
  const { t } = useTranslation()
  return <div className={`exercise-panel exercise ${visible ? '' : 'hidden'}`} id={id} role="main" aria-label={t("Proof")}>
    <div className="exercise-main">
      <GameEditor codeviewRef={codeviewRef} />
    </div>
    <div className="learning-panel">
      <LevelNotes />
    </div>
  </div>
}
