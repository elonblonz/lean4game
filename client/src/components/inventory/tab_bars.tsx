import React from "react"
import { useTranslation } from "react-i18next"
import { inventoryCurrentTabNewTilesAtom, inventoryCurrentTabRecentTilesAtom, inventorySubtabAtom, inventorySubtabOptionsAtom, InventoryTab, inventoryTabAtom, inventoryTabNewTilesAtom, inventoryTabRecentTilesAtom } from "../../store/inventory-atoms"
import { useAtom } from "jotai"
import "../../css/tab_bar.css"
import { moveFocusWithArrows } from "../../utils/a11y"

function TabTitle(type: InventoryTab): string {
  switch(type) {
    case InventoryTab.theorem: return "Theorems"
    case InventoryTab.tactic: return "Tactics"
    case InventoryTab.definition: return "Definitions"
    default:
      const _exhaustive: never = type
      return ""
  }
}

/** Props of a tab: only the active one is in the Tab order, the arrow keys move between them
 * (see `onTabListKeyDown`), Enter or Space select one. */
function tabProps(active: boolean, select: () => void) {
  return {
    role: "tab",
    "aria-selected": active,
    tabIndex: active ? 0 : -1,
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select() }
    },
  }
}

/** Arrow keys move the focus between the tabs of a tab list. */
function onTabListKeyDown(ev: React.KeyboardEvent<HTMLElement>) {
  moveFocusWithArrows(ev, Array.from(ev.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')))
}

/** The major tab bar: choose between theorems, tactics, or definitions */
export function InventoryTabBar() {
  const { t } = useTranslation()
  const [tab, setTab] = useAtom(inventoryTabAtom)
  const [newTiles] = useAtom(inventoryTabNewTilesAtom)
  const [recentTiles] = useAtom(inventoryTabRecentTilesAtom)
  return (
    <div className="tab-bar major" role="tablist" aria-label={t("Inventory")} onKeyDown={onTabListKeyDown}>
      { Object.values(InventoryTab).map(type => (
        <div
          key={type}
          className={`tab${(tab == type) ? " active": ""}${newTiles[type].length > 0 ? " new" : ""}${recentTiles[type].length > 0 ? "  recent" : ""}`}
          onClick={() => {setTab(type)}}
          {...tabProps(tab == type, () => setTab(type))}
        >
          {t(TabTitle(type))}
        </div>
      ))}
    </div>
  )
}

export function InventorySubTabBar() {
  const [tab] = useAtom(inventoryTabAtom)
  const [subtab, setSubtab] = useAtom(inventorySubtabAtom)
  const [newTiles] = useAtom(inventoryCurrentTabNewTilesAtom)
  const [recentTiles] = useAtom(inventoryCurrentTabRecentTilesAtom)
  const [options] = useAtom(inventorySubtabOptionsAtom)

  if (options.length < 2) return null

  function hasNew(cat: string) {
    return newTiles.filter(it => it.category == cat).length > 0
  }

  function hasRecent(cat: string) {
    return recentTiles.filter(it => it.category == cat).length > 0
  }

  return (
    <div className="tab-bar" role="tablist" onKeyDown={onTabListKeyDown}>
      {options.map((cat) => {
        // let hasNew = modifiedItems.filter(item => item.new && (cat == item.category)).length > 0
        // return <div key={`category-${cat}`} className={`tab${cat == (tab ?? categories[0]) ? " active": ""}${hasNew ? ' new': ''}${recentItems.map(it => it.category).includes(cat) ? ' recent': ''}`}
        //   onClick={() => { setSubtab(cat) }}>{cat}</div>})}
        return <div key={`category-${cat}`} className={`tab${cat == subtab ? " active": ""}${hasNew(cat) ? " new": ""}${hasRecent(cat) ? " recent": ""}`}
          onClick={() => { setSubtab(cat) }} {...tabProps(cat == subtab, () => setSubtab(cat))}>{cat}</div>})}
    </div>
  )
}
