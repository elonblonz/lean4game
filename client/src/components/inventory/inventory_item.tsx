import { faBan, faCheck, faClipboard, faLock, faReply } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import React, { useState } from "react"
import { useTranslation } from "react-i18next"
import { InventoryTile } from "../../api/game-data"
import { useAtom } from "jotai"
import { selectedDocTileAtom } from "../../store/inventory-atoms"
import { levelIdAtom } from "../../store/location-atoms"
import { useAppendTypewriterInput } from "../editor/typewriter/useAppendTypewriterInput"

export function InventoryItem({tile, isTheorem, recent=false, enableAll=false} : {
  tile: InventoryTile,
  isTheorem: boolean,
  recent: boolean,
  enableAll?: boolean,
}) {
  const { t } = useTranslation()
  const [, setDoc] = useAtom(selectedDocTileAtom)
  const [levelId] = useAtom(levelIdAtom)

  const insertable: boolean = (levelId ?? 0) > 0 && (enableAll || !(tile.locked || tile.disabled))

  const icon = (!enableAll && tile.locked) ? <FontAwesomeIcon icon={faLock} /> :
               tile.disabled ? <FontAwesomeIcon icon={faBan} /> : null
  const className = tile.locked ? "locked" : tile.disabled ? "disabled" : tile.new ? "new" : ""
  // Note: This is somewhat a hack as the statement of lemmas comes currently in the form
  // `Namespace.statement_name (x y : Nat) : some type`
  const title = (!enableAll && tile.locked) ? t("Not unlocked yet") :
                tile.disabled ? t("Not available in this level") : (tile.altTitle ? tile.altTitle.substring(tile.altTitle.indexOf(' ') + 1) : '')

  const [inserted, setInserted] = useState(false)

  const appendTypewriterInput = useAppendTypewriterInput()

  const handleClick = (ev: any) => {setDoc(tile)}

  const insertItemName = (ev: any) => {
    ev.stopPropagation()
    if (!appendTypewriterInput(ev.shiftKey, tile.displayName, isTheorem, false)) return
    // Show "inserted" for a moment.
    setInserted(true)
    setTimeout(() => {
      setInserted(false)
    }, 3000);
  }

  // For screen readers, the state that the icon and the colour show.
  const state = (!enableAll && tile.locked) ? t("Not unlocked yet") : tile.disabled ? t("Not available in this level") :
                tile.new ? t("new") : ''

  return <div className={`item ${className}${enableAll ? ' enabled' : ''}${recent ? ' recent' : ''}`} onClick={handleClick} title={title}
      role="button" tabIndex={0} aria-label={state ? `${tile.displayName} (${state})` : tile.displayName}
      onKeyDown={ev => {
        // Enter or Space opens the doc; not when pressed on the insert button inside.
        if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) {
          ev.preventDefault()
          handleClick(ev)
        }
      }}>
    {icon} {tile.displayName}
    {insertable &&
    <button
        className="insert-button"
        title={t("insert '{{name}}'", { name: tile.displayName })}
        aria-label={t("insert '{{name}}'", { name: tile.displayName })}
        onClick={insertItemName}
    >
      {inserted ? <FontAwesomeIcon icon={faCheck} /> : <FontAwesomeIcon icon={faReply} />}
    </button> }
  </div>
}
