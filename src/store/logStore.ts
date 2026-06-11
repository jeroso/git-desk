import { create } from 'zustand'
import type { Branch, Commit, GraphLayout, LogResult } from '../types'
import { withToast } from '../lib/api'

interface LogState {
  branches: Branch[]
  commits: Commit[]
  graph: GraphLayout | null
  selectedHash: string | null
  changedFiles: { path: string; status: string }[]
  selectedFile: string | null
  diff: string
  refresh: (repo: string) => Promise<void>
  selectCommit: (repo: string, hash: string) => Promise<void>
  selectFile: (repo: string, file: string) => Promise<void>
}

export const useLogStore = create<LogState>((set, get) => ({
  branches: [],
  commits: [],
  graph: null,
  selectedHash: null,
  changedFiles: [],
  selectedFile: null,
  diff: '',
  refresh: async (repo) => {
    const [log, branches] = await Promise.all([
      withToast(() => window.api.git.log(repo)) as Promise<LogResult | undefined>,
      withToast(() => window.api.git.branches(repo)) as Promise<Branch[] | undefined>,
    ])
    set({
      commits: log?.commits ?? [],
      graph: log?.graph ?? null,
      branches: branches ?? [],
      selectedHash: null,
      changedFiles: [],
      selectedFile: null,
      diff: '',
    })
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
