import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { faBook, faCopy, faDownload, faFeatherPointed } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Markdown } from '../markdown'
import { Button } from '../button'
import { downloadFile } from '../world_tree'
import { useGameTranslation } from '../../utils/translation'
import { proofAtom } from '../../store/editor-atoms'
import { selectedStepAtom } from '../../store/chat-atoms'
import { mobileAtom } from '../../store/preferences-atoms'
import { gameInfoAtom, levelInfoAtom } from '../../store/query-atoms'
import { gameIdAtom, levelIdAtom, worldIdAtom } from '../../store/location-atoms'
import { popupAtom, PopupType } from '../../store/popup-atoms'
import { journalAtom } from '../../store/written-proofs-atoms'
import { Line, TheoremInfo, WrittenProof as Written, toLatexDocument, writtenProof } from './written-proof'
import '../../css/written_proof.css'

/** The lines of a written proof. If `interactive`, clicking a line selects the tactic step it
 * comes from, and the lines of the selected step are highlighted. */
export function Lines({ lines, interactive = false }: { lines: Line[], interactive?: boolean }) {
  const { t } = useTranslation()
  const [selectedStep, setSelectedStep] = useAtom(selectedStepAtom)
  const [mobile] = useAtom(mobileAtom)
  const select = (step?: number) => (ev: React.MouseEvent) => {
    if (!interactive || step === undefined) return
    ev.stopPropagation()
    const line = ev.currentTarget as HTMLElement
    setSelectedStep(selectedStep === step ? undefined : step)
    // Selecting a step scrolls the chat to that step's hints: keep this line in view instead,
    // and show the step in the proof (on a phone the proof is above, so don't jump there).
    setTimeout(() => {
      if (!mobile) document.querySelector(`.proof .step-${step}`)?.scrollIntoView({ block: 'nearest' })
      line.scrollIntoView({ block: 'nearest' })
    }, 50)
  }
  const cls = (base: string, step?: number) =>
    base + (interactive ? ' interactive' : '') + (interactive && step !== undefined && step === selectedStep ? ' selected' : '')

  return <>{lines.map((l, i) => {
    switch (l.kind) {
      case 'fact':
        return <div key={i} className={cls('written-proof-fact', l.step)} onClick={select(l.step)}
            title={interactive ? t('Show the step of your proof this comes from') : undefined}>
          <span className="written-proof-n">{l.n}.</span>
          <span className="written-proof-text"><Markdown>{l.text}</Markdown></span>
          <span className="written-proof-why"><Markdown>{`[${l.why}]`}</Markdown></span>
        </div>
      case 'note':
        return <div key={i} className={cls('written-proof-note', l.step)} onClick={select(l.step)}>
          <Markdown>{l.text}</Markdown>
        </div>
      case 'block':
        return <div key={i} className="written-proof-block">
          {l.header && <div className={cls('written-proof-header', l.step)} onClick={select(l.step)}>
            <Markdown>{l.header}</Markdown>
          </div>}
          <Lines lines={l.lines} interactive={interactive} />
        </div>
    }
  })}</>
}

/** A theorem and its proof, written out. */
export function WrittenProofView({ proof, interactive = false }: { proof: Written, interactive?: boolean }) {
  const { t } = useTranslation()
  return <>
    <div className="written-proof-theorem">
      <Markdown>{`**${t('Theorem.')}** ${proof.statement}`}</Markdown>
    </div>
    <div className="written-proof-body">
      <Markdown>{`*${t('Proof.')}*`}</Markdown>
      <Lines lines={proof.lines} interactive={interactive} />
      <div className="written-proof-qed" aria-hidden="true">∎</div>
    </div>
  </>
}

/** Save a LaTeX document. */
export function downloadLatex(latex: string, fileName: string) {
  downloadFile({ data: latex, fileName, fileType: 'application/x-tex' })
}

/** The statements of theorems, from their docs, fetched once per game. */
const statements = new Map<string, Promise<string | undefined>>()
function fetchStatement(gameId: string, name: string): Promise<string | undefined> {
  const key = `${gameId}/${name}`
  if (!statements.has(key)) statements.set(key,
    fetch(`${window.location.origin}/data/${gameId}/doc__Theorem__${name}.json`)
      .then(res => res.ok ? res.json() : undefined)
      .then(doc => typeof doc?.statement === 'string' ? doc.statement : undefined)
      .catch(() => undefined))
  return statements.get(key)!
}

/** The completed proof, written out as a mathematician would write it, with LaTeX export. */
export function WrittenProof() {
  const { t } = useTranslation()
  const { t: gT } = useGameTranslation()
  const [proof] = useAtom(proofAtom)
  const [{ data: levelInfo }] = useAtom(levelInfoAtom)
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [gameId] = useAtom(gameIdAtom)
  const [worldId] = useAtom(worldIdAtom)
  const [levelId] = useAtom(levelIdAtom)
  const [, setJournal] = useAtom(journalAtom)
  const [, setPopup] = useAtom(popupAtom)
  const [copied, setCopied] = useState(false)
  // What the theorems used say, once their docs are loaded.
  const [known, setKnown] = useState<Record<string, string>>({})

  const write = (statementOf: Record<string, string>) => {
    if (!proof?.completed || !levelInfo) return undefined
    const theorems: TheoremInfo[] = levelInfo.lemmas.map(l => ({ name: l.name, displayName: l.displayName, statement: statementOf[l.name] }))
    try {
      return writtenProof(proof, { title: gT(levelInfo.title ?? ''), descrText: gT(levelInfo.descrText ?? '') || null, theorems })
    } catch (e) {
      console.warn('written proof:', e)
      return undefined
    }
  }
  const written = useMemo(() => write(known), [proof, levelInfo, known])

  // Load the statements of the theorems the proof uses, then write it again with them.
  useEffect(() => {
    const missing = (written?.theorems ?? []).filter(n => !(n in known))
    if (!gameId || !missing.length) return
    let cancelled = false
    Promise.all(missing.map(n => fetchStatement(gameId, n).then(s => [n, s ?? ''] as const))).then(found => {
      if (!cancelled) setKnown(k => ({ ...k, ...Object.fromEntries(found) }))
    })
    return () => { cancelled = true }
  }, [gameId, written?.theorems?.join()])

  // Keep the proof for the journal of all proofs.
  useEffect(() => {
    if (written && worldId && levelId !== undefined)
      setJournal({ save: { worldId, levelId, proof: written } })
  }, [written, worldId, levelId])

  if (!written) return null

  const latex = () => toLatexDocument([written], gT(gameInfo?.title ?? ''))
  const copy = () => {
    navigator.clipboard?.writeText(latex()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return <section className="written-proof" aria-label={t('Your proof, written out')}>
    <h4><FontAwesomeIcon icon={faFeatherPointed} />&nbsp;{t('Your proof, written out')}</h4>
    <WrittenProofView proof={written} interactive={true} />
    <div className="written-proof-actions">
      <Button onClick={copy} title={t('Copy the proof as a LaTeX document')}>
        <FontAwesomeIcon icon={faCopy} />&nbsp;{copied ? t('Copied!') : t('Copy LaTeX')}
      </Button>
      <Button onClick={() => downloadLatex(latex(), `${worldId ?? 'proof'}-${levelId ?? ''}.tex`)}
          title={t('Download the proof as a LaTeX file')}>
        <FontAwesomeIcon icon={faDownload} />&nbsp;{t('Download .tex')}
      </Button>
      <Button onClick={() => setPopup(PopupType.proofs)} title={t('All the proofs you have completed, written out')}>
        <FontAwesomeIcon icon={faBook} />&nbsp;{t('All my proofs')}
      </Button>
    </div>
  </section>
}
