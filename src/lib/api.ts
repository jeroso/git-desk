import { create } from 'zustand'

interface ToastState {
  message: string | null
  show: (msg: string) => void
  clear: () => void
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}))

/** IPC 호출을 감싸 실패 시 토스트로 에러를 노출한다. */
export async function withToast<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    useToast.getState().show(err instanceof Error ? err.message : String(err))
    return undefined
  }
}
