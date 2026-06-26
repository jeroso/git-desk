import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { git } from './exec'
import { getStatus } from './status'

export type ConflictOp = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

export interface ConflictStateResult {
  inProgress: boolean
  op: ConflictOp | null
  files: string[]
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/** repo의 진행 중 충돌 작업과 충돌 파일을 감지한다(앱 재실행 후에도 동작). */
export async function getConflictState(repo: string): Promise<ConflictStateResult> {
  const gitDir = (await git(repo, ['rev-parse', '--absolute-git-dir'])).trim()
  let op: ConflictOp | null = null
  if ((await exists(join(gitDir, 'rebase-merge'))) || (await exists(join(gitDir, 'rebase-apply')))) op = 'rebase'
  else if (await exists(join(gitDir, 'MERGE_HEAD'))) op = 'merge'
  else if (await exists(join(gitDir, 'CHERRY_PICK_HEAD'))) op = 'cherry-pick'
  else if (await exists(join(gitDir, 'REVERT_HEAD'))) op = 'revert'
  const files = (await getStatus(repo)).filter((s) => s.status === 'conflicted').map((s) => s.path)
  return { inProgress: op !== null || files.length > 0, op, files }
}
