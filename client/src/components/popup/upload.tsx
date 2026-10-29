/**
 * @fileOverview
*/
import * as React from 'react'
import { downloadProgress } from '../../utils/download'
import { Trans, useTranslation } from 'react-i18next'
import { popupAtom } from '../../store/popup-atoms'
import { useAtom } from 'jotai'
import { gameIdAtom } from '../../store/location-atoms'
import { progressAtom } from '../../store/progress-atoms'
import { validateGameProgress } from '../../store/progress-validate'
import { Button } from '../button'

/** Pop-up that is displaying the Game Info.
 *
 * `handleClose` is the function to close it again because it's open/closed state is
 * controlled by the containing element.
 */
export function UploadPopup () {
  let { t } = useTranslation()

  const [file, setFile] = React.useState<File>();
  const [error, setError] = React.useState<string | null>(null)
  const [gameId] = useAtom(gameIdAtom)
  const [gameProgress, setProgress] = useAtom(progressAtom)

  const [, setPopup] = useAtom(popupAtom)

  const handleFileChange = (e: any) => {
    if (e.target.files) {
      setFile(e.target.files[0])
      setError(null)
    }
  }

  /** Upload progress from a  */
  const uploadProgress = () => {
    if (!file) {return}
    const fileReader = new FileReader()
    fileReader.readAsText(file, "UTF-8")
    fileReader.onload = (e: any) => {
      let data: any
      try {
        data = JSON.parse(e.target.result.toString())
      } catch {
        setError(t("This file is not a saved game progress (it is not valid JSON)."))
        return
      }
      const progress = gameId ? validateGameProgress(data, gameId) : "No game is open."
      if (typeof progress === 'string') {
        setError(t(progress))
        return
      }
      setProgress(progress)
      setPopup(null) // close the popup
    }
    fileReader.onerror = () => setError(t("The file could not be read."))
  }

  return <>
    <h2>{t("Upload Saved Progress")}</h2>
    <Trans>
      <p>Select a JSON file with the saved game progress to load your progress.</p>

      <p><b>Warning:</b> This will delete your current game progress!
        Consider <a className="download-link" href="#" onClick={(ev) => { ev.preventDefault(); if (gameId) downloadProgress(gameId, gameProgress) }}>downloading your current progress</a> first!
      </p>
    </Trans>
    <p>
      <input type="file" onChange={handleFileChange}/>
    </p>

    {error && <p className="form-error" role="alert">{error}</p>}
    <Button onClick={uploadProgress} disabled={!file}>{t("Load selected file")}</Button>
  </>
}
