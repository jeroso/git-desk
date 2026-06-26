import type { Commit } from '../types'

/** refs에 HEAD 토큰이 있는 커밋 hash. 없으면 null. */
export function headHash(commits: Commit[]): string | null {
  for (const c of commits) {
    if (c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD -> '))) return c.hash
  }
  return null
}

/** 선택이 모두 HEAD의 first-parent 조상 경로상에 있는지 (재작성 가능 전제). */
export function isOnCurrentBranch(commits: Commit[], selected: Set<string>): boolean {
  if (selected.size === 0) return false
  const head = headHash(commits)
  if (!head) return false
  const byHash = new Map(commits.map((c) => [c.hash, c]))
  const remaining = new Set(selected)
  let cur: string | undefined = head
  const guard = new Set<string>()
  while (cur && !guard.has(cur)) {
    guard.add(cur)
    remaining.delete(cur)
    if (remaining.size === 0) return true
    cur = byHash.get(cur)?.parents[0]
  }
  return remaining.size === 0
}

/** HEAD 포함 + first-parent로 정확히 선택 집합과 일치하는 연속 tip인지 (Undo 조건). */
export function isContiguousFromHead(commits: Commit[], selected: Set<string>): boolean {
  if (selected.size === 0) return false
  const head = headHash(commits)
  if (!head || !selected.has(head)) return false
  const byHash = new Map(commits.map((c) => [c.hash, c]))
  let cur: string | undefined = head
  let count = 0
  while (cur && count < selected.size) {
    if (!selected.has(cur)) return false
    count++
    cur = byHash.get(cur)?.parents[0]
  }
  return count === selected.size
}

/** 선택이 first-parent 선형 연속 구간인지 (Squash 조건, 2개+). 머지 커밋 포함 시 false. */
export function isContiguousRange(commits: Commit[], selected: Set<string>): boolean {
  if (selected.size < 2) return false
  const ordered = commits.filter((c) => selected.has(c.hash)) // newest→oldest
  if (ordered.length !== selected.size) return false
  for (let i = 0; i < ordered.length - 1; i++) {
    const newer = ordered[i]
    const older = ordered[i + 1]
    if (newer.parents.length !== 1) return false
    if (newer.parents[0] !== older.hash) return false
  }
  return true
}

/** commits는 newest→oldest. 선택을 oldest→newest로. */
export function orderedOldestToNewest(commits: Commit[], selected: Set<string>): string[] {
  return commits.filter((c) => selected.has(c.hash)).map((c) => c.hash).reverse()
}
/** 선택을 newest→oldest로. */
export function orderedNewestToOldest(commits: Commit[], selected: Set<string>): string[] {
  return commits.filter((c) => selected.has(c.hash)).map((c) => c.hash)
}
