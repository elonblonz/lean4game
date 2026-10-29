import * as React from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { CircularProgress } from '@mui/material'
import { useGameTranslation } from '../../utils/translation'
import { navigateAcrossWorldsAtom, worldIdAtom } from '../../store/location-atoms'
import { gameInfoAtom } from '../../store/query-atoms'
import { progressAtom, updateLevelProgressAtom } from '../../store/progress-atoms'
import { popupAtom } from '../../store/popup-atoms'
import { replayWithoutHintsAtom, worldLevelsAtomFamily } from '../../store/learning-atoms'
import { InventoryTab } from '../../store/inventory-atoms'
import { LevelInfo } from '../../api/game-data'
import { Button } from '../button'
import { NotesField } from './LevelNotes'

/** A technique a world introduces, and the level that introduces it. */
interface Technique {
  type: InventoryTab
  name: string
  displayName: string
  level: number
}

const TYPE_TITLE: Record<InventoryTab, string> = {
  [InventoryTab.tactic]: "Tactics",
  [InventoryTab.theorem]: "Theorems",
  [InventoryTab.definition]: "Definitions",
}

/** The tactics, theorems and definitions the levels introduce (`NewTactic` etc., and the
 * theorems the levels prove), in the order of the levels. */
export function worldTechniques(levels: LevelInfo[]): Technique[] {
  const seen = new Set<string>()
  const techniques: Technique[] = []
  const add = (type: InventoryTab, name: string, displayName: string, level: number) => {
    if (seen.has(`${type}:${name}`)) return
    seen.add(`${type}:${name}`)
    techniques.push({ type, name, displayName, level })
  }
  levels.forEach((info, i) => {
    const level = i + 1
    for (const [type, tiles] of [[InventoryTab.tactic, info.tactics], [InventoryTab.theorem, info.lemmas],
        [InventoryTab.definition, info.definitions]] as const) {
      for (const tile of tiles ?? []) {
        if (tile.new && !tile.hidden) add(type, tile.name, tile.displayName, level)
      }
    }
    if (info.statementName && info.statementName !== "[anonymous]") {
      add(InventoryTab.theorem, info.statementName, info.displayName ?? info.statementName, level)
    }
  })
  return techniques
}

/**
 * The world recap, shown when a world is completed (and from the world's last level and its
 * introduction): the techniques the world introduced with links to their levels, the levels
 * with a "replay without hints" button each, and the player's notes on them.
 */
export function WorldRecapPopup() {
  const { t } = useTranslation()
  const { t: gT } = useGameTranslation()
  const [worldId] = useAtom(worldIdAtom)
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [{ data: levels, isLoading }] = useAtom(worldLevelsAtomFamily(worldId ?? ""))
  const [progress] = useAtom(progressAtom)
  const [, updateLevelProgress] = useAtom(updateLevelProgressAtom)
  const [, navigateAcrossWorlds] = useAtom(navigateAcrossWorldsAtom)
  const [, replayWithoutHints] = useAtom(replayWithoutHintsAtom)
  const [, setPopup] = useAtom(popupAtom)

  if (!worldId) return null
  const worldTitle = gT(gameInfo?.worlds?.nodes[worldId]?.title || worldId)
  const worldProgress = progress?.data[worldId]
  const techniques = worldTechniques(levels ?? [])
  const levelTitle = (level: number) => {
    const title = levels?.[level - 1]?.title
    return `${t("Level")} ${level}` + (title ? `: ${gT(title)}` : '')
  }
  const goTo = (level: number) => (ev: React.MouseEvent) => {
    ev.preventDefault()
    setPopup(null)
    navigateAcrossWorlds(worldId, level)
  }

  return <div className="world-recap">
    <h2>{t("World recap: {{world}}", { world: worldTitle })}</h2>
    {isLoading && <div className="center"><CircularProgress /></div>}

    {techniques.length > 0 && <>
      <h3>{t("What you learned")}</h3>
      {Object.values(InventoryTab).map(type => {
        const ofType = techniques.filter(it => it.type === type)
        if (!ofType.length) return null
        return <div key={type} className="recap-techniques">
          <h4>{t(TYPE_TITLE[type])}</h4>
          <ul>
            {ofType.map(it => <li key={it.name}>
              <code>{it.displayName}</code> <a href="#" onClick={goTo(it.level)}>{levelTitle(it.level)}</a>
            </li>)}
          </ul>
        </div>
      })}
    </>}

    {levels && <>
      <h3>{t("Levels")}</h3>
      <ol className="recap-levels">
        {levels.map((_, i) => {
          const level = i + 1
          const levelProgress = worldProgress?.[level]
          return <li key={level} className="recap-level">
            <div className="recap-level-head">
              <a href="#" onClick={goTo(level)}>{levelTitle(level)}</a>
              {levelProgress?.completed && <span className="recap-done" role="img" aria-label={t("Completed")} title={t("Completed")}>✓</span>}
              <Button className="recap-replay" inverted={true}
                  title={t("Start the level again, without hints")}
                  onClick={() => { setPopup(null); replayWithoutHints(worldId, level) }}>
                ↺&nbsp;{t("Replay without hints")}
              </Button>
            </div>
            <NotesField value={levelProgress?.notes ?? ""} label={t("Notes on {{level}}", { level: levelTitle(level) })}
              onChange={notes => updateLevelProgress(worldId, level, lp => ({ ...lp, notes: notes || undefined }))} />
          </li>
        })}
      </ol>
    </>}
  </div>
}
