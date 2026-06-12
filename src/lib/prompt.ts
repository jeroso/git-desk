import { create } from 'zustand'

// A promise-based text prompt. Electron's renderer does NOT implement
// window.prompt(), so we provide our own modal-backed prompt instead.
interface PromptState {
  open: boolean
  message: string
  defaultValue: string
  resolve: ((value: string | null) => void) | null
  ask: (message: string, defaultValue?: string) => Promise<string | null>
  submit: (value: string) => void
  cancel: () => void
}

export const usePrompt = create<PromptState>((set, get) => ({
  open: false,
  message: '',
  defaultValue: '',
  resolve: null,
  ask: (message, defaultValue = '') =>
    new Promise<string | null>((resolve) => {
      set({ open: true, message, defaultValue, resolve })
    }),
  submit: (value) => {
    get().resolve?.(value)
    set({ open: false, resolve: null })
  },
  cancel: () => {
    get().resolve?.(null)
    set({ open: false, resolve: null })
  },
}))

/** Convenience for event handlers: `const name = await ask('...')`. */
export const ask = (message: string, defaultValue?: string) =>
  usePrompt.getState().ask(message, defaultValue)
