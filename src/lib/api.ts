import { create } from 'zustand'

export type ToastKind = 'error' | 'info'

interface ToastState {
  message: string | null
  kind: ToastKind
  show: (msg: string, kind?: ToastKind) => void
  info: (msg: string) => void
  clear: () => void
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  kind: 'error',
  show: (message, kind = 'error') => set({ message, kind }),
  info: (message) => set({ message, kind: 'info' }),
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

/** 성공/정보 알림. (실패는 withToast가 처리) */
export function notify(message: string) {
  useToast.getState().info(message)
}
