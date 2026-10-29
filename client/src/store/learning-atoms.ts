/**
 * @fileOverview The atoms of the learning aids: the written proof, the glossary and the world
 * recap. Hints ("Show more help", replaying without hints) and notes are in `chat-atoms.ts`.
 */
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { atomFamily } from "jotai-family"
import { atomWithQuery } from "jotai-tanstack-query"
import { Doc, InventoryTile, LevelInfo } from "../api/game-data"
import { gameIdAtom, levelIdAtom, navigateAcrossWorldsAtom, worldIdAtom } from "./location-atoms"
import { inventoryAtom, inventoryOverviewAtom, InventoryTab, inventoryTilesAtoms } from "./inventory-atoms"
import { updateLevelProgressAtom } from "./progress-atoms"
import { gameInfoAtom } from "./query-atoms"
import { tacticKey } from "../utils/written-proof"

// ---------------------------------------------------------------------------------------------
// Written proof

/** The "reads as" templates of the game's tactics (`TacticDoc intro reads "..."`), by tactic,
 * used by the written proof for tactics it has no sentence of its own for. Empty for games that don't have any. From the game's inventory overview, which lists all
 * tactics, hidden ones too. */
export const readsAsAtom = atom(get => {
  const tactics = get(inventoryOverviewAtom).data?.tactics ?? []
  return new Map(tactics.filter(tile => tile.readsAs).map(tile => [tacticKey(tile.name), tile.readsAs!]))
})

// ---------------------------------------------------------------------------------------------
// Glossary

/** Whether the inventory panel shows the inventory or the glossary. */
export const inventoryViewAtom = atom<'inventory' | 'glossary'>('inventory')

/** An entry of the glossary: a doc entry of a tactic, theorem or definition. */
export interface GlossaryEntry {
  type: InventoryTab
  tile: InventoryTile
  /** Whether the player has not unlocked it yet. */
  locked: boolean
  doc?: Doc
}

const DOC_FILE_TYPE: Record<InventoryTab, string[]> = {
  // Older games call theorems "Lemma".
  [InventoryTab.theorem]: ['Theorem', 'Lemma'],
  [InventoryTab.tactic]: ['Tactic'],
  [InventoryTab.definition]: ['Definition'],
}

/** The tiles the glossary lists: all of the current inventory's (in a level: the level's,
 * otherwise the game's), except hidden ones. */
export const glossaryTilesAtom = atom(get => {
  const unlocked = get(inventoryAtom) ?? []
  return Object.values(InventoryTab).flatMap(type =>
    get(inventoryTilesAtoms[type])
      .filter(tile => !tile.hidden)
      .map(tile => ({ type, tile, locked: tile.locked && !unlocked.includes(tile.name) })))
})

/** The glossary's entries with their docs. The docs are fetched when the glossary is opened. */
export const glossaryQueryAtom = atomWithQuery<GlossaryEntry[]>(get => {
  const gameId = get(gameIdAtom)
  const entries = get(glossaryTilesAtom)
  const enabled = get(inventoryViewAtom) === 'glossary'
  return {
    queryKey: ['glossary', gameId, entries.map(e => `${e.type}:${e.tile.name}:${e.locked}`).join(',')],
    enabled,
    queryFn: async () => Promise.all(entries.map(async entry => {
      for (const type of DOC_FILE_TYPE[entry.type]) {
        try {
          const res = await fetch(`${window.location.origin}/data/${gameId}/doc__${type}__${entry.tile.name}.json`)
          if (res.ok) return { ...entry, doc: await res.json() as Doc }
        } catch { /* the entry is shown without its doc */ }
      }
      return entry
    })),
  }
})

// ---------------------------------------------------------------------------------------------
// World recap

/** The infos of all levels of a world (for the recap). */
export const worldLevelsAtomFamily = atomFamily((worldId: string) => atomWithQuery<LevelInfo[]>(get => {
  const gameId = get(gameIdAtom)
  const size = get(gameInfoAtom).data?.worldSize?.[worldId] ?? 0
  return {
    queryKey: ['worldLevels', gameId, worldId, size],
    enabled: size > 0,
    queryFn: async () => Promise.all(Array.from({ length: size }, async (_, i) => {
      const res = await fetch(`${window.location.origin}/data/${gameId}/level__${worldId}__${i + 1}.json`)
      return res.json()
    })),
  }
}))

/** Replay a level without hints: start it again with an empty proof (it stays completed, and its
 * notes are kept) and open it. */
export const replayWithoutHintsAtom = atom(null, (get, set, worldId: string, levelId: number) => {
  set(updateLevelProgressAtom, worldId, levelId, levelProgress => ({
    ...levelProgress, code: "", selections: [], help: [], helpCount: undefined, noHints: true
  }))
  // If the level is open already, its editor follows the saved code (see `useLeanConnection`).
  if (get(worldIdAtom) !== worldId || get(levelIdAtom) !== levelId) {
    set(navigateAcrossWorldsAtom, worldId, levelId)
  }
})
