import { git } from './exec'
import type { FileChange, FileStatus } from './types'

const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

function mapStatus(x: string, y: string): { status: FileStatus; staged: boolean } {
  const code = x + y
  if (code === '??') return { status: 'untracked', staged: false }
  if (CONFLICT_CODES.has(code)) return { status: 'conflicted', staged: false }
  // prefer staged (X) column when present, else worktree (Y)
  const staged = x !== ' ' && x !== '?'
  const c = staged ? x : y
  const status: FileStatus =
    c === 'A' ? 'added' : c === 'D' ? 'deleted' : c === 'R' ? 'renamed' : 'modified'
  return { status, staged }
}

export function parseStatus(raw: string): FileChange[] {
  const tokens = raw.split('\x00')
  const out: FileChange[] = []
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i]
    if (!entry) continue
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    const { status, staged } = mapStatus(x, y)
    if (status === 'renamed') {
      const oldPath = tokens[++i]
      out.push({ path, oldPath, status, staged })
    } else {
      out.push({ path, status, staged })
    }
  }
  return out
}

export async function getStatus(repo: string): Promise<FileChange[]> {
  const raw = await git(repo, ['status', '--porcelain=v1', '-z'])
  return parseStatus(raw)
}

export function hasConflicts(changes: FileChange[]): boolean {
  return changes.some((c) => c.status === 'conflicted')
}
