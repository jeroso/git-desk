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
