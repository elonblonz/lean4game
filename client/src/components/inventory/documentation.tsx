import React, { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Markdown } from "../markdown"
import { closeDocAtom, docAtomFamily, docAtomLegacyFamily, inventoryAtom, InventoryTab, selectedDocTileAtom } from "../../store/inventory-atoms"
import { useAtom } from "jotai"
import { faLock, faXmark } from "@fortawesome/free-solid-svg-icons"
import { NavButton } from "../navigation/nav_button"
import { useGameTranslation } from "../../utils/translation"
import { navigateAcrossWorldsAtom } from "../../store/location-atoms"
import { difficultyAtom } from "../../store/progress-atoms"
import { gameInfoAtom } from "../../store/query-atoms"

/** The `documentation` */
export function Documentation({ type } : {type : InventoryTab}) {
  const { t } = useTranslation()
  const { t: gT } = useGameTranslation()
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [, navigateAcrossWorlds] = useAtom(navigateAcrossWorldsAtom)
  const [difficulty] = useAtom(difficultyAtom)
  const [, addToInventory] = useAtom(inventoryAtom)

  const [docTile] = useAtom(selectedDocTileAtom)
  const [, closeDoc] = useAtom(closeDocAtom)

  const [{ data: docEntry }] = useAtom(docAtomFamily([type, docTile?.name ?? ""]))
  const [{ data: legacyDocEntry }] = useAtom(docAtomLegacyFamily([type, docTile?.name ?? ""]))

  // Move the focus into the doc when it opens (e.g. from the keyboard), and back to where it was
  // (the item) when it closes.
  const docRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!docTile) return
    const previousFocus = document.activeElement as HTMLElement | null
    docRef.current?.querySelector<HTMLElement>('.nav-button')?.focus()
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [docTile?.name])

  if (!docTile) return null

  return <div className="documentation" ref={docRef} role="region" aria-label={docTile.displayName}
      onKeyDown={ev => { if (ev.key === "Escape") { ev.stopPropagation(); closeDoc() } }}>
    <NavButton
      icon={faXmark}
      title={t("Close")}
      onClick={closeDoc}
      inverted={true}
    />
    { difficulty == 1 && docTile.locked &&
      <NavButton
        icon={faLock}
        title={t("Unlock this item!")}
        onClick={() => {
          console.log(`Adding '${docTile.name}' to the inventory.`)
          addToInventory([docTile.name])
          closeDoc() // note: closing seems better than keeping it open without the lock disappearing
        }}
        className="lock"
        inverted={true} />
    }
    <h1 className="doc">{docTile.displayName}</h1>
    <p><code>{docEntry?.statement ?? legacyDocEntry?.statement}</code></p>
    <Markdown>{gT(docEntry?.content ?? legacyDocEntry?.content ?? "")}</Markdown>
    {/* TODO: The condition below should be updated so that the section
    is displayed whenever it's non-empty. */}
    {docTile.proven && <>
        <h2>{t("Further details")}</h2>
        <ul>
          {docTile.proven && <li>{t("Proven in:")} <a href="#" onClick={(ev) => {
            ev.preventDefault()
            if (!docTile.world || !docTile.level) return
            navigateAcrossWorlds(docTile.world, docTile.level)
          }}>{gT((docTile.world && gameInfo?.worlds?.nodes[docTile.world]?.title) || docTile.world || "")}, {t("Level")} {docTile.level}</a></li>}
        </ul>
      </>
    }

  </div>
}
