export type {
  Commit,
  RawCommit,
  FileChange,
  FileStatus,
  Branch,
} from '../electron/git/types'
export type { GraphLayout, GraphNode, GraphEdge } from '../electron/git/graph'
export type { RecentRepo } from '../electron/repos/store'

import type { Api } from '../electron/preload'
import type { Commit } from '../electron/git/types'
import type { GraphLayout } from '../electron/git/graph'

export interface LogResult {
  commits: Commit[]
  graph: GraphLayout
}

declare global {
  interface Window {
    api: Api
  }
}
