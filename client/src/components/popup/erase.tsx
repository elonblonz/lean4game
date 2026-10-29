/**
 * @fileOverview
*/
import * as React from 'react'
import { downloadProgress } from '../../utils/download'
import { Button } from '../button'
import { Trans, useTranslation } from 'react-i18next'
import { useAtom } from 'jotai'
import { popupAtom } from '../../store/popup-atoms'
import { gameIdAtom, levelIdAtom, worldIdAtom } from '../../store/location-atoms'
import { levelProgressAtom, progressAtom, worldProgressAtom } from '../../store/progress-atoms'
import { journalAtom } from '../../store/written-proofs-atoms'

/** Pop-up to delete the progress of the current level, world or game. */
export function ErasePopup () {
  let { t } = useTranslation()
  const [gameId, navigateToGame] = useAtom(gameIdAtom)
  const [worldId] = useAtom(worldIdAtom)
  const [levelId] = useAtom(levelIdAtom)
  const [gameProgress, setGameProgress] = useAtom(progressAtom)
  const [worldProgress, setWorldProgress] = useAtom(worldProgressAtom)
  const [levelProgress, setLevelProgress] = useAtom(levelProgressAtom)
  const [, setJournal] = useAtom(journalAtom)
  const [, setPopup] = useAtom(popupAtom)

  const eraseProgress = () => {
    setGameProgress(null)
    setJournal({ clear: true })
    setPopup(null)
  }

  function eraseLevel () {
    setLevelProgress(null)
    if (worldId && levelId) setJournal({ removeLevel: { worldId, levelId } })
    setPopup(null)
  }

  function eraseWorld () {
    setWorldProgress(null)
    if (worldId) setJournal({ removeWorld: worldId })
    setPopup(null)
  }

  const downloadAndErase = () => {
    if (!gameId) return
    if (gameProgress) {
      downloadProgress(gameId, gameProgress)
    }
    eraseProgress()
  }

  return <>
    <h2>{t("Delete Progress?")}</h2>
    <Trans>
      <p>Do you want to delete your saved progress irreversibly?</p>
    </Trans>
    <div className='settings-buttons'>
      <Button onClick={(ev) => {ev.preventDefault(); eraseLevel()}}  disabled={!levelId} >{t("Delete this Level")}</Button>
      <Button onClick={(ev) => {ev.preventDefault(); eraseWorld()}}  disabled={!worldId} >{t("Delete this World")}</Button>
      <Button onClick={(ev) => {ev.preventDefault(); eraseProgress(); if(gameId) {navigateToGame(gameId)}}} >{t("Delete Everything")}</Button>
    </div>
    <Trans>
      <p>
        Deleting everything will delete all your proofs and your collected inventory! It's recommended
        to download your progress first.
      </p>
      <p>
        (Saves from other games are not deleted.)
      </p>
    </Trans>
    <div className='settings-buttons'>
      <Button onClick={(ev) => {ev.preventDefault(); downloadAndErase(); if(gameId) {navigateToGame(gameId)}}} >{t("Download & Delete everything")}</Button>
      <Button onClick={(ev) => {setPopup(null); ev.preventDefault()}} >{t("Cancel")}</Button>
    </div>
  </>
}
