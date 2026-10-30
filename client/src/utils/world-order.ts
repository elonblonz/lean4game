/** The worlds of a game in playing order.
 *
 * The server sends `worlds.nodes` as a JSON object whose keys are sorted alphabetically, so
 * their order says nothing about the game. The order comes from the edges (prerequisite →
 * world): a topological sort, where among the worlds that are ready, the one that appears
 * first in the edges comes first (then alphabetical). Worlds in a cycle, or without edges,
 * come last.
 */
export function worldOrder(worlds?: { nodes: { [id: string]: unknown }, edges: string[][] }): string[] {
  if (!worlds) return []
  const ids = Object.keys(worlds.nodes)
  const firstSeen = new Map<string, number>()
  worlds.edges.flat().forEach((id, i) => { if (!firstSeen.has(id)) firstSeen.set(id, i) })
  const rank = (id: string) => firstSeen.get(id) ?? Infinity
  const byRank = (a: string, b: string) => rank(a) - rank(b) || a.localeCompare(b)

  const indegree = new Map(ids.map(id => [id, 0]))
  for (const [from, to] of worlds.edges) {
    if (indegree.has(from) && indegree.has(to)) indegree.set(to, indegree.get(to)! + 1)
  }
  const ready = ids.filter(id => indegree.get(id) === 0).sort(byRank)
  const order: string[] = []
  while (ready.length) {
    const id = ready.shift()!
    order.push(id)
    for (const [from, to] of worlds.edges) {
      if (from !== id || !indegree.has(to)) continue
      indegree.set(to, indegree.get(to)! - 1)
      if (indegree.get(to) === 0) { ready.push(to); ready.sort(byRank) }
    }
  }
  return order.concat(ids.filter(id => !order.includes(id)).sort(byRank))
}
