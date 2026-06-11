import { git } from './exec'

/** 작업을 시도하고, 성공이든 충돌이든 throw하지 않고 결과를 돌려준다. */
async function tryOp(repo: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const out = await git(repo, args)
    return { ok: true, output: out }
  } catch (err) {
    // merge/rebase 충돌은 비정상 종료지만 "실패"가 아니라 "충돌 상태"일 수 있다.
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, output: msg }
  }
}

export function mergeBranch(repo: string, branch: string) {
  return tryOp(repo, ['merge', '--no-edit', branch])
}
export function rebaseOnto(repo: string, branch: string) {
  return tryOp(repo, ['rebase', branch])
}
/** 하나 이상의 커밋을 순서대로 cherry-pick한다 (호출부가 oldest→newest 순서로 전달). */
export function cherryPick(repo: string, hashes: string[]) {
  return tryOp(repo, ['cherry-pick', ...hashes])
}

// 충돌 후 진행/중단
export function continueOp(repo: string, op: 'merge' | 'rebase' | 'cherry-pick') {
  const args = op === 'merge' ? ['commit', '--no-edit'] : [op, '--continue']
  return tryOp(repo, args)
}
export function abortOp(repo: string, op: 'merge' | 'rebase' | 'cherry-pick') {
  return tryOp(repo, [op, '--abort'])
}

export function markResolved(repo: string, files: string[]) {
  return git(repo, ['add', '--', ...files])
}
