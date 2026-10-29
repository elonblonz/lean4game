import * as React from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { popupAtom, PopupType } from '../../store/popup-atoms'
import { ImpressumPopup } from './impressum'
import { InfoPopup } from './info'
import '../../css/popup.css'
import { focusableElements } from '../../utils/a11y'
import { PrivacyPolicyPopup } from './privacy'
import { UploadPopup } from './upload'
import { PreferencesPopup } from './preferences'
import { ErasePopup } from './erase'
import { RulesHelpPopup } from './rules_help'
import { WorldRecapPopup } from '../learning/WorldRecap'
import { ProofsPopup } from './proofs'

/**
 * To create a new popup on needs add a option to `PopupType`,
 * and then define its content in `getPopupContent` below.
 *
 * Popups can be opened by setting the `popupAtom` to the popup's type.
 */

/** The content of the current popup. */
function getPopupContent(popup: PopupType) {
  switch(popup) {
    case PopupType.erase:
      return <ErasePopup />
    case PopupType.impressum:
      return <ImpressumPopup />
    case PopupType.info:
      return <InfoPopup />
    case PopupType.preferences:
      return <PreferencesPopup />
    case PopupType.privacy:
      return <PrivacyPolicyPopup />
    case PopupType.recap:
      return <WorldRecapPopup />
    case PopupType.proofs:
      return <ProofsPopup />
    case PopupType.rules:
      return <RulesHelpPopup />
    case PopupType.upload:
      return <UploadPopup />
    default:
      // Hack: this throws a TS error when cases are missed.
      const _exhaustive: never = popup
  }
}

/** A popup displayed over the entire page. */
export function Popup () {
  // Without suspending: this is rendered directly in `App`, and suspending would remount
  // `App`, which would start a second LeanMonaco instance.
  const { t } = useTranslation(undefined, { useSuspense: false })
  const [popup, setPopup] = useAtom(popupAtom)
  const modalRef = React.useRef<HTMLDivElement>(null)

  function closePopup() {
    setPopup(null)
  }

  // Escape closes the popup; focus moves into it while it is open (Tab cycles inside it), and
  // back afterwards. The popup is named by its heading.
  React.useEffect(() => {
    if (!popup) return
    const previousFocus = document.activeElement as HTMLElement | null
    const modal = modalRef.current
    modal?.focus()
    const heading = modal?.querySelector('h1, h2, h3')
    if (modal && heading) {
      heading.id ||= 'popup-title'
      modal.setAttribute('aria-labelledby', heading.id)
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closePopup()
      if (ev.key === "Tab" && modal) {
        const items = focusableElements(modal)
        if (!items.length) return
        const first = items[0], last = items[items.length - 1]
        if (ev.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
          ev.preventDefault(); last.focus()
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault(); first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previousFocus?.focus?.()
    }
  }, [popup])

  if (!popup) {return null}

  return <div className="modal-wrapper">
  <div className="modal-backdrop" onClick={closePopup} />
  <div className={`modal${popup === PopupType.proofs ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" tabIndex={-1} ref={modalRef}>
    <button className="codicon codicon-close modal-close" onClick={closePopup} aria-label={t("Close")} title={t("Close")}></button>
    {getPopupContent(popup)}
  </div>
</div>
}
