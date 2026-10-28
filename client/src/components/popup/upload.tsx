/**
 * @fileOverview
*/
import * as React from 'react'
import { downloadFile } from '../world_tree'
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

  /** Download the current progress (i.e. what's saved in the browser store) */
  const downloadProgress = (e: React.MouseEvent<HTMLAnchorElement, globalThis.MouseEvent>) => {
    e.preventDefault()
    downloadFile({
      data: JSON.stringify(gameProgress, null, 2),
      // e.g. `lean4game-g-local-game-2026-10-29.json`
      fileName: `lean4game-${gameId?.replaceAll('/', '-')}-${new Date().toISOString().slice(0, 10)}.json`,
      fileType: 'application/json',
    })
  }


  return <>
    <h2>{t("Upload Saved Progress")}</h2>
    <Trans>
      <p>Select a JSON file with the saved game progress to load your progress.</p>

      <p><b>Warning:</b> This will delete your current game progress!
        Consider <a className="download-link" onClick={(ev) => downloadProgress(ev)} >downloading your current progress</a> first!
      </p>
    </Trans>
    <p>
      <input type="file" onChange={handleFileChange}/>
    </p>

    {/* TODO: apperently clicking this redirects the user back to the landing page... */}
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button onClick={uploadProgress} disabled={!file}>{t("Load selected file")}</Button>
  </>
}
