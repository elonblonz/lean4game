import { useTranslation } from "react-i18next"
import { useGameTranslation } from "../../utils/translation"
import { useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import { levelIdAtom, worldIdAtom } from "../../store/location-atoms"
import { mobileAtom } from "../../store/preferences-atoms"
import { gameInfoAtom, isLastLevelAtom, levelInfoAtom } from "../../store/query-atoms"
import { CircularProgress } from "@mui/material"
import { LevelAppBar } from "../app_bar"
import React from "react"
import { ExercisePanel } from "./ExercisePanel"
import { InventoryPanel } from "../inventory/inventory_panel"
import { ChatPanel } from "../chat/ChatPanel"
import Split from 'react-split'
import { useLeanConnection } from "./useLeanConnection"
import { useLevelGameLogic } from "./useLevelGameLogic"

/**
 * A level with a proof to play: the chat (hints), the exercise (editor or typewriter) and the
 * inventory. On mobile, only one of the exercise and the inventory is shown at a time.
 *
 * The level's logic is in two hooks: `useLeanConnection` (editor and Lean) and
 * `useLevelGameLogic` (what the game does with the proof).
 */
export function PlayableLevel() {
  let { t } = useTranslation()
  const { t : gT } = useGameTranslation()
  const codeviewRef = useRef<HTMLDivElement>(null)
  const [worldId] = useAtom(worldIdAtom)
  const [levelId] = useAtom(levelIdAtom)
  const [mobile] = useAtom(mobileAtom)
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [{ data: levelInfo, isLoading: levelInfoIsLoading }] = useAtom(levelInfoAtom)
  const [lastLevel] = useAtom(isLastLevelAtom)

  useLeanConnection(codeviewRef)
  useLevelGameLogic()

  // Only for mobile layout
  const [pageNumber, setPageNumber] = useState(0)
  // Show the proof again when another level is opened
  useEffect(() => { setPageNumber(0) }, [worldId, levelId])

  const levelTitle = (mobile ? "" : t("Level")) + ` ${levelId} / ${worldId ? gameInfo?.worldSize?.[worldId] ?? "" : ""}` +
    (levelInfo?.title ? ` : ${gT(levelInfo.title)}` : "")

  return <>
    { levelInfoIsLoading && <div className="app-content loading"><CircularProgress /></div>}
    <LevelAppBar
      pageNumber={pageNumber} setPageNumber={setPageNumber}
      isLoading={levelInfoIsLoading}
      levelTitle={levelTitle}
      />
    {mobile?
      <div className={`app-content level-mobile ${levelInfoIsLoading ? 'hidden' : ''}`}>
        <div className="mobile-page-switch" role="tablist">
          <button role="tab" aria-selected={pageNumber == 0} className={pageNumber == 0 ? "active" : ""}
            onClick={() => setPageNumber(0)}>{t("Proof")}</button>
          <button role="tab" aria-selected={pageNumber == 1} className={pageNumber == 1 ? "active" : ""}
            onClick={() => setPageNumber(1)}>{t("Inventory")}</button>
        </div>
        <ExercisePanel codeviewRef={codeviewRef} visible={pageNumber == 0} />
        <InventoryPanel visible={pageNumber == 1} />
      </div>
    :
      <Split minSize={0} snapOffset={200} sizes={[25, 50, 25]} className={`app-content level ${levelInfoIsLoading ? 'hidden' : ''}`}>
        <ChatPanel lastLevel={lastLevel}/>
        <ExercisePanel codeviewRef={codeviewRef} />
        <InventoryPanel />
      </Split>
    }
  </>
}
