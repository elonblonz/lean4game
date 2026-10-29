/**
 * @fileOverview Define the menu displayed with the tree of worlds on the welcome page
*/
import * as React from 'react'
import '../css/world_tree.css'
import { useAtom } from 'jotai'
import { gameIdAtom } from '../store/location-atoms'
import { gameInfoAtom } from '../store/query-atoms'
import { mobileAtom } from '../store/preferences-atoms'
import { computeWorldLayout, ds, dsMobile, s, WorldLayout, worldTreePadding } from './world_tree/layout'
import { LevelIcon, WorldIcon, WorldPath } from './world_tree/icons'
import { WorldSelectionMenu } from './world_tree/menu'
import { useTranslation } from 'react-i18next'
import { moveFocusWithArrows } from '../utils/a11y'

/** The world map: the worlds, their levels, and the menu with the rules setting */
export function WorldTreePanel() {
  const { t } = useTranslation()
  const [gameId] = useAtom(gameIdAtom)
  const [mobile] = useAtom(mobileAtom)
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)

  const worlds = gameInfo?.worlds
  const worldSize = gameInfo?.worldSize

  const {nodes, bounds}: WorldLayout = React.useMemo(() => worlds ? computeWorldLayout(worlds) : {nodes: {}}, [worlds])

  // scroll to playable world
  React.useEffect(() => {
    let elems = Array.from(document.getElementsByClassName("playable-world"))
    if (elems.length) {
      // it seems that the last element is the one furthest up in the tree
      // TODO: I think they appear in random order. Check their position and select the lowest one
      // of these positions to scroll to.
      let elem = elems[0]
      console.debug(`scrolling to ${elem.textContent}`)
      // Scroll only the tree: `scrollIntoView` would also scroll the surrounding panel
      // sideways when the tree is wider than the screen.
      const tree = elem.closest(".world-tree")
      if (tree) {
        const e = elem.getBoundingClientRect()
        const t = tree.getBoundingClientRect()
        tree.scrollTo({
          left: tree.scrollLeft + e.left - t.left - (t.width - e.width) / 2,
          top: tree.scrollTop + e.top - t.top - (t.height - e.height) / 2,
        })
      }
    }
  }, [worlds, worldSize])

  let svgElements: React.ReactNode[] = []
  if (worlds && worldSize) {

    // draw all connecting paths
    for (let i in worlds.edges) {
      const edge = worlds.edges[i]
      svgElements.push(
        <WorldPath key={`path_${edge[0]}-->${edge[1]}`}
          sourceWorld={edge[0]}
          source={nodes[edge[0]]} target={nodes[edge[1]]}/>
      )
    }

    // draw the worlds and levels
    for (let worldId in nodes) {
      let position: cytoscape.Position = nodes[worldId].position
      svgElements.push(
        <WorldIcon world={worldId}
          title={nodes[worldId].data.title || worldId}
          position={position}
          key={`${gameId}-${worldId}`}
        />
      )

      for (let i = 1; i <= worldSize[worldId]; i++) {
        svgElements.push(
          <LevelIcon
            world={worldId}
            level={i}
            position={position}
            key={`${gameId}-${worldId}-${i}`}
          />
        )
      }
    }
  }

  const padding = worldTreePadding()

  let dx = bounds ? s*(bounds.x2 - bounds.x1) + 2*padding : 100

  return (
    <div className="panel">
      <WorldSelectionMenu />
      <div className={`world-tree${mobile ? ' mobile' : ''}`}>
        {/* Tab or the arrow keys move between the worlds and levels, Enter opens one. */}
        <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink"
            role="group" aria-label={t("World map")}
            onKeyDown={ev => moveFocusWithArrows(ev,
              Array.from(ev.currentTarget.querySelectorAll<HTMLElement>('[role="button"][tabindex="0"]')))}
            width={bounds ? `${(mobile ? dsMobile : ds) * dx}` : ''}
            viewBox={bounds ? `${s*bounds.x1 - padding} ${s*bounds.y1 - padding} ${dx} ${s*(bounds.y2 - bounds.y1) + 2 * padding}` : ''}
            className="world-selection" >
          {svgElements}
        </svg>
      </div>
    </div>
  )
}
