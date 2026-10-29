import * as React from 'react'
import { useMemo } from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { Markdown } from '../markdown'
import { useGameTranslation } from '../../utils/translation'
import { proofAtom } from '../../store/proof-atoms'
import { readsAsAtom, writtenProofOpenAtom } from '../../store/learning-atoms'
import { selectedStepAtom } from '../../store/chat-atoms'
import { writtenProof } from '../../utils/written-proof'

/**
 * The player's proof so far, translated line by line into English with the "reads as"
 * templates of the game's tactics (`TacticDoc intro reads "..."`). A step whose tactic has no
 * template is shown as code. Not shown at all in games without templates.
 */
export function WrittenProof() {
  const { t } = useTranslation()
  const { t: gT } = useGameTranslation()
  const [proof] = useAtom(proofAtom)
  const [readsAs] = useAtom(readsAsAtom)
  const [open, setOpen] = useAtom(writtenProofOpenAtom)
  const [selectedStep, setSelectedStep] = useAtom(selectedStepAtom)

  const lines = useMemo(() => writtenProof(proof, readsAs, `*${t("nothing")}*`, s => gT(s)),
    [proof, readsAs, t, gT])

  if (readsAs.size == 0) return null

  return <details className="written-proof" open={open}
      onToggle={ev => setOpen((ev.currentTarget as HTMLDetailsElement).open)}>
    <summary>{t("Written proof")}</summary>
    {lines.length == 0 ?
      <p className="written-proof-empty">{t("Your proof, in words, appears here as you write it.")}</p> :
      <ol className="written-proof-lines">
        {lines.map(line =>
          <li key={line.step}
              className={`written-proof-line step-${line.step}${line.text === null ? ' untranslated' : ''}${selectedStep == line.step ? ' selected' : ''}`}
              style={{ marginInlineStart: `${line.depth * 1.25}em` }}
              title={line.command}
              onClick={() => setSelectedStep(selectedStep == line.step ? undefined : line.step)}>
            {line.text !== null ?
              <Markdown>{line.text}</Markdown> :
              <code>{line.command}</code>}
          </li>
        )}
      </ol>
    }
    {proof?.completed && lines.length > 0 && <p className="written-proof-qed">∎</p>}
  </details>
}
