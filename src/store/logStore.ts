import { create } from 'zustand'
import type { Branch, Commit, GraphLayout, LogResult } from '../types'
import { withToast } from '../lib/api'

interface LogState {
  branches: Branch[]
  commits: Commit[]
  graph: GraphLayout | null
  /** null = all branches (--all); otherwise the branch/ref whose history is shown. */
  selectedRef: string | null
  /** 현재 체크아웃된 로컬 브랜치 이름. detached HEAD면 null. */
  currentBranch: string | null
  selectedHash: string | null
  changedFiles: { path: string; status: string }[]
  selectedFile: string | null
  diff: string
  refresh: (repo: string) => Promise<void>
  /** Switch the log to a branch's history (null = all branches), then reload. */
  selectBranch: (repo: string, ref: string | null) => Promise<void>
  selectCommit: (repo: string, hash: string) => Promise<void>
  selectFile: (repo: string, file: string) => Promise<void>
}

export const useLogStore = create<LogState>((set, get) => ({
  branches: [],
  commits: [],
  graph: null,
  selectedRef: null,
  currentBranch: null,
  selectedHash: null,
  changedFiles: [],
  selectedFile: null,
  diff: '',
  refresh: async (repo) => {
    let ref = get().selectedRef ?? undefined
    let log = (await withToast(() =>
      window.api.git.log(repo, undefined, ref),
    )) as LogResult | undefined
    // The filtered ref may have vanished (branch deleted / remote pruned). Fall
    // back to all branches instead of leaving the log permanently broken.
    if (log === undefined && ref !== undefined) {
      ref = undefined
      set({ selectedRef: null })
      log = (await withToast(() => window.api.git.log(repo, undefined, undefined))) as
        | LogResult
        | undefined
    }
    const branches = (await withToast(() => window.api.git.branches(repo))) as Branch[] | undefined
    set({
      commits: log?.commits ?? [],
      graph: log?.graph ?? null,
      branches: branches ?? [],
      currentBranch: branches?.find((b) => b.isCurrent)?.name ?? null,
      selectedHash: null,
      changedFiles: [],
      selectedFile: null,
      diff: '',
    })
  },
  selectBranch: async (repo, ref) => {
    set({ selectedRef: ref })
    await get().refresh(repo)
  },
  selectCommit: async (repo, hash) => {
    const files = (await withToast(() => window.api.git.commitFiles(repo, hash))) ?? []
    set({ selectedHash: hash, changedFiles: files, selectedFile: null, diff: '' })
  },
  selectFile: async (repo, file) => {
    const hash = get().selectedHash
    if (!hash) return
    const diff = (await withToast(() => window.api.git.commitDiff(repo, hash, file))) ?? ''
    set({ selectedFile: file, diff })
  },
}))
