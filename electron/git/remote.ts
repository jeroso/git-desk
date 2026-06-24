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

export function pull(repo: string): Promise<string> {
  return git(repo, ['pull'])
}

export function push(repo: string): Promise<string> {
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
  if (branch === current) return git(repo, ['pull'])
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
