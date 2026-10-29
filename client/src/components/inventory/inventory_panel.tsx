import React, { useEffect, useRef } from "react"
import "../../css/inventory.css"
import { closeDocAtom, inventorySourceAtom, inventoryTabAtom, selectedDocTileAtom, theoremSubtabAtom } from "../../store/inventory-atoms"
import { useAtom } from "jotai"
import { useTranslation } from "react-i18next"
import { InventorySubTabBar, InventoryTabBar } from "./tab_bars"
import { InventoryList } from "./inventory_list"
import { Documentation } from "./documentation"
import { difficultyAtom } from "../../store/progress-atoms"
import { inventoryViewAtom } from "../../store/learning-atoms"
import { Glossary } from "../learning/Glossary"
import { moveFocusWithArrows } from "../../utils/a11y"

/** The panel showing the user's inventory with tactics, definitions, and lemmas.
 *
 * In a level it shows the level's inventory, otherwise the game's (see `inventorySourceAtom`).
 */
export function InventoryPanel({visible = true, id} : {
  visible?: boolean,
  id?: string,
}) {
  const { t } = useTranslation()
  const [tab] = useAtom(inventoryTabAtom)
  const [, setSubtab] = useAtom(theoremSubtabAtom)
  const [doc] = useAtom(selectedDocTileAtom)
  const [, closeDoc] = useAtom(closeDocAtom)
  const [source] = useAtom(inventorySourceAtom)
  const [difficulty] = useAtom(difficultyAtom)
  const [view, setView] = useAtom(inventoryViewAtom)

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

  return <div className={`column inventory-panel inventory panel ${visible ? '' : 'hidden'}`}
      id={id} role="complementary" aria-label={t("Inventory")}>
    <div className="tab-bar view-switch" role="tablist" aria-label={t("Inventory or glossary")}
        onKeyDown={ev => moveFocusWithArrows(ev, Array.from(ev.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')))}>
      {(["inventory", "glossary"] as const).map(v =>
        <button key={v} role="tab" aria-selected={view == v} tabIndex={view == v ? 0 : -1}
            className={`tab${view == v ? " active" : ""}`} onClick={() => setView(v)}>
          {v == "inventory" ? t("Inventory") : t("Glossary")}
        </button>
      )}
    </div>
    {view == "glossary" ? <Glossary /> : <>
      <InventoryTabBar />
      <InventorySubTabBar />
      <InventoryList docType={tab} enableAll={difficulty == 0} />
      {doc && <Documentation type={tab} />}
    </>}
  </div>
}
