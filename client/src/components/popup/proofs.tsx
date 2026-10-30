import * as React from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { faDownload } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '../button'
import { useGameTranslation } from '../../utils/translation'
import { gameInfoAtom } from '../../store/query-atoms'
import { journalAtom, JournalEntry } from '../../store/written-proofs-atoms'
import { downloadLatex, WrittenProofView } from '../written_proof/WrittenProof'
import { toLatexDocument } from '../written_proof/written-proof'
import { worldOrder } from '../../utils/world-order'
import { CircularProgress } from '@mui/material'

/** All the proofs completed in this game, written out, by world: to read again or download
 * as one LaTeX document. */
export function ProofsPopup() {
  const { t } = useTranslation()
  const { t: gT } = useGameTranslation()
  const [journal] = useAtom(journalAtom)
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)

  // In the order of the worlds, then of the levels. Worlds the game no longer has (proofs
  // saved by an older version) come last, each kept together.
  const worldIds = worldOrder(gameInfo?.worlds)
  const worldRank = (e: JournalEntry) => {
    const w = worldIds.indexOf(e.worldId)
    return w < 0 ? worldIds.length : w
  }
  const entries = Object.values(journal).sort((a, b) =>
    worldRank(a) - worldRank(b) || a.worldId.localeCompare(b.worldId) || a.levelId - b.levelId)
  const worldTitle = (id: string) => gT(gameInfo?.worlds?.nodes[id]?.title ?? id)
  const groups: { worldId: string, entries: JournalEntry[] }[] = []
  for (const e of entries) {
    if (groups[groups.length - 1]?.worldId !== e.worldId) groups.push({ worldId: e.worldId, entries: [] })
    groups[groups.length - 1].entries.push(e)
  }

  const download = () => {
    const proofs = entries.map(e => ({ ...e.proof, world: worldTitle(e.worldId) }))
    const title = gT(gameInfo?.title ?? '')
    downloadLatex(toLatexDocument(proofs, title ? `${title}: ${t('my proofs')}` : t('My proofs')), 'my-proofs.tex')
  }

  return <div className="proofs-popup">
    <h2>{t('My proofs')}</h2>
    {!gameInfo ? <CircularProgress /> : entries.length === 0 ?
      <p>{t('Proofs you complete appear here, written out as a mathematician would write them.')}</p> :
      <>
        <p>{t('Every proof you have completed, written out.')}</p>
        <div className="settings-buttons">
          <Button onClick={download} title={t('Download all your proofs as one LaTeX file')}>
            <FontAwesomeIcon icon={faDownload} />&nbsp;{t('Download all (.tex)')}
          </Button>
        </div>
        {groups.map(g => <section key={g.worldId}>
          <h3>{worldTitle(g.worldId)}</h3>
          {g.entries.map(e => <article key={e.levelId} className="written-proof">
            <h4>{t('Level {{n}}', { n: e.levelId })}: {e.proof.title}</h4>
            <WrittenProofView proof={e.proof} />
          </article>)}
        </section>)}
      </>
    }
  </div>
}
