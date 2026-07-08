import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

const pExecFile = promisify(execFile)

export class GitError extends Error {
  constructor(
    public args: string[],
    public code: number,
    public stderr: string,
  ) {
    super(`git ${args.join(' ')} failed (code ${code}): ${stderr.trim()}`)
    this.name = 'GitError'
  }
}

async function run(
  cwd: string,
  args: string[],
  opts?: { env?: NodeJS.ProcessEnv },
): Promise<string> {
  try {
    const { stdout } = await pExecFile('git', args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      // GIT_OPTIONAL_LOCKS=0: status/log 등 읽기 명령이 인덱스 stat 캐시를 갱신하려고
      // .git/index.lock을 잡지 않게 한다. 그래야 백그라운드 status가 checkout/commit과
      // 락을 두고 경쟁하지 않는다. 락이 필수인 쓰기 명령(checkout/commit/reset 등)은
      // 영향받지 않는다. (호출자가 명시한 opts.env가 우선)
      // LC_ALL=C: git 메시지를 영어로 고정한다. 앱 전반이 영어 문자열 패턴으로 상태를
      // 감지하므로(체크아웃 충돌 "would be overwritten by checkout", pull 요약 "up to
      // date", "not fully merged" 등) 로캘이 한국어여도 감지가 깨지지 않는다. 파일 내용·
      // 커밋 메시지는 raw 바이트로 나오고 비ASCII 경로는 core.quotePath로 이미 이스케이프
      // 되므로 내용에는 영향 없다.
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', ...opts?.env },
    })
    return stdout
  } catch (err) {
    const e = err as { code?: number; stderr?: string; message: string }
    throw new GitError(args, e.code ?? -1, e.stderr ?? e.message)
  }
}

// 저장소별 직렬화 큐. 같은 저장소에서 두 git 프로세스가 동시에 .git/index.lock을
// 만들려다 "Unable to create '.../index.lock': File exists"로 실패하는 레이스를 막는다.
// 키는 정규화한 저장소 경로. 서로 다른 저장소의 명령은 병렬로 유지한다.
const queues = new Map<string, Promise<unknown>>()

/**
 * 모든 git 호출의 단일 통로. 같은 저장소(cwd)의 호출은 순차 실행하고, 0이 아닌
 * 종료코드면 GitError를 throw한다. 서로 다른 저장소의 호출은 서로를 막지 않는다.
 */
export function git(
  cwd: string,
  args: string[],
  opts?: { env?: NodeJS.ProcessEnv },
): Promise<string> {
  const key = resolve(cwd)
  const prev = queues.get(key) ?? Promise.resolve()
  // 앞 명령의 성공/실패와 무관하게 이어서 실행한다(체인이 reject로 끊기지 않도록).
  const result = prev.catch(() => {}).then(() => run(cwd, args, opts))
  // 큐 꼬리를 갱신하되, 이 호출이 마지막이면 맵에서 제거해 누수를 막는다.
  const tail = result.catch(() => {})
  queues.set(key, tail)
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })
  return result
}
