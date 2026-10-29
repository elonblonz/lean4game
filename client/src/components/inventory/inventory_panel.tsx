import React, { useEffect, useRef } from "react"
import "../../css/inventory.css"
import { closeDocAtom, inventorySourceAtom, inventoryTabAtom, selectedDocTileAtom, theoremSubtabAtom } from "../../store/inventory-atoms"
import { useAtom } from "jotai"
import { InventorySubTabBar, InventoryTabBar } from "./tab_bars"
import { InventoryList } from "./inventory_list"
import { Documentation } from "./documentation"
import { difficultyAtom } from "../../store/progress-atoms"

/** The panel showing the user's inventory with tactics, definitions, and lemmas.
 *
 * In a level it shows the level's inventory, otherwise the game's (see `inventorySourceAtom`).
 */
export function InventoryPanel({visible = true} : {
  visible?: boolean
}) {
  const [tab] = useAtom(inventoryTabAtom)
  const [, setSubtab] = useAtom(theoremSubtabAtom)
  const [doc] = useAtom(selectedDocTileAtom)
  const [, closeDoc] = useAtom(closeDocAtom)
  const [source] = useAtom(inventorySourceAtom)
  const [difficulty] = useAtom(difficultyAtom)

  // Switching to another tab shows that tab's list: close the open doc (it is looked up
  // under the current tab, so it would show up empty).
  const previousTab = useRef(tab)
  useEffect(() => {
    if (previousTab.current !== tab) closeDoc()
    previousTab.current = tab
  }, [tab])

  // If the level specifies `TheoremTab "Nat"`, we switch to this tab on loading.
  // `lemmaTab` is `null` or `undefined` otherwise, in which case we don't want to switch.
  useEffect(() => {
    if (source?.lemmaTab) {
      setSubtab(source.lemmaTab)
    }
  }, [source])

  return <div className={`column inventory-panel inventory panel ${visible ? '' : 'hidden'}`}>
    <InventoryTabBar />
    <InventorySubTabBar />
    <InventoryList docType={tab} enableAll={difficulty == 0} />
    {doc && <Documentation type={tab} />}
  </div>
}
