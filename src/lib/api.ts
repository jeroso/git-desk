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

/**
 * IPC 호출을 감싸 실패 시 토스트로 에러를 노출한다. 실패는 undefined로 신호한다.
 * 반환값이 없는(Promise<void>) IPC에는 쓰지 말 것 — 성공해도 undefined라
 * 실패와 구별할 수 없다. 그런 호출은 withToastOk를 사용한다.
 */
export async function withToast<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    useToast.getState().show(err instanceof Error ? err.message : String(err))
    return undefined
  }
}

/** 반환값 없는(void) IPC용 withToast. 성공 여부만 boolean으로 돌려준다. */
export async function withToastOk(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (err) {
    useToast.getState().show(err instanceof Error ? err.message : String(err))
    return false
  }
}

/** 성공/정보 알림. (실패는 withToast가 처리) */
export function notify(message: string) {
  useToast.getState().info(message)
}
