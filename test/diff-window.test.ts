import { describe, it, expect, beforeEach, vi } from 'vitest'

type WindowOpts = Record<string, unknown>

const { created } = vi.hoisted(() => ({ created: [] as WindowOpts[] }))

vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor(opts: WindowOpts) {
      created.push(opts)
    }
    loadURL(_url: string) {}
  },
}))

const { openDiffWindow } = await import('../electron/ipc/diffWindow')

beforeEach(() => {
  created.length = 0
})

describe('openDiffWindow', () => {
  // Regression: with the macOS default (fullscreenable: true) this child window is dragged into a
  // fullscreen parent's Space as a fullscreen window, and closing it (⌘W) blanks the main window.
  it('is not fullscreenable, so it floats over a fullscreen parent instead of taking over its Space', () => {
    openDiffWindow('a.txt', '@@ -1 +1 @@\n-a\n+b\n')
    expect(created).toHaveLength(1)
    expect(created[0].fullscreenable).toBe(false)
  })

  it('keeps its own size rather than inheriting the parent window', () => {
    openDiffWindow('a.txt', '')
    expect(created[0].width).toBe(900)
    expect(created[0].height).toBe(700)
  })
})
