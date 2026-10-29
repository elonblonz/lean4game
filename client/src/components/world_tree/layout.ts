/**
 * @fileOverview The geometry of the world map: where worlds and levels are drawn.
 */
import cytoscape, { LayoutOptions } from 'cytoscape'
// @ts-ignore: no types
import klay from 'cytoscape-klay'
import { GameInfo } from '../../api/game-data'

// Settings for the world tree
cytoscape.use( klay )

export const r = 16              // radius of a level
export const s = 10              // global scale
export const lineWidth = 10      //
export const ds = .75  // scale the resulting svg image
export const dsMobile = 1.25  // larger on touch screens, so that level icons are big enough to tap

export const NMIN = 5   // min. worldsize
export const NLABEL = 8 // max. world size to display label below the world
export const NMAX = 16  // max. world size. Level icons start spiraling out if the world has more levels.
export const NSPIRAL = 12 // world size if NMAX has been passed and need to spiral.

export const MINFONT = 12

// colours (CSS tokens, see `css/tokens.css`)
export const grey = 'var(--clr-world-locked)'
export const lightgrey = 'var(--clr-level-locked)'
export const green = 'var(--clr-world-completed)' // 118a11?
export const lightgreen = 'var(--clr-level-completed)'
export const blue = 'var(--clr-world-unlocked)'
export const darkgrey = 'var(--clr-world-label-locked)'
export const darkgreen = 'var(--clr-world-label-completed)'
export const darkblue = 'var(--clr-world-label-unlocked)'


/** The position of the icon of level `level` around its world at `position`. */
export function levelIconPosition(position: cytoscape.Position, level: number, worldSize: number | undefined) {
  const N = Math.max(worldSize ?? NMIN, NMIN)

  // divide circle into `N+2` equal pieces.
  // only for non-spiraling case
  const beta = 2 * Math.PI / Math.min(N+2, ((N < (NMAX+1) ? NMAX : NSPIRAL)+1))

  // We want distance between two level icons to be `2.2*r`, therefore:
  // Sinus-Satz: (1.1*r) / sin(β/2) = R / sin(π/2)
  let R = 1.1 * r / Math.sin(beta/2)

  /** In the spiral, the angle `β` should decrease to avoid big gaps between levels.
   * This is a simplified function, which has little mathematical foundation, but
   * works fine in tests up to `N=30`.
   */
  function betaSpiral(level: number) {
    return 2 * Math.PI / ((NSPIRAL+1) + 2 * Math.max(0, (level-2)) / (NSPIRAL+1))
  }

  const x = N < (NMAX+1) ?
    // normal case
    s * position.x + Math.sin(level * beta) * R :
    // spiraling case
    s * position.x + Math.sin(level * betaSpiral(level)) * (R + 2*r*(level-1)/(NSPIRAL+1))
  const y = N < (NMAX+1) ?
    // normal case
    s * position.y - Math.cos(level * beta) * R :
    // spiraling case
    s * position.y - Math.cos(level * betaSpiral(level)) * (R + 2*r*(level-1)/(NSPIRAL+1))
  return {x, y}
}

/** The radius of the circle of a world, inside the ring of its levels' icons. */
export function worldIconRadius(worldSize: number | undefined) {
  // See level icons. Match radius computed there minus `1.2*r`
  const N = Math.max(worldSize ?? NMIN, NMIN)
  const betaHalf = Math.PI / Math.min(N+2, ((N < (NMAX+1) ? NMAX : NSPIRAL) + 1))
  let R = 1.1 * r / Math.sin(betaHalf) - 1.2 * r
  return R
}

/** The world map's padding around the worlds, room for their levels' icons. */
export function worldTreePadding() {
  // See `levelIconPosition` for calculation of the radius. Use the max. radius for calculating the padding
  // TODO: Is there a way to determine padding according to the drawn objects?
  let R = 1.1 * r / Math.sin(Math.PI / (NMAX+1))
  return R + 2.1*r
}

export type WorldLayout = {
  nodes: {[id: string]: {position: cytoscape.Position, data: {id: string, title: string}}},
  bounds?: cytoscape.BoundingBox12 & cytoscape.BoundingBoxWH,
}

/** Lay out the graph of worlds. */
export function computeWorldLayout(worlds: NonNullable<GameInfo['worlds']>): WorldLayout {
  let elements: cytoscape.ElementDefinition[] = []
  for (let id in worlds.nodes) {
    elements.push({ data: { id: id, title: worlds.nodes[id].title } })
  }
  for (let edge of worlds.edges) {
    elements.push({
      data: {
        id: edge[0] + " --edge-to--> " + edge[1],
        source: edge[0],
        target: edge[1]
      }
    })
  }
  const cy = cytoscape({
    container: null,
    elements,
    headless: true,
    styleEnabled: false
  })

  cy.layout({name: "klay", klay: {direction: "DOWN", nodePlacement: "LINEAR_SEGMENTS"}} as LayoutOptions).run()

  let nodes: WorldLayout['nodes'] = {}
  cy.nodes().forEach(node => {
    nodes[node.id()] = {
      position: node.position(),
      data: node.data()
    }
  })
  const bounds = cy.nodes().boundingBox()
  return { nodes, bounds }
}


