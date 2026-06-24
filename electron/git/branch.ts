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
/** 현재 체크아웃된 브랜치 이름. detached HEAD면 "HEAD"를 돌려준다. */
export async function currentBranch(repo: string): Promise<string> {
  const out = await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return out.trim()
}

/**
 * 원격 추적 ref 이름에서 로컬 브랜치 이름을 얻는다(첫 경로 세그먼트 = 원격명 제거):
 * "origin/feature/x" -> "feature/x". 로컬 이름이면 그대로 둔다.
 */
export function localName(name: string, isRemote: boolean): string {
  return isRemote ? name.replace(/^[^/]+\//, '') : name
}

/** force=true면 `git checkout -f`로 로컬 변경을 버리고 전환한다. */
export function checkout(
  repo: string,
  name: string,
  isRemote = false,
  force = false,
): Promise<string> {
  const args = force ? ['checkout', '-f', localName(name, isRemote)] : ['checkout', localName(name, isRemote)]
  return git(repo, args)
}

/**
 * 브랜치 삭제. isRemote가 true면 원격 추적 브랜치(origin/feature/x)를
 * `git push origin --delete feature/x`로 원격에서 지운다. 로컬이면 `git branch -d`,
 * force가 true면 미병합 브랜치도 강제 삭제(-D).
 *
 * remote/local 구분은 반드시 호출자가 넘긴 isRemote로 한다. 이름의 '/' 유무로
 * 추측하면 "feat/ITS-4145-temp" 같은 정상 로컬 브랜치를 원격으로 오인한다.
 */
export function deleteBranch(
  repo: string,
  name: string,
  isRemote = false,
  force = false,
): Promise<string> {
  if (isRemote) {
    // remote-tracking ref like "origin/feature/x": first segment is the remote,
    // the rest is the branch on that remote.
    const slash = name.indexOf('/')
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
