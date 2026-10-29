/**
 * @file The language selection in the app bar.
 */
import * as React from 'react'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { useTranslation } from 'react-i18next'
import { useAtom } from 'jotai'
import { langNavOpenAtom } from '../../store/navigation-atoms'
import { gameIdAtom } from '../../store/location-atoms'
import { gameInfoAtom } from '../../store/query-atoms'
import { preferencesAtom } from '../../store/preferences-atoms'
import { NavButton } from './nav_button'
import { Flag } from '../flag'
import i18n from '../../i18n'
import lean4gameConfig from '../../config.json'

export function LanguageButton() {
  const { t } = useTranslation()
  const [langNavOpen, setLangNavOpen] = useAtom(langNavOpenAtom)

  return (
    <NavButton
      iconElement={langNavOpen ? undefined : <Flag iso={i18n.language} />}
      icon={langNavOpen ? faXmark : undefined}
      title={langNavOpen ? t('close language menu') : t('open language menu')}
      onClick={() => {setLangNavOpen(!langNavOpen)}}
    />
  )
}

export function LanguageDropdown() {
  const [gameId] = useAtom(gameIdAtom)
  const [, setPreferences] = useAtom(preferencesAtom)
  const [{data: gameInfo}] = useAtom(gameInfoAtom)
  const [langNavOpen, setLangNavOpen] = useAtom(langNavOpenAtom)

  const available = gameId && gameInfo?.tile?.languages ? gameInfo?.tile?.languages : Object.entries(lean4gameConfig.languages).map(it => it[1].iso)

  return (
    <div className={'menu dropdown' + (langNavOpen ? '' : ' hidden')} onClick={() => {setLangNavOpen(!langNavOpen)}} >
      {available.map(iso =>
          <NavButton
            key={`lang-selection-${iso}`}
            iconElement={<Flag iso={iso} />}
            text={lean4gameConfig.languages.find(it => it.iso == iso)?.name}
            onClick={() => {setPreferences(prev => ({ ...prev, language: iso }))}}
            inverted={true} />)
      }
    </div>
  )
}


