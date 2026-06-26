import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { git } from './exec'

export type RebaseEditRequest =
  | { kind: 'drop'; hashes: string[] }
  | { kind: 'reword'; hash: string; message: string }
  | { kind: 'squash'; hashes: string[]; message: string }

/** 단일 따옴표 셸 컨텍스트용 escape (한 줄 문자열: 경로 등). */
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
 * - 메시지는 `exec git commit --amend -F <파일>`로 참조. 파일은 git 디렉터리 안에 둬서
 *   충돌 후 --continue 시점까지 유지되고 다음 작업 시작 시 정리된다. 개행/특수문자 안전.
 *   (todo는 라인 단위 파싱이라 -m 인라인은 개행 메시지에서 깨진다 → 반드시 -F 파일 사용.)
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

  // 메시지/ todo 파일을 git 디렉터리 안 작업폴더에 둔다. 충돌-continue 시점까지 유지되고,
  // 다음 rebaseEdit 시작 시 정리된다(아래 rmSync). git은 rebase 진행 중 새 rebase를 막으므로
  // 이전 작업의 잔여 파일은 항상 stale → 안전하게 삭제 가능.
  const gitDir = (await git(repo, ['rev-parse', '--absolute-git-dir'])).trim()
  const workDir = join(gitDir, 'gitdesk-rebaseedit')
  rmSync(workDir, { recursive: true, force: true })
  mkdirSync(workDir, { recursive: true })
  const msgPath = join(workDir, 'message')
  // --cleanup=verbatim: 메시지를 그대로 보존(주석/공백 줄 유지). 경로엔 개행이 없어 todo 한 줄 유지.
  const amendExec = `exec git commit --amend --cleanup=verbatim -F ${shq(msgPath)}`

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
    writeFileSync(msgPath, req.message)
    for (const sha of inRange) {
      lines.push(`pick ${sha}`)
      if (sha === req.hash) lines.push(amendExec)
    }
  } else {
    writeFileSync(msgPath, req.message)
    const inTargets = inRange.filter((s) => targetSet.has(s))
    const newestTarget = inTargets[inTargets.length - 1]
    let seenFirst = false
    for (const sha of inRange) {
      if (targetSet.has(sha)) {
        lines.push(`${seenFirst ? 'fixup' : 'pick'} ${sha}`)
        seenFirst = true
        if (sha === newestTarget) lines.push(amendExec)
      } else {
        lines.push(`pick ${sha}`)
      }
    }
  }

  const todoPath = join(workDir, 'todo')
  writeFileSync(todoPath, lines.join('\n') + '\n')
  const baseArg = base ?? '--root'
  return tryEnv(
    repo,
    ['-c', 'core.editor=true', 'rebase', '-i', '--autostash', baseArg],
    { GIT_SEQUENCE_EDITOR: `cp ${shq(todoPath)}` },
  )
}
