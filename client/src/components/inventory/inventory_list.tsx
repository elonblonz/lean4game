import React from "react"
import { InventoryItem } from "./inventory_item"
import { currentInventoryTilesAtom, inventoryCurrentTabRecentTilesAtom, InventoryTab } from "../../store/inventory-atoms"
import { useAtom } from "jotai"

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

  return <div className="inventory-list">
    {[...currentTiles].sort(
        // For theorems, sort entries `available > disabled > locked`
        // otherwise alphabetically
        (x, y) => +(docType === InventoryTab.theorem) * (+x.locked - +y.locked || +x.disabled - +y.disabled) || x.displayName.localeCompare(y.displayName)
      ).map(tile =>
        <InventoryItem key={`${tile.category}-${tile.name}`}
          tile={tile}
          recent={recentNames.includes(tile.name)}
          isTheorem={docType === InventoryTab.theorem}
          enableAll={enableAll} />
      )
    }
  </div>
}
