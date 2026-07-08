import type { RawCommit } from './types'

export interface GraphNode {
  hash: string
  row: number
  lane: number
}

export interface GraphEdge {
  fromRow: number
  fromLane: number
  toRow: number
  toLane: number
}

export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  laneCount: number
}

function firstFree(lanes: (string | null)[]): number {
  const i = lanes.indexOf(null)
  if (i !== -1) return i
  lanes.push(null)
  return lanes.length - 1
}

export function computeGraph(commits: RawCommit[]): GraphLayout {
  const nodes: GraphNode[] = []
  const pos = new Map<string, GraphNode>()
  const known = new Set(commits.map((c) => c.hash)) // 이 윈도우에 실제 로드된 커밋들
  const lanes: (string | null)[] = [] // lane -> hash it currently routes toward
  let laneCount = 0

  commits.forEach((c, row) => {
    // find the lane already waiting for this commit (a child reserved it)
    let myLane = lanes.indexOf(c.hash)
    if (myLane === -1) {
      myLane = firstFree(lanes)
    }

    // collapse any other lanes that were also waiting for this commit (multiple children)
    for (let i = 0; i < lanes.length; i++) {
      if (i !== myLane && lanes[i] === c.hash) lanes[i] = null
    }

    const node: GraphNode = { hash: c.hash, row, lane: myLane }
    nodes.push(node)
    pos.set(c.hash, node)

    // route parents — 단, 이 윈도우 안에 실제로 있는 부모만 레인을 예약한다. 윈도우 밖
    // (오래됐거나 작성자/메시지 필터로 걸러진) 부모를 예약하면 그 레인이 영영 안 비워져,
    // 필터로 커밋이 듬성해질 때 레인이 커밋 수만큼 폭증한다(그래프가 옆으로 무한정 넓어지고
    // 커밋 메시지가 오른쪽으로 밀려 안 보이는 원인).
    if (c.parents.length === 0) {
      lanes[myLane] = null
    } else {
      lanes[myLane] = known.has(c.parents[0]) ? c.parents[0] : null // first parent continues current lane
      for (let p = 1; p < c.parents.length; p++) {
        const parent = c.parents[p]
        if (known.has(parent) && lanes.indexOf(parent) === -1) {
          const pl = firstFree(lanes)
          lanes[pl] = parent
        }
      }
    }
    laneCount = Math.max(laneCount, lanes.filter((x) => x !== null).length, myLane + 1)
  })

  // second pass: edges from each commit to its parents that are within the window
  const edges: GraphEdge[] = []
  for (const node of nodes) {
    const commit = commits[node.row]
    for (const parentHash of commit.parents) {
      const parent = pos.get(parentHash)
      if (!parent) continue // outside loaded window
      edges.push({
        fromRow: node.row,
        fromLane: node.lane,
        toRow: parent.row,
        toLane: parent.lane,
      })
    }
  }

  return { nodes, edges, laneCount: Math.max(laneCount, 1) }
}
