import { GameProgress } from '../store/progress-types'

/** Download a file containing `data` */
export const downloadFile = ({ data, fileName, fileType } :
  { data: string
    fileName: string
    fileType: string}) => {
  const blob = new Blob([data], { type: fileType })
  const a = document.createElement('a')
  a.download = fileName
  a.href = window.URL.createObjectURL(blob)
  const clickEvt = new MouseEvent('click', {
    view: window,
    bubbles: true,
    cancelable: true,
  })
  a.dispatchEvent(clickEvt)
  a.remove()
  // Free the file once the browser has taken it.
  setTimeout(() => window.URL.revokeObjectURL(a.href), 10_000)
}

/** Download the current progress (i.e. what's saved in the browser store) */
export function downloadProgress(gameId: string, gameProgress: GameProgress | null) {
  downloadFile({
    data: JSON.stringify(gameProgress, null, 2),
    // e.g. `lean4game-g-local-game-2026-10-29.json`
    fileName: `lean4game-${gameId.replaceAll('/', '-')}-${new Date().toISOString().slice(0, 10)}.json`,
    fileType: 'application/json',
  })
}
