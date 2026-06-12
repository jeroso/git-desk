import { create } from 'zustand'

type Theme = 'light' | 'dark'

function initial(): Theme {
  const saved = localStorage.getItem('theme')
  return saved === 'dark' ? 'dark' : 'light'
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('theme', theme)
}

interface ThemeState {
  theme: Theme
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initial(),
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    apply(next)
    set({ theme: next })
  },
}))

// apply the persisted theme immediately on module load
apply(initial())
