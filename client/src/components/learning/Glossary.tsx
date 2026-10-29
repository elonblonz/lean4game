import * as React from 'react'
import { useMemo, useState } from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { CircularProgress } from '@mui/material'
import { Markdown } from '../markdown'
import { useGameTranslation } from '../../utils/translation'
import { GlossaryEntry, glossaryQueryAtom, glossaryTilesAtom } from '../../store/learning-atoms'
import { InventoryTab } from '../../store/inventory-atoms'

const TYPE_TITLE: Record<InventoryTab, string> = {
  [InventoryTab.tactic]: "Tactics",
  [InventoryTab.theorem]: "Theorems",
  [InventoryTab.definition]: "Definitions",
}

const TYPE_LABEL: Record<InventoryTab, string> = {
  [InventoryTab.tactic]: "Tactic",
  [InventoryTab.theorem]: "Theorem",
  [InventoryTab.definition]: "Definition",
}

/** Whether every word of `query` occurs in the entry's names, category, statement or doc. */
function matches(entry: GlossaryEntry, query: string, translate: (s: string) => string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = [
    entry.tile.name, entry.tile.displayName, entry.tile.category,
    entry.doc?.statement ?? '', translate(entry.doc?.content ?? ''),
  ].join('\n').toLowerCase()
  return words.every(word => text.includes(word))
}

/**
 * A searchable reference of the game's tactics, theorems and definitions (their `TacticDoc`,
 * `TheoremDoc` and `DefinitionDoc` entries), next to the inventory. It lists what the player
 * has unlocked, and optionally what is still to come.
 */
export function Glossary() {
  const { t } = useTranslation()
  const { t: gT } = useGameTranslation()
  const [tiles] = useAtom(glossaryTilesAtom)
  const [{ data: entries, isLoading }] = useAtom(glossaryQueryAtom)
  const [query, setQuery] = useState('')
  const [showLocked, setShowLocked] = useState(false)

  // Until the docs are loaded, search the names only.
  const all: GlossaryEntry[] = entries ?? tiles
  const results = useMemo(() => all
      .filter(entry => (showLocked || !entry.locked) && matches(entry, query, s => gT(s)))
      .sort((a, b) => a.tile.displayName.localeCompare(b.tile.displayName)),
    [all, query, showLocked, gT])

  return <div className="glossary">
    <div className="glossary-controls">
      <input type="search" className="glossary-search" value={query}
        placeholder={t("Search tactics, theorems and definitions")}
        aria-label={t("Search the glossary")}
        onChange={ev => setQuery(ev.target.value)}
        onKeyDown={ev => { if (ev.key === 'Escape' && query) { ev.stopPropagation(); setQuery('') } }} />
      <label className="glossary-locked">
        <input type="checkbox" checked={showLocked} onChange={ev => setShowLocked(ev.target.checked)} />
        {t("Include items not unlocked yet")}
      </label>
    </div>
    <div className="glossary-count" role="status">
      {t("{{count}} entries", { count: results.length })}
      {isLoading && <CircularProgress size="1em" />}
    </div>
    <div className="glossary-list">
      {Object.values(InventoryTab).map(type => {
        const ofType = results.filter(entry => entry.type === type)
        if (!ofType.length) return null
        return <section key={type} aria-label={t(TYPE_TITLE[type])}>
          <h3>{t(TYPE_TITLE[type])}</h3>
          {ofType.map(entry => <GlossaryItem key={`${type}-${entry.tile.name}`} entry={entry} loading={!entries} />)}
        </section>
      })}
    </div>
  </div>
}

function GlossaryItem({ entry, loading }: { entry: GlossaryEntry, loading: boolean }) {
  const { t } = useTranslation()
  const { t: gT } = useGameTranslation()
  const { tile, doc, locked } = entry
  return <details className={`glossary-entry${locked ? ' locked' : ''}`}>
    <summary>
      <span className="glossary-name">{tile.displayName}</span>
      <span className="glossary-type">{t(TYPE_LABEL[entry.type])}{tile.category && tile.category !== "📖︎" ? ` · ${tile.category}` : ''}</span>
      {locked && <span className="glossary-type">{t("Not unlocked yet")}</span>}
    </summary>
    {doc?.statement && <p><code>{doc.statement}</code></p>}
    {doc ? <Markdown>{gT(doc.content ?? '')}</Markdown> : loading && <p className="glossary-missing">{t("Loading…")}</p>}
    {doc?.readsAs && <p className="glossary-reads-as">{t("In a written proof:")} <em>{gT(doc.readsAs)}</em></p>}
  </details>
}
