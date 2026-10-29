/**
 * @file The buttons in the app bar that navigate between levels and pages.
 */
import * as React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBook, faBookOpen, faGlobe, faHome, faArrowRight, faArrowLeft, faCode, faTerminal } from '@fortawesome/free-solid-svg-icons'
import { useTranslation } from 'react-i18next'
import { useAtom } from 'jotai'
import { Button } from '../button'
import { closeNavAtom } from '../../store/navigation-atoms'
import { gameIdAtom, levelIdAtom, navigateToLandingPageAtom, worldIdAtom } from '../../store/location-atoms'
import { completedAtom, difficultyAtom } from '../../store/progress-atoms'
import { readGameIntroAtom } from '../../store/chat-atoms'
import { currentProofAtom, lockEditorModeAtom, typewriterModeAtom } from '../../store/proof-atoms'

/** navigation buttons for mobile welcome page to switch between intro/tree/inventory. */
export function MobileNavButtons({pageNumber, setPageNumber}:
  { pageNumber: number,
    setPageNumber: any}) {
  const { t } = useTranslation()
  const [, navigateToLandingPage] = useAtom(navigateToLandingPageAtom)
  const [, setReadGameIntro] = useAtom(readGameIntroAtom)

  // if `prevText` or `prevIcon` is set, show a button to go back
  let prevText  = {0: null, 1: t("Intro"), 2: null}[pageNumber]
  let prevIcon  = {0: null, 1: null, 2: faBookOpen}[pageNumber]
  let prevTitle = {0: null, 1: t("Game Introduction"), 2: t("close inventory")}[pageNumber] ?? undefined
  // if `nextText` or `nextIcon` is set, show a button to go forward
  let nextText  = {0: t("Start"), 1: null, 2: null}[pageNumber]
  let nextIcon  = {0: null, 1: faBook, 2: null}[pageNumber]
  let nextTitle = {0: t("Start"), 1: t("Inventory"), 2: null}[pageNumber] ?? undefined

  return <>
    {(prevText || prevIcon) &&
      <Button
        className="btn btn-inverted toggle-width"
        onClick={() => {pageNumber == 0 ? navigateToLandingPage() : setPageNumber(pageNumber - 1)}}
        inverted={true} title={prevTitle}>
          {prevIcon && <FontAwesomeIcon icon={prevIcon} />}
          {prevText && `${prevText}`}
      </Button>
    }
    {(nextText || nextIcon) &&
      <Button className="btn btn-inverted toggle-width"  inverted={true}
          title={nextTitle}
          onClick={() => {
            console.log(`page number: ${pageNumber}`)
            setPageNumber(pageNumber+1);
            setReadGameIntro(true)
          }}
      >
        {nextText && `${nextText}`}
        {nextIcon && <FontAwesomeIcon icon={nextIcon} />}
      </Button>
    }
  </>
}

/**
 * button to go one level futher.
 * for the last level, this button turns into a button going back to the welcome page.
 */
export function NextButton({worldSize, iconOnly=false} : {worldSize: number, iconOnly?: boolean}) {
  const [, closeNav] = useAtom(closeNavAtom)
  const { t } = useTranslation()
  const [gameId, navigateToGame] = useAtom(gameIdAtom)
  const [levelId, navigateToLevel] = useAtom(levelIdAtom)
  const [difficulty] = useAtom(difficultyAtom)
  // Solved before (saved), or solved now: `proofAtom` may still be the previous text's.
  const [completed] = useAtom(completedAtom)
  const [currentProof] = useAtom(currentProofAtom)
  if (levelId === undefined) return null
  if (levelId == 0) return (
    <Button inverted={true}
        onClick={() => {navigateToLevel(levelId + 1); closeNav()}}
         title={t("next level")}
      >
      <FontAwesomeIcon icon={faArrowRight} />{!iconOnly && <>&nbsp;{t("Start")}</>}
    </Button>
  )
  if (levelId < worldSize) return (
    <Button inverted={true}
        onClick={() => {navigateToLevel(levelId + 1); closeNav()}}
        title={t("next level")}
        disabled={difficulty >= 2 && !(completed || currentProof?.completed)}
      >
      <FontAwesomeIcon icon={faArrowRight} />{!iconOnly && <>&nbsp;{t("Next")}</>}
    </Button>
  )
  // The last level: the app bar already has a Home button.
  return null
}

/** button to go one level back.
 * only renders if the current level id is > 0.
 */
export function PreviousButton({iconOnly=false} : {iconOnly?: boolean}) {
  const [, closeNav] = useAtom(closeNavAtom)
  const { t } = useTranslation()
  const [gameId] = useAtom(gameIdAtom)
  const [worldId] = useAtom(worldIdAtom)
  const [levelId, navigateToLevel] = useAtom(levelIdAtom)
  if (!levelId) return null
  return (
    <Button disabled={levelId <= 0} inverted={true}
        onClick={() => {navigateToLevel(levelId - 1); closeNav()}}
        title={t("previous level")}
      >
      <FontAwesomeIcon icon={faArrowLeft} />{!iconOnly && <>&nbsp;{t("Previous")}</>}
    </Button>
  )
}

/** button to toggle between editor and typewriter */
export function InputModeButton({ isDropdown } : {isDropdown: boolean}) {
  const [, closeNav] = useAtom(closeNavAtom)
  const { t } = useTranslation()
  const [levelId] = useAtom(levelIdAtom)
  const [typewriterMode, setTypewriterMode] = useAtom(typewriterModeAtom)
  const [lockEditorMode] = useAtom(lockEditorModeAtom)

  /** toggle input mode if allowed */
  function toggleInputMode(ev: React.MouseEvent) {
    if (!lockEditorMode){
      setTypewriterMode(!typewriterMode)
      closeNav()
    }
  }

  return <Button
      className={`btn btn-inverted ${isDropdown? '' : 'toggle-width'}`} disabled={!levelId || levelId <= 0 || lockEditorMode}
      inverted={true}
      onClick={(ev) => toggleInputMode(ev)}
      title={lockEditorMode ? t("Editor mode is enforced!") : typewriterMode ? t("Editor mode") : t("Typewriter mode")}>
    <FontAwesomeIcon icon={(typewriterMode) ? faCode : faTerminal} />
    {isDropdown && ((typewriterMode) ? <>&nbsp;{t("Editor mode")}</> : <>&nbsp;{t("Typewriter mode")}</>)}
  </Button>
}

/**  button to go back to welcome page */
export function HomeButton({ isDropdown } : {isDropdown: boolean}) {
  const { t } = useTranslation()
  const [gameId, navigateToGame] = useAtom(gameIdAtom)
  return <Button
    onClick={() => {if (gameId) navigateToGame(gameId)}}
    inverted={true} title={t("Home")} id="home-btn">
    <FontAwesomeIcon icon={faHome} />
    {isDropdown && <>&nbsp;{t("Home")}</>}
  </Button>
}

export function LandingPageButton() {
  const { t } = useTranslation()
  const [, navigateToLandingPage] = useAtom(navigateToLandingPageAtom)
  return <Button inverted={false} title={t("back to games selection")} onClick={() => navigateToLandingPage()}>
    <FontAwesomeIcon icon={faArrowLeft} />&nbsp;<FontAwesomeIcon icon={faGlobe} />
    </Button>
}

