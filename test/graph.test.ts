import { describe, it, expect } from 'vitest'
import { computeGraph } from '../electron/git/graph'

describe('computeGraph', () => {
  it('places a linear history in a single lane', () => {
    // A -> B -> C (A newest). parents point to older.
    const g = computeGraph([
      { hash: 'A', parents: ['B'] },
      { hash: 'B', parents: ['C'] },
      { hash: 'C', parents: [] },
    ])
    expect(g.nodes.map((n) => n.lane)).toEqual([0, 0, 0])
    expect(g.nodes.map((n) => n.row)).toEqual([0, 1, 2])
    expect(g.laneCount).toBe(1)
    // edges: A->B, B->C
    expect(g.edges).toContainEqual({ fromRow: 0, fromLane: 0, toRow: 1, toLane: 0 })
    expect(g.edges).toContainEqual({ fromRow: 1, fromLane: 0, toRow: 2, toLane: 0 })
  })

  it('opens a new lane for a feature branch and merges back', () => {
    // M(merge, row0) parents [A, F]; A(row1) parent C; F(row2, feature) parent C; C(row3) root
    const g = computeGraph([
      { hash: 'M', parents: ['A', 'F'] },
      { hash: 'A', parents: ['C'] },
      { hash: 'F', parents: ['C'] },
      { hash: 'C', parents: [] },
    ])
    const lane = (h: string) => g.nodes.find((n) => n.hash === h)!.lane
    expect(lane('M')).toBe(0)
    expect(lane('A')).toBe(0) // first parent continues merge lane
    expect(lane('F')).toBe(1) // second parent gets a new lane
    expect(g.laneCount).toBe(2)
    // merge has edges to both parents
    expect(g.edges).toContainEqual({ fromRow: 0, fromLane: 0, toRow: 1, toLane: 0 })
    expect(g.edges).toContainEqual({ fromRow: 0, fromLane: 0, toRow: 2, toLane: 1 })
  })

  it('drops edges to parents outside the loaded window', () => {
    const g = computeGraph([{ hash: 'A', parents: ['OFFSCREEN'] }])
    expect(g.nodes).toHaveLength(1)
    expect(g.edges).toHaveLength(0)
  })

  it('keeps lanes compact when parents are outside the window (filtered/sparse history)', () => {
    // Author/message filters yield non-contiguous commits: each one's parent is
    // NOT in the loaded set. Lanes must collapse back to 0, not grow to N — else
    // the graph balloons sideways and pushes commit messages off-screen.
    const g = computeGraph([
      { hash: 'A', parents: ['x1'] },
      { hash: 'B', parents: ['x2'] },
      { hash: 'C', parents: ['x3'] },
      { hash: 'D', parents: [] },
    ])
    expect(g.laneCount).toBe(1)
    expect(g.nodes.map((n) => n.lane)).toEqual([0, 0, 0, 0])
    expect(g.edges).toHaveLength(0)
  })
})
