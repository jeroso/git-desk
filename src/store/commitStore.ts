import { create } from 'zustand'
import type { FileChange } from '../types'
import { withToast } from '../lib/api'

interface CommitState {
  changes: FileChange[]
  checked: Set<string>
  message: string
  selectedFile: string | null
  diff: string
  refresh: (repo: string) => Promise<void>
  toggle: (path: string) => void
  toggleAll: (on: boolean) => void
  setMessage: (m: string) => void
  selectFile: (repo: string, path: string, staged: boolean) => Promise<void>
  doCommit: (repo: string, push: boolean) => Promise<boolean>
}

export const useCommitStore = create<CommitState>((set, get) => ({
  changes: [],
  checked: new Set(),
  message: '',
  selectedFile: null,
  diff: '',
  refresh: async (repo) => {
    const changes: FileChange[] = (await withToast(() => window.api.git.status(repo))) ?? []
    // default: check everything that's tracked (not untracked)
    const checked = new Set<string>(changes.filter((c) => c.status !== 'untracked').map((c) => c.path))
    set({ changes, checked, selectedFile: null, diff: '' })
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
}))
