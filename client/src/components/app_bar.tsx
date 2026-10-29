/**
 *  @file contains the navigation bars of the app.
 */
import * as React from 'react'
import { useAtom } from 'jotai'
import { navOpenAtom } from '../store/navigation-atoms'
import { useGameTranslation } from '../utils/translation'
import { worldIdAtom } from '../store/location-atoms'
import { gameInfoAtom } from '../store/query-atoms'
import { mobileAtom } from '../store/preferences-atoms'
import { HomeButton, InputModeButton, LandingPageButton, MobileNavButtons, NextButton, PreviousButton } from './navigation/level_nav_buttons'
import { DownloadButton, EraseButton, GameInfoButton, ImpressumButton, MenuButton, PreferencesButton, PrivacyButton, UploadButton } from './navigation/menu_buttons'
import { LanguageButton, LanguageDropdown } from './navigation/language'

/** the navigation bar on the welcome page */
export function WelcomeAppBar({pageNumber, setPageNumber} : {
  pageNumber: number,
  setPageNumber: any,
}) {
  const { t: gT } = useGameTranslation()
  const [{data: gameInfo}] = useAtom(gameInfoAtom)
  const [mobile] = useAtom(mobileAtom)
  const [navOpen] = useAtom(navOpenAtom)

  return <div className={`app-bar${mobile ? " mobile" : ""}`}>
    <div className='app-bar-left'>
      {import.meta.env.VITE_LEAN4GAME_SINGLE !== "true" && <LandingPageButton />}
      <span className="app-bar-title"></span>
    </div>
    <div>
      {!mobile && <span className="app-bar-title">{gT(gameInfo?.title ?? "")}</span>}
    </div>
    <div className="nav-btns">
      {mobile && <MobileNavButtons pageNumber={pageNumber} setPageNumber={setPageNumber} />}
      {((gameInfo?.tile?.languages.length ?? 1) > 1) && <LanguageButton />}
      <MenuButton />
    </div>
    <LanguageDropdown />
    <div className={'menu dropdown' + (navOpen ? '' : ' hidden')}>
      <GameInfoButton />
      <DownloadButton />
      <UploadButton />
      <EraseButton />
      <ImpressumButton isDropdown={true} />
      <PrivacyButton isDropdown={true} />
      <PreferencesButton />
    </div>
  </div>
}

/** the navigation bar in a level */
export function LevelAppBar({isLoading, levelTitle, pageNumber=1, setPageNumber=undefined} : {
  isLoading: boolean,
  levelTitle: string,
  pageNumber?: number,
  setPageNumber?: any,
}) {
  const { t: gT } = useGameTranslation()
  const [worldId] = useAtom(worldIdAtom)
  const [mobile] = useAtom(mobileAtom)
  const [navOpen] = useAtom(navOpenAtom)
  const [{data: gameInfo}] = useAtom(gameInfoAtom)

  let worldTitle = worldId ? gameInfo?.worlds?.nodes[worldId]?.title : ""
  const worldSize = worldId ? gameInfo?.worldSize?.[worldId] ?? 0 : 0

  return <div className={`app-bar${mobile ? " mobile" : ""}`} style={isLoading ? {display: "none"} : undefined} >
    {mobile ?
      <>
        {/* MOBILE VERSION */}
        <div className="app-bar-main">
          <span className="app-bar-title">{levelTitle}</span>
        </div>
        <div className="nav-btns">
          <PreviousButton iconOnly={true} />
          <NextButton worldSize={worldSize} iconOnly={true} />
          <MenuButton />
        </div>
        <div className={'menu dropdown' + (navOpen ? '' : ' hidden')}>
          <HomeButton isDropdown={true} />
          <InputModeButton isDropdown={true}/>
          <GameInfoButton />
          <ImpressumButton isDropdown={true} />
          <PrivacyButton isDropdown={true} />
          <EraseButton />
          <PreferencesButton />
        </div>
      </> :
      <>
        {/* DESKTOP VERSION */}
        <div className='app-bar-left'>
          <HomeButton isDropdown={false} />
          <span className="app-bar-title">{worldTitle && gT(worldTitle)}</span>
        </div>
        <div>
          <span className="app-bar-title">{levelTitle}</span>
        </div>
        <div className="nav-btns">
          <PreviousButton  />
          <NextButton worldSize={worldSize} />
          <InputModeButton isDropdown={false}/>
          {((gameInfo?.tile?.languages.length ?? 1) > 1) && <LanguageButton />}
          <MenuButton  />
        </div>
        <LanguageDropdown />
        <div className={'menu dropdown' + (navOpen ? '' : ' hidden')}>
          <GameInfoButton />
          <ImpressumButton isDropdown={true} />
          <PrivacyButton isDropdown={true} />
          <EraseButton />
          <PreferencesButton />
        </div>
      </>
    }
  </div>
}
