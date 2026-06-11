import { git } from './exec'
import type { Branch } from './types'

export async function getBranches(repo: string): Promise<Branch[]> {
  // local + remote, machine-readable
  const fmt = '%(refname)\x00%(HEAD)\x00%(upstream:short)\x00%(upstream:track)'
  const raw = await git(repo, [
    'for-each-ref',
    '--format=' + fmt,
    'refs/heads',
    'refs/remotes',
  ])
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [refname, head, upstream, track] = line.split('\x00')
      const isRemote = refname.startsWith('refs/remotes/')
      const name = refname.replace(/^refs\/(heads|remotes)\//, '')
      const ahead = /ahead (\d+)/.exec(track)?.[1]
      const behind = /behind (\d+)/.exec(track)?.[1]
      return {
        name,
        isRemote,
        isCurrent: head === '*',
        upstream: upstream || undefined,
        ahead: ahead ? Number(ahead) : undefined,
        behind: behind ? Number(behind) : undefined,
      }
    })
    .filter((b) => b.name !== 'origin/HEAD')
}

export function checkout(repo: string, name: string): Promise<string> {
  return git(repo, ['checkout', name])
}

export function createBranch(repo: string, name: string, checkoutNew = true): Promise<string> {
  return git(repo, checkoutNew ? ['checkout', '-b', name] : ['branch', name])
}
