import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { gameIdAtom } from './location-atoms'
import type { WrittenProof } from '../components/written_proof/written-proof'

/** A completed level's proof, written out (see `components/written_proof`). */
export interface JournalEntry {
  worldId: string
  levelId: number
  proof: WrittenProof
}

/** Per game, the written proofs by `${worldId}/${levelId}`. */
type Journal = Record<string, Record<string, JournalEntry>>

const journalStorageAtom = atomWithStorage<Journal>('written_proofs', {}, undefined, { getOnInit: true })

export type JournalUpdate =
  | { save: JournalEntry }
  | { removeLevel: { worldId: string, levelId: number } }
  | { removeWorld: string }
  | { clear: true }

/** The written proofs of the current game: every level completed since this was added. Saved in
 * the browser like the progress, and erased with it. */
export const journalAtom = atom(
  get => get(journalStorageAtom)[get(gameIdAtom) ?? ''] ?? {},
  (get, set, update: JournalUpdate) => {
    const gameId = get(gameIdAtom)
    if (!gameId) return
    const all = get(journalStorageAtom)
    const entries = { ...(all[gameId] ?? {}) }
    if ('save' in update) {
      const key = `${update.save.worldId}/${update.save.levelId}`
      if (JSON.stringify(entries[key]) === JSON.stringify(update.save)) return
      entries[key] = update.save
    } else if ('removeLevel' in update) {
      delete entries[`${update.removeLevel.worldId}/${update.removeLevel.levelId}`]
    } else if ('removeWorld' in update) {
      for (const key of Object.keys(entries)) if (entries[key].worldId === update.removeWorld) delete entries[key]
    } else {
      for (const key of Object.keys(entries)) delete entries[key]
    }
    set(journalStorageAtom, { ...all, [gameId]: entries })
  }
)
