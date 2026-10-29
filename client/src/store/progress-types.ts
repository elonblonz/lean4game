export interface Selection {
  selectionStartLineNumber: number,
  selectionStartColumn: number,
  positionLineNumber: number
  positionColumn: number
}
export interface LevelProgress {
  code: string,
  selections: Selection[],
  completed: boolean,
  help: number[], // A set of rows where hidden hints have been displayed
  /** How many of a row's hidden hints have been revealed, one by one ("hint ladder"). Rows in
   * `help` that are missing here (progress saved by older versions) show all their hidden hints. */
  helpCount?: {[row: number]: number},
  /** Replaying the level without hints (see the world recap). */
  noHints?: boolean,
  /** The player's own notes on the level. */
  notes?: string,
}

export interface WorldProgress {
  [level: number]: LevelProgress,
  readIntro: boolean
}

export interface GameProgress {
  inventory: string[],
  difficulty: number,
  readIntro: boolean,
  data: { [world: string] : WorldProgress },
  typewriterMode?: boolean
}

/**
 * Currently we have three difficulties:
 *
 *   | lock tactics | lock levels |
 * --|--------------|-------------|
 * 0 |      no      |      no     |
 * 1 |     yes      |      no     |
 * 2 |     yes      |     yes     |
 */
export const DEFAULT_DIFFICULTY = 2

/** The progress made on all lean4-games */
export interface Progress {
  games: {[game: string]: GameProgress}
}
