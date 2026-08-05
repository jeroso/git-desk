import { git } from './exec'

export interface RemoteInfo {
  name: string
  url: string
}

/** SSH URL의 호스트 부분만 새 별칭으로 교체. https 등 비-ssh는 그대로 둔다. */
export function rewriteRemoteHost(url: string, alias: string): string {
  // ssh://git@host/path
  const sshUrl = /^(ssh:\/\/[^@]+@)([^/]+)(\/.*)$/.exec(url)
  if (sshUrl) return `${sshUrl[1]}${alias}${sshUrl[3]}`
  // scp-like: git@host:path
  const scp = /^([^@]+@)([^:]+)(:.*)$/.exec(url)
  if (scp) return `${scp[1]}${alias}${scp[3]}`
  return url // https or unknown: leave unchanged
}

export async function getRemotes(repo: string): Promise<RemoteInfo[]> {
  const raw = await git(repo, ['remote', '-v'])
  const map = new Map<string, string>()
  for (const line of raw.split('\n').filter(Boolean)) {
    const m = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line)
    if (m && m[3] === 'fetch') map.set(m[1], m[2])
  }
  return [...map].map(([name, url]) => ({ name, url }))
}

export function setRemoteUrl(repo: string, name: string, url: string): Promise<string> {
  return git(repo, ['remote', 'set-url', name, url])
}

export function fetchRemote(repo: string): Promise<string> {
  return git(repo, ['fetch', '--all', '--prune'])
}

/** 브랜치에 추적 대상(upstream)이 설정돼 있는지. */
async function hasUpstream(repo: string, branch: string): Promise<boolean> {
  const up = await git(repo, ['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`])
  return up.trim().length > 0
}

/**
 * upstream이 없는 브랜치를 같은 이름의 origin 브랜치에 연결한다.
 *
 * bare `git pull`/`git push`는 upstream이 없으면 "There is no tracking information
 * for the current branch"로 실패한다. git은 `git pull <remote> <branch>`를 직접
 * 입력하라고 안내하지만 앱에는 그걸 입력할 자리가 없다. 그래서 origin에 같은
 * 이름의 브랜치가 있으면 한 번 연결해 준다(이후 pull/push가 그대로 동작).
 *
 * 로컬에서 `git checkout -b staging main`처럼 만든 브랜치가 이 상태가 된다
 * (원격 브랜치를 체크아웃해 만든 게 아니라 upstream이 없다).
 */
async function ensureUpstream(repo: string, branch: string): Promise<void> {
  // detached HEAD: 연결할 브랜치가 없다. git의 원래 에러를 그대로 보여준다.
  if (branch === 'HEAD') return
  if (await hasUpstream(repo, branch)) return // 이름이 다른 원격 브랜치를 볼 수도 있으니 건드리지 않는다
  try {
    // 원격 추적 ref(refs/remotes/origin/<branch>)를 먼저 만들어야 --set-upstream-to가 된다.
    await git(repo, ['fetch', 'origin', branch])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/couldn't find remote ref/i.test(msg)) {
      throw new Error(
        `원격에 '${branch}' 브랜치가 없습니다. 이 브랜치를 먼저 푸시(push)한 뒤 다시 시도하세요.`,
      )
    }
    throw err
  }
  await git(repo, ['branch', `--set-upstream-to=origin/${branch}`, branch])
}

export async function pull(repo: string): Promise<string> {
  const branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  await ensureUpstream(repo, branch)
  return git(repo, ['pull'])
}

export async function push(repo: string): Promise<string> {
  const branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  // upstream이 없으면 bare `git push`는 "has no upstream branch"로 거부한다.
  // pull과 달리 원격에 브랜치가 아직 없는 게 정상인 상황(새 브랜치 첫 푸시)이므로,
  // 만들면서 추적까지 설정한다. 원격에 이미 있고 로컬이 뒤처졌다면 git이 거부하는데,
  // 그 메시지(fetch first)가 사용자가 봐야 할 내용이라 그대로 올려보낸다.
  if (branch !== 'HEAD' && !(await hasUpstream(repo, branch))) {
    return git(repo, ['push', '-u', 'origin', branch])
  }
  return git(repo, ['push'])
}

/** 특정 브랜치를 origin에 푸시한다. (현재 체크아웃 여부와 무관) */
export function pushBranch(repo: string, branch: string): Promise<string> {
  return git(repo, ['push', 'origin', branch])
}

/**
 * 브랜치를 원격 기준으로 업데이트(IntelliJ "Update")한다.
 * - 현재 브랜치: 평범한 pull
 * - 그 외 로컬 브랜치: 체크아웃 없이 fast-forward로 로컬 ref를 갱신
 *
 * 현재 브랜치 여부는 호출자가 넘긴 (stale할 수 있는) 플래그가 아니라 실행 시점에
 * `rev-parse --abbrev-ref HEAD`로 직접 판정한다. 이렇게 하지 않으면 stale한
 * isCurrent=false 때문에 체크아웃된 브랜치에 `fetch origin b:b`를 시도해
 * "refusing to fetch into branch ... checked out"으로 터진다.
 */
export async function updateBranch(repo: string, branch: string): Promise<string> {
  const current = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  // 상단 Pull과 같은 함수를 쓴다 — upstream 없는 브랜치 처리가 두 경로에서 갈리지 않게.
  if (branch === current) return pull(repo)
  try {
    return await git(repo, ['fetch', 'origin', `${branch}:${branch}`])
  } catch (err) {
    // 다른 worktree에 체크아웃돼 있어 ref를 직접 못 옮기는 경우: 원인을 분명히 알린다.
    const msg = err instanceof Error ? err.message : String(err)
    if (/refusing to fetch into branch|checked out at/i.test(msg)) {
      throw new Error(
        `'${branch}'는 다른 워크트리에 체크아웃되어 있어 업데이트할 수 없습니다. ` +
          `해당 워크트리에서 pull 하세요.`,
      )
    }
    throw err
  }
}
