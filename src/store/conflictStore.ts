import { create } from 'zustand'

// 'checkout' is special: a `git checkout -m` left conflict markers in the working tree.
// There is nothing to continue/commit — the user just resolves files and closes.
type Op = 'merge' | 'rebase' | 'cherry-pick' | 'checkout' | 'revert'

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
