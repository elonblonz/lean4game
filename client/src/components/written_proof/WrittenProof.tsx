import * as React from 'react'
import { useMemo, useState } from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { faCopy, faDownload, faFeatherPointed } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Markdown } from '../markdown'
import { Button } from '../button'
import { useGameTranslation } from '../../utils/translation'
import { proofAtom } from '../../store/editor-atoms'
import { gameInfoAtom, levelInfoAtom } from '../../store/query-atoms'
import { levelIdAtom, worldIdAtom } from '../../store/location-atoms'
import { ProofBlock, toLatexDocument, writtenProof } from './written-proof'
import '../../css/written_proof.css'

/** Sentences next to each other form one paragraph; sub-proofs are indented. `lead` starts
 * the first paragraph (as "*Proof.*" does in a book). */
function Block({ block, lead }: { block: ProofBlock, lead?: string }) {
  const parts: React.ReactNode[] = []
  let para: string[] = lead ? [lead] : []
  const flush = () => {
    if (para.length) parts.push(<Markdown key={parts.length}>{para.join(' ')}</Markdown>)
    para = []
  }
  for (const item of block.items) {
    if (typeof item === 'string') { para.push(item); continue }
    flush()
    parts.push(
      <div key={parts.length} className="written-proof-part">
        {item.label && <Markdown>{`**${item.label}**`}</Markdown>}
        <Block block={item} />
      </div>
    )
  }
  flush()
  return <>{parts}</>
}

/** The completed proof, written out as a mathematician would write it, with LaTeX export. */
export function WrittenProof() {
  const { t } = useTranslation()
  const { t: gT } = useGameTranslation()
  const [proof] = useAtom(proofAtom)
  const [{ data: levelInfo }] = useAtom(levelInfoAtom)
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [worldId] = useAtom(worldIdAtom)
  const [levelId] = useAtom(levelIdAtom)
  const [copied, setCopied] = useState(false)

  const written = useMemo(() => {
    if (!proof?.completed || !levelInfo) return undefined
    try {
      return writtenProof(proof, { title: gT(levelInfo.title ?? ''), descrText: gT(levelInfo.descrText ?? '') || null })
    } catch (e) {
      console.warn('written proof:', e)
      return undefined
    }
  }, [proof, levelInfo])

  if (!written) return null

  const latex = () => toLatexDocument([written], gT(gameInfo?.title ?? ''))
  const copy = () => {
    navigator.clipboard?.writeText(latex()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([latex()], { type: 'application/x-tex' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${worldId ?? 'proof'}-${levelId ?? ''}.tex`
    a.click()
    URL.revokeObjectURL(url)
  }

  return <section className="written-proof" aria-label={t('Your proof, written out')}>
    <h4><FontAwesomeIcon icon={faFeatherPointed} />&nbsp;{t('Your proof, written out')}</h4>
    <div className="written-proof-theorem">
      <Markdown>{`**${t('Theorem.')}** ${written.statement}`}</Markdown>
    </div>
    <div className="written-proof-body">
      <Block block={written.proof} lead={`*${t('Proof.')}*`} />
      <div className="written-proof-qed" aria-hidden="true">∎</div>
    </div>
    <div className="written-proof-actions">
      <Button onClick={copy} title={t('Copy the proof as a LaTeX document')}>
        <FontAwesomeIcon icon={faCopy} />&nbsp;{copied ? t('Copied!') : t('Copy LaTeX')}
      </Button>
      <Button onClick={download} title={t('Download the proof as a LaTeX file')}>
        <FontAwesomeIcon icon={faDownload} />&nbsp;{t('Download .tex')}
      </Button>
    </div>
  </section>
}
