import React from "react"
import { InventoryItem } from "./inventory_item"
import { currentInventoryTilesAtom, inventoryCurrentTabRecentTilesAtom, InventoryTab } from "../../store/inventory-atoms"
import { useAtom } from "jotai"
import { gameInfoAtom } from "../../store/query-atoms"
import { worldOrder } from "../../utils/world-order"
import { InventoryTile } from "../../api/game-data"

/** The items of the current inventory tab and subtab.
 *
 * Items are unlocked if the player has unlocked them (saved in the progress), or if the
 * server says they should be given the dependency graph (see `currentInventoryTilesAtom`).
 */
export function InventoryList({docType, enableAll=false} : {
  docType: InventoryTab,
  enableAll?: boolean,
}) {
  const [currentTiles] = useAtom(currentInventoryTilesAtom)
  // Item(s) proved in the preceding level
  const [recentTiles] = useAtom(inventoryCurrentTabRecentTilesAtom)
  const recentNames = recentTiles.map(it => it.name)
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const worlds = worldOrder(gameInfo?.worlds)

  // Theorems: `available > disabled > locked`, each in the order they come in the game (the
  // world and level that introduce them), so the newest are at the end. Others: alphabetically.
  const learnt = (x: InventoryTile) => {
    const w = x.world ? worlds.indexOf(x.world) : -1
    return [w < 0 ? Infinity : w, x.level ?? Infinity]
  }
  const order = (x: InventoryTile, y: InventoryTile) => {
    if (docType !== InventoryTab.theorem) return x.displayName.localeCompare(y.displayName)
    const [xw, xl] = learnt(x), [yw, yl] = learnt(y)
    return +x.locked - +y.locked || +x.disabled - +y.disabled ||
      (xw - yw || 0) || (xl - yl || 0) || x.displayName.localeCompare(y.displayName)
  }

  return <div className="inventory-list">
    {[...currentTiles].sort(order).map(tile =>
        <InventoryItem key={`${tile.category}-${tile.name}`}
          tile={tile}
          recent={recentNames.includes(tile.name)}
          isTheorem={docType === InventoryTab.theorem}
          enableAll={enableAll} />
      )
    }
  </div>
}
