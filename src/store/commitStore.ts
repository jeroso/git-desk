import { create } from 'zustand'
import type { FileChange } from '../types'
import { withToast } from '../lib/api'

interface CommitState {
  changes: FileChange[]
  checked: Set<string>
  branch: string
  message: string
  selectedFile: string | null
  diff: string
  refresh: (repo: string) => Promise<void>
  toggle: (path: string) => void
  toggleAll: (on: boolean) => void
  setMessage: (m: string) => void
  selectFile: (repo: string, path: string, staged: boolean) => Promise<void>
  doCommit: (repo: string, push: boolean) => Promise<boolean>
  /** 주어진 경로들의 커밋되지 않은 변경을 되돌린다. */
  rollback: (repo: string, paths: string[]) => Promise<void>
}

export const useCommitStore = create<CommitState>((set, get) => ({
  changes: [],
  checked: new Set(),
  branch: '',
  message: '',
  selectedFile: null,
  diff: '',
  refresh: async (repo) => {
    const [changes, branch] = await Promise.all([
      withToast(() => window.api.git.status(repo)) as Promise<FileChange[] | undefined>,
      withToast(() => window.api.git.currentBranch(repo)) as Promise<string | undefined>,
    ])
    const list = changes ?? []
    // default: check everything that's tracked (not untracked)
    const checked = new Set<string>(list.filter((c) => c.status !== 'untracked').map((c) => c.path))
    set({ changes: list, branch: branch ?? '', checked, selectedFile: null, diff: '' })
  },
  toggle: (path) => {
    const checked = new Set(get().checked)
    if (checked.has(path)) checked.delete(path)
    else checked.add(path)
    set({ checked })
  },
  toggleAll: (on) => {
    set({ checked: on ? new Set(get().changes.map((c) => c.path)) : new Set() })
  },
  setMessage: (message) => set({ message }),
  selectFile: async (repo, path, staged) => {
    const diff = (await withToast(() => window.api.git.worktreeDiff(repo, path, staged))) ?? ''
    set({ selectedFile: path, diff })
  },
  doCommit: async (repo, push) => {
    const files = [...get().checked]
    const msg = get().message
    const res = await withToast(() =>
      push
        ? window.api.git.commitAndPush(repo, files, msg)
        : window.api.git.commit(repo, files, msg),
    )
    if (res === undefined) return false
    set({ message: '' })
    await get().refresh(repo)
    return true
  },
  rollback: async (repo, paths) => {
    const set2 = new Set(paths)
    const files = get()
      .changes.filter((c) => set2.has(c.path))
      .map((c) => ({ path: c.path, status: c.status }))
    if (files.length === 0) return
    const res = await withToast(() => window.api.git.rollback(repo, files))
    if (res !== undefined) await get().refresh(repo)
  },
}))
