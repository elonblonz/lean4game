import { atom } from "jotai"
import { levelProgressAtom, progressAtom, defaultLevelProgress } from "./progress-atoms"
import { GameHint } from "../api/rpc_api"

/** User read the game introduction. Only relevant on mobile */
export const readGameIntroAtom = atom(
  get => {
    const progress = get(progressAtom)
    if (!progress) return false
    return progress.readIntro
  },
  (get, set, val: boolean) => {
    const progress = get(progressAtom)
    if (!progress) return
    set(progressAtom, { ...progress, readIntro: val })
  }
)

/**
 * "Show more help": how many of each proof step's hidden hints the player has revealed. They
 * are revealed one at a time, in the order the game defines them (e.g. the idea, then the next
 * step, then the specific move). A step missing from the map has none revealed; `Infinity`
 * means all of them (progress saved before hints were revealed one by one).
 *
 * Saved in the level's progress: `help` lists the steps with revealed hints (as before),
 * `helpCount` how many.
 */
export const helpAtom = atom(
  get => {
    const levelProgress = get(levelProgressAtom)
    const counts = levelProgress?.helpCount ?? {}
    return new Map<number, number>((levelProgress?.help ?? []).map(step =>
      [step, counts[step] ?? Infinity]))
  },
  (get, set, val: Map<number, number>) => {
    const levelProgress = get(levelProgressAtom)
    if (levelProgress == null) return
    const shown = [...val].filter(([, n]) => n > 0)
    set(levelProgressAtom, { ...levelProgress,
      help: shown.map(([step]) => step),
      helpCount: Object.fromEntries(shown.filter(([, n]) => Number.isFinite(n))),
    })
  }
)

/** Whether the current level is being replayed without hints (see the world recap). */
export const noHintsAtom = atom(
  get => get(levelProgressAtom)?.noHints ?? false,
  (get, set, val: boolean) => {
    const levelProgress = get(levelProgressAtom)
    if (levelProgress == null) return
    set(levelProgressAtom, { ...levelProgress, noHints: val || undefined })
  }
)

/** The player's notes on the current level. */
export const levelNotesAtom = atom(
  get => get(levelProgressAtom)?.notes ?? "",
  (get, set, val: string) => {
    const levelProgress = get(levelProgressAtom)
    if (levelProgress == null) return
    set(levelProgressAtom, { ...levelProgress, notes: val || undefined })
  }
)

/**
 * When deleting the proof, we want to keep to old messages around until
 * a new proof has been entered. e.g. to consult messages coming from dead ends
 */
export const deletedChatAtom = atom<GameHint[]>([])

/** Context to keep highlight selected proof step and corresponding chat messages. */
export const selectedStepAtom = atom<number>()
