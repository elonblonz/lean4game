import { GameProgress } from './progress-types'

const isObject = (x: any) => typeof x === 'object' && x !== null && !Array.isArray(x)

/**
 * Check uploaded progress before it replaces the saved progress. Accepts a downloaded game
 * progress, or the whole storage format (`{games: {<gameId>: ...}}`) for `gameId`.
 * Returns the progress to save, or an error message (in English, to be translated).
 */
export function validateGameProgress(data: any, gameId: string): GameProgress | string {
  if (isObject(data) && isObject(data.games)) {
    if (!(gameId in data.games)) return "This file does not contain progress for this game."
    data = data.games[gameId]
  }
  if (!isObject(data)) return "This file does not contain game progress."
  if (!Array.isArray(data.inventory) || !data.inventory.every((s: any) => typeof s === 'string')) {
    return "This file does not contain game progress."
  }
  if (!isObject(data.data)) return "This file does not contain game progress."
  for (const world of Object.values<any>(data.data)) {
    if (!isObject(world)) return "This file does not contain game progress."
    for (const [key, level] of Object.entries<any>(world)) {
      if (key === 'readIntro') continue
      if (!isObject(level) || (level.code !== undefined && typeof level.code !== 'string')) {
        return "This file does not contain game progress."
      }
    }
  }
  const difficulty = Number.isInteger(data.difficulty) && data.difficulty >= 0 && data.difficulty <= 2
    ? data.difficulty : 2
  return {
    ...data,
    difficulty,
    readIntro: !!data.readIntro,
  }
}
