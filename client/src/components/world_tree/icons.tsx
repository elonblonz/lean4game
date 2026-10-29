/**
 * @fileOverview The worlds, levels and paths drawn on the world map.
 */
import * as React from 'react'
import cytoscape from 'cytoscape'
import { useTranslation } from 'react-i18next'
import { useAtom } from 'jotai'
import { useGameTranslation } from '../../utils/translation'
import { navigateAcrossWorldsAtom } from '../../store/location-atoms'
import { difficultyAtom } from '../../store/progress-atoms'
import { gameInfoAtom } from '../../store/query-atoms'
import { firstIncompleteLevelAtomFamily, levelCompletedAtomFamily, worldCompletedAtom, worldDependenciesCompletedAtomFamily, worldProgressAtomFamily } from '../../store/world-tree-atoms'
import { blue, darkblue, darkgreen, darkgrey, green, grey, levelIconPosition, lightgreen, lightgrey, lineWidth, MINFONT, r, s, worldIconRadius } from './layout'

/** svg object for a level in the game tree */
export function LevelIcon({ world, level, position }:
  { world: string,
    level: number,
    position: cytoscape.Position,
  }) {
  const { t } = useTranslation()
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [difficulty] = useAtom(difficultyAtom)
  const [levelUnlocked] = useAtom(levelCompletedAtomFamily(`${world}:${level-1}`))
  const [worldUnlocked] = useAtom(worldDependenciesCompletedAtomFamily(world))
  const [worldProgress] = useAtom(worldProgressAtomFamily(world))
  const [completed] = useAtom(levelCompletedAtomFamily(`${world}:${level}`))

  const unlocked = level <= 1 ? worldUnlocked && levelUnlocked : levelUnlocked
  const { t: gT } = useGameTranslation()
  const worldTitle = gT(gameInfo?.worlds?.nodes[world]?.title || world)
  const levelDisabled = (difficulty >= 2 && !(unlocked || completed))
  const [, navigateAcrossWorlds] = useAtom(navigateAcrossWorldsAtom)

  const {x, y} = levelIconPosition(position, level, gameInfo?.worldSize?.[world])

  // Show world intro if it hasn't been read so far
  let targetLevel = level
  if (level <= 1) {
    targetLevel = (worldProgress?.readIntro) ? 1 : 0
  }

  return (
    <a onClick={() => {if (!levelDisabled) navigateAcrossWorlds(world, targetLevel)}}
        {...mapIconProps(`${worldTitle}, ${t("Level")} ${level}` +
            (completed ? ` (${t("completed")})` : !unlocked ? ` (${t("locked")})` : ''),
          levelDisabled, () => navigateAcrossWorlds(world, targetLevel))}
        className={`level${levelDisabled ? ' disabled' : ''}`}>
      <circle style={{fill: completed ? lightgreen : unlocked? blue : lightgrey}} cx={x} cy={y} r={r} />
      <foreignObject className="level-title-wrapper" x={x} y={y}
          width={1.42*r} height={1.42*r} transform={"translate("+ -.71*r +","+ -.71*r +")"}>
        <div>
          <p className="level-title" style={{fontSize: Math.floor(r) + "px"}}>
            {level}
          </p>
        </div>
      </foreignObject>
    </a>
  )

}

/** svg object of one world in the game tree */
export function WorldIcon({world, title, position}:
  { world: string,
    title: string,
    position: cytoscape.Position,
  }) {
  const { t } = useTranslation()
  const { t : gT } = useGameTranslation()
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [difficulty] = useAtom(difficultyAtom)
  const [unlocked] = useAtom(worldDependenciesCompletedAtomFamily(world))
  const [completed] = useAtom(worldCompletedAtom(world))
  const worldDisabled = (difficulty >= 2 && !(unlocked || completed))
  const [firstUncompleted] = useAtom(firstIncompleteLevelAtomFamily(world))
  const [, navigateAcrossWorlds] = useAtom(navigateAcrossWorldsAtom)

  const R = worldIconRadius(gameInfo?.worldSize?.[world])
  let fontSize = Math.floor(R/4)

  // Offset for the labels for small worlds
  let labelOffset = R + 2.5 * r

  return <a
      onClick={() => {if (!worldDisabled) navigateAcrossWorlds(world, firstUncompleted)}}
      {...mapIconProps((title ? gT(title) : world) +
          (completed ? ` (${t("completed")})` : !unlocked ? ` (${t("locked")})` : ''),
        worldDisabled, () => navigateAcrossWorlds(world, firstUncompleted))}
      className={`world${worldDisabled ? ' disabled' : ''}`}>
    <circle className="world-circle" cx={s*position.x} cy={s*position.y} r={R}
        style={{fill: completed ? green : unlocked ? blue : grey}}/>
    { false ? // fontSize >= MINFONT ?
      // NOTE: This code would display the world names inside the bubble, but currently
      //       it isn't used.
      // Label for large worlds
      <foreignObject className="world-title-wrapper" x={s*position.x} y={s*position.y}
          width={1.42*R} height={1.42*R} transform={"translate("+ -.71*R +","+ -.71*R +")"}>
        <div className={unlocked && !completed ? "playable-world" : ''}>
          <p className="world-title" style={{fontSize: fontSize + "px"}}>
            {title ? gT(title) : world}
          </p>
        </div>
      </foreignObject>
      :
      // Label for small worlds
      <foreignObject x={s*position.x - 75} y={s*position.y + labelOffset}
          width='150px' height='2em' style={{overflow: 'visible'}}
          >
        {/* `playable-world`: the map scrolls to the first such world (see `WorldTreePanel`). */}
        <div className={`world-label${unlocked && !completed ? ' playable-world' : ''}`} style={{backgroundColor: completed ? darkgreen : unlocked ? darkblue : darkgrey}}>
          <p className='world-title' style={{fontSize: MINFONT + "px"}}>
            {title ? gT(title) : world}
          </p>
        </div>
      </foreignObject>}
  </a>
}

/** svg object for a connection path between worlds in the game tree */
export function WorldPath({source, target, sourceWorld} : {source: {position: cytoscape.Position}, target: {position: cytoscape.Position}, sourceWorld: string}) {
  const [ sourceCompleted ] = useAtom(worldCompletedAtom(sourceWorld))
  return <line x1={s*source.position.x} y1={s*source.position.y}
          x2={s*target.position.x} y2={s*target.position.y}
          style={{stroke: sourceCompleted ? green : grey}} strokeWidth={lineWidth} />
}

/** Props that make a map icon usable with the keyboard: focusable unless disabled, opened with
 * Enter or Space, and named for screen readers. The arrow keys move between the icons (see
 * `WorldTreePanel`). */
function mapIconProps(label: string, disabled: boolean, open: () => void) {
  return {
    role: "button",
    tabIndex: disabled ? -1 : 0,
    "aria-label": label,
    "aria-disabled": disabled,
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); if (!disabled) open() }
    },
  }
}

