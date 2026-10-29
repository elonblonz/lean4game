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
import { selectedStepAtom } from '../../store/chat-atoms'
import { mobileAtom } from '../../store/preferences-atoms'
import { gameInfoAtom, levelInfoAtom } from '../../store/query-atoms'
import { levelIdAtom, worldIdAtom } from '../../store/location-atoms'
import { Line, toLatexDocument, writtenProof } from './written-proof'
import '../../css/written_proof.css'

/** The lines of a written proof. Clicking a line selects the tactic step it comes from, and
 * the lines of the selected step are highlighted. */
function Lines({ lines }: { lines: Line[] }) {
  const { t } = useTranslation()
  const [selectedStep, setSelectedStep] = useAtom(selectedStepAtom)
  const [mobile] = useAtom(mobileAtom)
  const select = (step?: number) => (ev: React.MouseEvent) => {
    ev.stopPropagation()
    if (step === undefined) return
    const line = ev.currentTarget as HTMLElement
    setSelectedStep(selectedStep === step ? undefined : step)
    // Selecting a step scrolls the chat to that step's hints: keep this line in view instead,
    // and show the step in the proof (on a phone the proof is above, so don't jump there).
    setTimeout(() => {
      if (!mobile) document.querySelector(`.proof .step-${step}`)?.scrollIntoView({ block: 'nearest' })
      line.scrollIntoView({ block: 'nearest' })
    }, 50)
  }
  const selected = (step?: number) => step !== undefined && step === selectedStep ? ' selected' : ''

  return <>{lines.map((l, i) => {
    switch (l.kind) {
      case 'fact':
        return <div key={i} className={`written-proof-fact${selected(l.step)}`} onClick={select(l.step)}
            title={t('Show the step of your proof this comes from')}>
          <span className="written-proof-n">{l.n}.</span>
          <span className="written-proof-text"><Markdown>{l.text}</Markdown></span>
          <span className="written-proof-why"><Markdown>{`[${l.why}]`}</Markdown></span>
        </div>
      case 'note':
        return <div key={i} className={`written-proof-note${selected(l.step)}`} onClick={select(l.step)}>
          <Markdown>{l.text}</Markdown>
        </div>
      case 'block':
        return <div key={i} className="written-proof-block">
          {l.header && <div className={`written-proof-header${selected(l.step)}`} onClick={select(l.step)}>
            <Markdown>{l.header}</Markdown>
          </div>}
          <Lines lines={l.lines} />
        </div>
    }
  })}</>
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
      return writtenProof(proof, {
        title: gT(levelInfo.title ?? ''),
        descrText: gT(levelInfo.descrText ?? '') || null,
        theorems: levelInfo.lemmas.map(l => ({ name: l.name, displayName: l.displayName })),
      })
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
      <Markdown>{`*${t('Proof.')}*`}</Markdown>
      <Lines lines={written.lines} />
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
