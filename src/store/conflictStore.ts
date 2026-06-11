import { create } from 'zustand'

type Op = 'merge' | 'rebase' | 'cherry-pick'

interface ConflictState {
  active: boolean
  op: Op | null
  files: string[]
  open: (op: Op, files: string[]) => void
  close: () => void
}

export const useConflictStore = create<ConflictState>((set) => ({
  active: false,
  op: null,
  files: [],
  open: (op, files) => set({ active: true, op, files }),
  close: () => set({ active: false, op: null, files: [] }),
}))
