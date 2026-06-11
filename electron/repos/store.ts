import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface RecentRepo {
  path: string
  name: string
  lastOpened: string // ISO
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'recent-repos.json')
}

export async function listRepos(): Promise<RecentRepo[]> {
  try {
    const raw = await readFile(storePath(), 'utf8')
    return JSON.parse(raw) as RecentRepo[]
  } catch {
    return []
  }
}

export async function addRepo(repoPath: string, nowISO: string): Promise<RecentRepo[]> {
  const repos = await listRepos()
  const name = path.basename(repoPath)
  const filtered = repos.filter((r) => r.path !== repoPath)
  filtered.unshift({ path: repoPath, name, lastOpened: nowISO })
  const trimmed = filtered.slice(0, 20)
  await writeFile(storePath(), JSON.stringify(trimmed, null, 2), 'utf8')
  return trimmed
}

export async function removeRepo(repoPath: string): Promise<RecentRepo[]> {
  const repos = (await listRepos()).filter((r) => r.path !== repoPath)
  await writeFile(storePath(), JSON.stringify(repos, null, 2), 'utf8')
  return repos
}
