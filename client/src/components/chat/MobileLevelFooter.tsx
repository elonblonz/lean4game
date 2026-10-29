import * as React from 'react'
import { useEffect, useRef } from 'react'
import { useAtom } from 'jotai'
import { Markdown } from '../markdown'
import { useGameTranslation } from '../../utils/translation'
import { isLastLevelAtom, levelInfoAtom } from '../../store/query-atoms'
import { proofAtom } from '../../store/proof-atoms'
import { MoreHelpButton } from '../hints'
import { NextLevelButton } from './ChatPanel'

/**
 * On mobile there is no chat panel: the hints are shown inside the proof steps, and this
 * shows what the chat panel would show below them: the "Show more help!" button and,
 * once the level is solved, the conclusion and the Next button.
 */
export function MobileLevelFooter() {
  const { t: gT } = useGameTranslation()
  const [{ data: levelInfo }] = useAtom(levelInfoAtom)
  const [proof] = useAtom(proofAtom)
  const [lastLevel] = useAtom(isLastLevelAtom)

  const focusRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (proof?.completed) {
      focusRef.current?.focus()
    }
  }, [!!proof?.completed])

  if (!proof) return null

  return <div className="mobile-level-footer">
    {/* The proof itself already ends with the game's "level completed" message. */}
    {proof.completed && <>
      {levelInfo?.conclusion?.trim() &&
        <div className="message information recent">
          <Markdown>{gT(levelInfo?.conclusion ?? "")}</Markdown>
        </div>
      }
    </>}
    <div className="button-row mobile">
      {proof.completed && <NextLevelButton ref={focusRef} lastLevel={lastLevel} />}
      <MoreHelpButton selected={null} />
    </div>
  </div>
}
