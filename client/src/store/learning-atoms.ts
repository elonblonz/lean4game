/**
 * @fileOverview The atoms of the learning aids: the written proof.
 */
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { inventoryOverviewAtom } from "./inventory-atoms"
import { tacticKey } from "../utils/written-proof"

// ---------------------------------------------------------------------------------------------
// Written proof

/** The "reads as" templates of the game's tactics (`TacticDoc intro reads "..."`), by tactic.
 * Empty for games that don't have any. From the game's inventory overview, which lists all
 * tactics, hidden ones too. */
export const readsAsAtom = atom(get => {
  const tactics = get(inventoryOverviewAtom).data?.tactics ?? []
  return new Map(tactics.filter(tile => tile.readsAs).map(tile => [tacticKey(tile.name), tile.readsAs!]))
})

/** Whether the written proof is expanded (per browser; a convenience). */
export const writtenProofOpenAtom = atomWithStorage('lean4game:writtenProofOpen', true, undefined, { getOnInit: true })
