import * as React from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { levelNotesAtom } from '../../store/chat-atoms'

/** The player's notes on the current level, saved with the progress. */
export function LevelNotes() {
  const { t } = useTranslation()
  const [notes, setNotes] = useAtom(levelNotesAtom)
  return <details className="level-notes" open={notes ? true : undefined}>
    <summary>{t("My notes")}</summary>
    <NotesField value={notes} onChange={setNotes} />
  </details>
}

/** A text field for notes on a level. */
export function NotesField({ value, onChange, label }: { value: string, onChange: (notes: string) => void, label?: string }) {
  const { t } = useTranslation()
  return <textarea className="notes-field" value={value} rows={3}
    aria-label={label ?? t("My notes")}
    placeholder={t("What did you learn? What do you want to remember?")}
    onChange={ev => onChange(ev.target.value)} />
}
