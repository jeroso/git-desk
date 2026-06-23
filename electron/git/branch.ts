import { git } from './exec'
import type { Branch } from './types'

export async function getBranches(repo: string): Promise<Branch[]> {
  // local + remote, machine-readable. Use git's %00 placeholder (not a raw NUL):
  // Node's execFile rejects argv strings containing NUL bytes. git for-each-ref
  // expands %00 to a NUL byte in the output, which we split on below.
  const fmt = '%(refname)%00%(HEAD)%00%(upstream:short)%00%(upstream:track)'
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

/**
 * 브랜치 체크아웃. 원격 추적 ref(예: "origin/staging")면 detached HEAD로 빠지지 않고,
 * 그 원격을 추적하는 로컬 브랜치("staging")로 전환한다(없으면 DWIM으로 생성).
 * 로컬에 동일 이름 브랜치가 이미 있으면 단순히 그 브랜치로 전환된다.
 */
export function checkout(repo: string, name: string, isRemote = false): Promise<string> {
  if (isRemote) {
    // strip the remote name (first path segment): "origin/feature/x" -> "feature/x"
    const local = name.replace(/^[^/]+\//, '')
    return git(repo, ['checkout', local])
  }
  return git(repo, ['checkout', name])
}

/**
 * 로컬 브랜치 삭제. force가 true면 미병합 브랜치도 강제 삭제(-D).
 * 원격 추적 브랜치(origin/foo)는 `git push origin --delete foo`로 원격에서 삭제한다.
 */
export function deleteBranch(repo: string, name: string, force = false): Promise<string> {
  const slash = name.indexOf('/')
  if (slash > 0) {
    // remote-tracking ref like "origin/feature/x"
    const remote = name.slice(0, slash)
    const branch = name.slice(slash + 1)
    return git(repo, ['push', remote, '--delete', branch])
  }
  return git(repo, ['branch', force ? '-D' : '-d', name])
}

/** 새 브랜치 생성. base가 주어지면 그 브랜치/커밋을 기준으로 만든다. */
export function createBranch(
  repo: string,
  name: string,
  base?: string,
  checkoutNew = true,
): Promise<string> {
  const args = checkoutNew ? ['checkout', '-b', name] : ['branch', name]
  if (base) args.push(base)
  return git(repo, args)
}
