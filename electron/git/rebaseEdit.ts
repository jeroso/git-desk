import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from './exec'

export type RebaseEditRequest =
  | { kind: 'drop'; hashes: string[] }
  | { kind: 'reword'; hash: string; message: string }
  | { kind: 'squash'; hashes: string[]; message: string }

/** 단일 따옴표 셸 컨텍스트용 escape: ' → '\'' 후 전체를 '...'로 감쌈 (개행 보존). */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

async function tryEnv(
  repo: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; output: string }> {
  try {
    return { ok: true, output: await git(repo, args, { env }) }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Drop / Reword / Squash를 비대화형 `rebase -i`로 수행한다.
 * - GIT_SEQUENCE_EDITOR로 todo를 주입(시작 시 1회).
 * - 메시지는 `exec git commit --amend -m '...'` 인라인 → --continue 시 외부 파일 의존 없음.
 * - 충돌 시 ok:false. 호출부(runOp)가 op='rebase'로 ConflictPanel을 띄워 continue/abort 처리.
 */
export async function rebaseEdit(
  repo: string,
  req: RebaseEditRequest,
): Promise<{ ok: boolean; output: string }> {
  const targets = req.kind === 'reword' ? [req.hash] : req.hashes
  if (targets.length === 0) return { ok: false, output: '선택된 커밋이 없습니다' }
  const targetSet = new Set(targets)

  // HEAD까지의 전체 이력(oldest→newest). 대상이 모두 여기 있어야 현재 브랜치 조상.
  const all = (await git(repo, ['rev-list', '--reverse', 'HEAD']))
    .split('\n').map((s) => s.trim()).filter(Boolean)
  const allSet = new Set(all)
  if (!targets.every((t) => allSet.has(t)))
    return { ok: false, output: '선택한 커밋이 현재 브랜치에 없습니다' }

  const oldest = all.find((h) => targetSet.has(h))! // 가장 오래된 대상
  const inRange = all.slice(all.indexOf(oldest)) // oldest→newest, == base..HEAD

  // base = oldest의 부모. 루트면 null.
  let base: string | null
  try {
    await git(repo, ['rev-parse', '--verify', `${oldest}^`])
    base = `${oldest}^`
  } catch {
    base = null
  }

  // rebase todo 라인 생성
  const lines: string[] = []
  if (req.kind === 'drop') {
    for (const sha of inRange) if (!targetSet.has(sha)) lines.push(`pick ${sha}`)
    if (lines.length === 0) {
      // 범위 내 모든 커밋 드롭 → HEAD를 base로 되돌림.
      if (!base) return { ok: false, output: '루트 커밋은 이 방식으로 드롭할 수 없습니다' }
      return tryEnv(repo, ['reset', '--hard', base], {})
    }
  } else if (req.kind === 'reword') {
    for (const sha of inRange) {
      lines.push(`pick ${sha}`)
      if (sha === req.hash) lines.push(`exec git commit --amend -m ${shq(req.message)}`)
    }
  } else {
    const inTargets = inRange.filter((s) => targetSet.has(s))
    const newestTarget = inTargets[inTargets.length - 1]
    let seenFirst = false
    for (const sha of inRange) {
      if (targetSet.has(sha)) {
        lines.push(`${seenFirst ? 'fixup' : 'pick'} ${sha}`)
        seenFirst = true
        if (sha === newestTarget) lines.push(`exec git commit --amend -m ${shq(req.message)}`)
      } else {
        lines.push(`pick ${sha}`)
      }
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), 'gitdesk-rebase-'))
  const todoPath = join(tmp, 'todo')
  writeFileSync(todoPath, lines.join('\n') + '\n')
  try {
    const baseArg = base ?? '--root'
    return await tryEnv(
      repo,
      ['-c', 'core.editor=true', 'rebase', '-i', '--autostash', baseArg],
      { GIT_SEQUENCE_EDITOR: `cp ${shq(todoPath)}` },
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
