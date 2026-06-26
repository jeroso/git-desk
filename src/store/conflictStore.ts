import { create } from 'zustand'

// 'checkout' is special: a `git checkout -m` left conflict markers in the working tree.
type Op = 'merge' | 'rebase' | 'cherry-pick' | 'checkout' | 'revert'

interface Detected {
  inProgress: boolean
  op: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  files: string[]
}

interface ConflictState {
  active: boolean
  op: Op | null
  files: string[]
  mergeFile: string | null
  detected: Detected // repo에서 감지한 영속 충돌 상태(배너 구동)
  open: (op: Op, files: string[]) => void
  close: () => void
  openMerge: (file: string) => void
  closeMerge: () => void
  setDetected: (d: Detected) => void
}

export const useConflictStore = create<ConflictState>((set) => ({
  active: false,
  op: null,
  files: [],
  mergeFile: null,
  detected: { inProgress: false, op: null, files: [] },
  open: (op, files) => set({ active: true, op, files }),
  close: () => set({ active: false, op: null, files: [], mergeFile: null }),
  openMerge: (file) => set({ mergeFile: file }),
  closeMerge: () => set({ mergeFile: null }),
  setDetected: (d) => set({ detected: d }),
}))
