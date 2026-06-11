import { describe, it, expect } from 'vitest'
import { rewriteRemoteHost } from '../electron/git/remote'

describe('rewriteRemoteHost', () => {
  it('rewrites scp-like ssh url host', () => {
    expect(rewriteRemoteHost('git@github.com:org/repo.git', 'github-work')).toBe(
      'git@github-work:org/repo.git',
    )
  })

  it('rewrites an already-aliased host', () => {
    expect(rewriteRemoteHost('git@github-personal:org/repo.git', 'github-work')).toBe(
      'git@github-work:org/repo.git',
    )
  })

  it('rewrites ssh:// url host', () => {
    expect(rewriteRemoteHost('ssh://git@github.com/org/repo.git', 'github-work')).toBe(
      'ssh://git@github-work/org/repo.git',
    )
  })

  it('leaves https urls unchanged (not ssh)', () => {
    const https = 'https://github.com/org/repo.git'
    expect(rewriteRemoteHost(https, 'github-work')).toBe(https)
  })
})
