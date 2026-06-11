export interface RawCommit {
  hash: string
  parents: string[]
}

export interface Commit extends RawCommit {
  author: string
  dateISO: string
  subject: string
  refs: string[] // e.g. ["HEAD -> main", "origin/main", "tag: v1"]
}

export type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'

export interface FileChange {
  path: string
  oldPath?: string // for renames
  status: FileStatus
  staged: boolean
}

export interface Branch {
  name: string // e.g. "main" or "origin/main"
  isRemote: boolean
  isCurrent: boolean
  upstream?: string
  ahead?: number
  behind?: number
}
