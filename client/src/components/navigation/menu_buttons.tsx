/**
 * @file The menu button in the app bar and the entries of its dropdown menu.
 */
import * as React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDownload, faUpload, faEraser, faXmark, faBars, faCircleInfo, faGear } from '@fortawesome/free-solid-svg-icons'
import { useTranslation } from 'react-i18next'
import { useAtom } from 'jotai'
import { Button } from '../button'
import { downloadProgress } from '../../utils/download'
import { popupAtom, PopupType } from '../../store/popup-atoms'
import { closeNavAtom, navOpenAtom } from '../../store/navigation-atoms'
import { gameIdAtom } from '../../store/location-atoms'
import { progressAtom } from '../../store/progress-atoms'

/** button to toggle dropdown menu. */
export function MenuButton() {
  const { t } = useTranslation()
  const [navOpen, setNavOpen] = useAtom(navOpenAtom)
  return <Button  className="btn toggle-width" id="menu-btn" onClick={(ev) => {setNavOpen(!navOpen)}}
      title={t("Menu")} aria-label={t("Menu")} aria-expanded={navOpen}>
    {navOpen ? <FontAwesomeIcon icon={faXmark} /> : <FontAwesomeIcon icon={faBars} />}
  </Button>
}

export function ImpressumButton({ isDropdown } : {isDropdown: boolean}) {
  const [, closeNav] = useAtom(closeNavAtom)
  const [, setPopup] = useAtom(popupAtom)
  const { t } = useTranslation()
  return <Button className="btn btn-inverted"
    title={t("Impressum")} inverted={true}  onClick={(ev) => {setPopup(PopupType.impressum); closeNav()}}>
    <FontAwesomeIcon icon={faCircleInfo} />
    {isDropdown && <>&nbsp;{t("Impressum")}</>}
  </Button>
}

export function PrivacyButton({ isDropdown } : {isDropdown: boolean}) {
  const [, closeNav] = useAtom(closeNavAtom)
  const [, setPopup] = useAtom(popupAtom)
  const { t } = useTranslation()
  return <Button className="btn btn-inverted"
    title={t("Privacy Policy")} inverted={true} onClick={(ev) => {setPopup(PopupType.privacy); closeNav()}}>
    <FontAwesomeIcon icon={faCircleInfo} />
    {isDropdown && <>&nbsp;{t("Privacy Policy")}</>}
  </Button>
}

export function PreferencesButton() {
  const [, closeNav] = useAtom(closeNavAtom)
  const [, setPopup] = useAtom(popupAtom)
  const { t } = useTranslation()
  return <Button title={t("Preferences")} inverted={true}  onClick={() => {setPopup(PopupType.preferences); closeNav()}}>
    <FontAwesomeIcon icon={faGear} />&nbsp;{t("Preferences")}
  </Button>
}

export function GameInfoButton() {
  const [, closeNav] = useAtom(closeNavAtom)
  const [, setPopup] = useAtom(popupAtom)
  const { t } = useTranslation()
  return <Button className="btn btn-inverted"
    title={t("Game Info & Credits")} inverted={true}  onClick={() => {setPopup(PopupType.info); closeNav()}}>
    <FontAwesomeIcon icon={faCircleInfo} />&nbsp;{t("Game Info")}
  </Button>
}

export function EraseButton () {
  const [, closeNav] = useAtom(closeNavAtom)
  const [, setPopup] = useAtom(popupAtom)
  const { t } = useTranslation()
  return <Button title={t("Clear Progress")} inverted={true}  onClick={() => {setPopup(PopupType.erase); closeNav()}}>
    <FontAwesomeIcon icon={faEraser} />&nbsp;{t("Erase")}
  </Button>
}

export function DownloadButton () {
  const [, closeNav] = useAtom(closeNavAtom)
  const [gameId] = useAtom(gameIdAtom)
  const [gameProgress] = useAtom(progressAtom)
  const { t } = useTranslation()
  return <Button
    title={t("Download Progress")}
    inverted={true}
    disabled={!gameId}
    onClick={(ev) => {
      ev.preventDefault()
      if (gameId && gameProgress) {
        downloadProgress(gameId, gameProgress)
      }
      closeNav()
    }}
  >
    <FontAwesomeIcon icon={faDownload} />&nbsp;{t("Download")}
  </Button>
}

export function UploadButton () {
  const [, closeNav] = useAtom(closeNavAtom)
  const [, setPopup] = useAtom(popupAtom)
  const { t } = useTranslation()
  return <Button title={t("Load Progress from JSON")} inverted={true}  onClick={() => {setPopup(PopupType.upload); closeNav()}}>
    <FontAwesomeIcon icon={faUpload} />&nbsp;{t("Upload")}
  </Button>
}

