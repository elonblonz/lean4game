import { Atom, atom, PrimitiveAtom } from "jotai";
import { Doc, InventoryOverview, InventoryTile, LevelInfo } from "../api/game-data";
import { gameIdAtom, levelIdAtom, worldIdAtom } from "./location-atoms";
import { atomWithQuery } from "jotai-tanstack-query";
import { progressAtom } from "./progress-atoms";
import { preferencesAtom } from "./preferences-atoms";
import { atomFamily } from "jotai-family";
import { levelInfoAtom } from "./query-atoms";

/** Valid inventory tabs */
export enum InventoryTab {
  theorem = "theorem",
  tactic = "tactic",
  definition = "definition",
}

export const inventoryOverviewAtom = atomWithQuery<InventoryOverview>((get) => {
  const gameId = get(gameIdAtom)
  return {
    queryKey: ['inventoryOverview', gameId],
    queryFn: async () => {
      const res = await fetch(`${window.location.origin}/data/${gameId}/inventory.json`)
      return res.json()
    },
  }
})

/** Doc atoms are looked up with a new `[type, name]` array on every render: compare by value,
 * or each render would create (and subscribe to) a new query, which re-renders, and so on. */
const sameDocKey = (a: [InventoryTab, string], b: [InventoryTab, string]) => a[0] === b[0] && a[1] === b[1]

export const docAtomFamily = atomFamily((key: [InventoryTab, string]) => atomWithQuery<Doc>((get) => {
  const gameId = get(gameIdAtom)
  const type = key[0]
  const name = key[1]
  return {
    queryKey: ['doc', gameId, type, name],
    queryFn: async () => {
      const res = await fetch(`${window.location.origin}/data/${gameId}/doc__${capitalizeFirstLetter(type)}__${name}.json`)
      return res.json()
    },
  }
}), sameDocKey)

export const docAtomLegacyFamily = atomFamily((key: [InventoryTab, string]) => atomWithQuery<Doc>((get) => {
  const gameId = get(gameIdAtom)
  const type = key[0]
  const name = key[1]
  return {
    queryKey: ['doc', gameId, type, name],
    queryFn: async () => {
      const caps = capitalizeFirstLetter(type)
      const legacy = caps == "Theorem" ? "Lemma" : caps
      const res = await fetch(`${window.location.origin}/data/${gameId}/doc__${legacy}__${name}.json`)
      return res.json()
    },
  }
}), sameDocKey)

function capitalizeFirstLetter(val: InventoryTab) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

/**
 * The user's unlocked inventory.
 * The setter adds the new constants to the existing inventory
 * ignoring duplicates.
 *  */
export const inventoryAtom = atom(
  get => {
    const progress = get(progressAtom)
    if (!progress) return null
    return progress.inventory
  },
  (get, set, val: string[]) => {
    const progress = get(progressAtom)
    if (!progress) return
    const newInventory = [...new Set([...progress.inventory, ...val])]
    set(progressAtom, { ...progress, inventory: newInventory })
  }
)

/** Curently selected tab */
export const inventoryTabAtom = atom(InventoryTab.tactic)

/** Currently selected subtabs for all tabs. The active one should be
 * accessed through `inventorySubtabAtom` below.
 */
export const inventorySubtabAtoms: Record<InventoryTab, PrimitiveAtom<string | null>> = {
  [InventoryTab.theorem]: atom(null as string | null),
  [InventoryTab.tactic]: atom(null as string | null),
  [InventoryTab.definition]: atom(null as string | null),
};

/** Change the subtab for theorems */
export const theoremSubtabAtom = atom(null, (get, set, val: string) => {
  set(inventorySubtabAtoms[InventoryTab.theorem], val)
})

/** Currently open doc entry */
export const selectedDocTileAtom = atom(null as InventoryTile | null)

/** Close the currently open doc entry */
export const closeDocAtom = atom(null, (get, set) => {
  set(selectedDocTileAtom, null)
})

/**
 * Where the inventory comes from: in a level, the level's info (which knows what is new,
 * disabled, etc. in this level); on the welcome page and in a world's introduction, the
 * game's inventory overview.
 */
export const inventorySourceAtom = atom<LevelInfo | InventoryOverview | undefined>(get => {
  const levelId = get(levelIdAtom)
  return levelId ? get(levelInfoAtom).data : get(inventoryOverviewAtom).data
})

/** The entire inventory, per tab */
export const inventoryTilesAtoms: Record<InventoryTab, Atom<InventoryTile[]>> = {
  [InventoryTab.theorem]: atom(get => get(inventorySourceAtom)?.lemmas ?? []),
  [InventoryTab.tactic]: atom(get => get(inventorySourceAtom)?.tactics ?? []),
  [InventoryTab.definition]: atom(get => get(inventorySourceAtom)?.definitions ?? []),
}

/** New items per tab */
export const inventoryTabNewTilesAtom: Atom<Record<InventoryTab, InventoryTile[]>> = atom( get => ({
  [InventoryTab.theorem]: get(inventoryTilesAtoms[InventoryTab.theorem]).filter(it => it.new),
  [InventoryTab.tactic]: get(inventoryTilesAtoms[InventoryTab.tactic]).filter(it => it.new),
  [InventoryTab.definition]: get(inventoryTilesAtoms[InventoryTab.definition]).filter(it => it.new),
}))

/** Recent items per tab */
export const inventoryTabRecentTilesAtom: Atom<Record<InventoryTab, InventoryTile[]>> = atom( get => {
  const worldId = get(worldIdAtom)
  const levelId = get(levelIdAtom)
  // Item(s) proved in the preceding level
  const recent = (it: InventoryTile) => !!levelId && it.world == worldId && it.level == levelId - 1
  return {
    [InventoryTab.theorem]: get(inventoryTilesAtoms[InventoryTab.theorem]).filter(recent),
    [InventoryTab.tactic]: get(inventoryTilesAtoms[InventoryTab.tactic]).filter(recent),
    [InventoryTab.definition]: get(inventoryTilesAtoms[InventoryTab.definition]).filter(recent),
  }
})

/** New items in the current tab */
export const inventoryCurrentTabNewTilesAtom = atom(get => {
  const tab = get(inventoryTabAtom)
  return get(inventoryTabNewTilesAtom)[tab]
})

/** Recent items in the current tab */
export const inventoryCurrentTabRecentTilesAtom = atom(get => {
  const tab = get(inventoryTabAtom)
  return get(inventoryTabRecentTilesAtom)[tab]
})

/** All subtabs of current tab */
export const inventorySubtabOptionsAtom = atom(get => {
  const tab = get(inventoryTabAtom)
  const tiles = get(inventoryTilesAtoms[tab])
  return [...new Set(tiles.map(item => item.category))]
})

/** Currently selected subtab */
export const inventorySubtabAtom = atom(
  get => {
    const tab = get(inventoryTabAtom)
    const options = get(inventorySubtabOptionsAtom)
    const subtab = get(inventorySubtabAtoms[tab])
    return subtab ?? options[0]
  },
  (get, set, val: string) => {
    const tab = get(inventoryTabAtom)
    set(inventorySubtabAtoms[tab], val)
  }
)

/** The currently visible inventory tiles */
export const currentInventoryTilesAtom = atom(get => {
  const tab = get(inventoryTabAtom)
  const subtab = get(inventorySubtabAtom)
  // Items the player has unlocked (by completing levels, or "Unlock this item!").
  const unlocked = get(inventoryAtom) ?? []
  const showLocked = get(preferencesAtom).showLockedInventory

  return get(inventoryTilesAtoms[tab])
    .map(tile => unlocked.includes(tile.name) ? {...tile, locked: false} : tile)
    .filter(it =>
        !it.hidden &&
        it.category == subtab &&
        (showLocked || !it.locked)
    )
})
