import { create } from 'zustand'
import type { RecentRepo } from '../types'
import { withToast } from '../lib/api'

interface RepoState {
  recents: RecentRepo[]
  current: RecentRepo | null
  loadRecents: () => Promise<void>
  pickAndOpen: () => Promise<void>
  open: (repoPath: string) => Promise<void>
  setCurrent: (repo: RecentRepo) => void
}

export const useRepoStore = create<RepoState>((set, get) => ({
  recents: [],
  current: null,
  loadRecents: async () => {
    const recents = (await withToast(() => window.api.repos.list())) ?? []
    set({ recents })
  },
  pickAndOpen: async () => {
    const picked = await withToast(() => window.api.repos.pickFolder())
    if (picked) await get().open(picked)
  },
  open: async (repoPath) => {
    const recents: RecentRepo[] =
      (await withToast(() => window.api.repos.open(repoPath) as Promise<RecentRepo[]>)) ??
      get().recents
    const current = recents.find((r) => r.path === repoPath) ?? null
    set({ recents, current })
  },
  setCurrent: (repo) => set({ current: repo }),
}))
