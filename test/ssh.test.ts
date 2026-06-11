import { describe, it, expect } from 'vitest'
import { parseSshConfig } from '../electron/ssh/config'

describe('parseSshConfig', () => {
  it('parses multiple host blocks', () => {
    const cfg = `
Host github-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_work

Host github-personal
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_personal
`
    expect(parseSshConfig(cfg)).toEqual([
      { alias: 'github-work', hostName: 'github.com', user: 'git', identityFile: '~/.ssh/id_work' },
      {
        alias: 'github-personal',
        hostName: 'github.com',
        user: 'git',
        identityFile: '~/.ssh/id_personal',
      },
    ])
  })

  it('ignores wildcard host blocks', () => {
    const cfg = `Host *\n  AddKeysToAgent yes\nHost gh\n  HostName github.com`
    expect(parseSshConfig(cfg)).toEqual([
      { alias: 'gh', hostName: 'github.com', user: undefined, identityFile: undefined },
    ])
  })

  it('is case-insensitive on keywords and ignores comments', () => {
    const cfg = `# comment\nhost gh\n  hostname github.com\n  # inline\n  user git`
    expect(parseSshConfig(cfg)).toEqual([
      { alias: 'gh', hostName: 'github.com', user: 'git', identityFile: undefined },
    ])
  })

  it('returns empty array for empty config', () => {
    expect(parseSshConfig('')).toEqual([])
  })
})
