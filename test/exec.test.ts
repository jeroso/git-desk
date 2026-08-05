import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git, GitError } from '../electron/git/exec'

let repo: string

beforeAll(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'gitdesk-'))
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 'test@test.com'])
  await git(repo, ['config', 'user.name', 'test'])
})

afterAll(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('git()', () => {
  it('returns stdout on success', async () => {
    const out = await git(repo, ['rev-parse', '--is-inside-work-tree'])
    expect(out.trim()).toBe('true')
  })

  it('throws GitError with stderr on failure', async () => {
    await expect(git(repo, ['checkout', 'no-such-branch'])).rejects.toBeInstanceOf(GitError)
  })
})

// GUI 앱에는 터미널이 없다. `rebase --continue`처럼 에디터를 띄우는 명령이 대화형 에디터로
// 넘어가면 파이프에 붙은 채 영원히 멈춘다(= 버튼 눌러도 아무 반응 없음). `git var GIT_EDITOR`로
// git이 실제로 쓸 에디터를 확인한다(실행은 하지 않으므로 멈출 위험 없음).
describe('git() editor', () => {
  const saved = {
    GIT_EDITOR: process.env.GIT_EDITOR,
    EDITOR: process.env.EDITOR,
    VISUAL: process.env.VISUAL,
  }
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('forces a non-interactive editor when the environment has none (would be vi)', async () => {
    delete process.env.GIT_EDITOR
    delete process.env.EDITOR
    delete process.env.VISUAL
    expect((await git(repo, ['var', 'GIT_EDITOR'])).trim()).toBe('true')
  })

  it('overrides an interactive editor inherited from the shell', async () => {
    process.env.GIT_EDITOR = 'vim'
    process.env.EDITOR = 'vim'
    expect((await git(repo, ['var', 'GIT_EDITOR'])).trim()).toBe('true')
  })
})
