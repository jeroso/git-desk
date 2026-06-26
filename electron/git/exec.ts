import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

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

/** 모든 git 호출의 단일 통로. 0이 아닌 종료코드면 GitError를 throw한다. */
export async function git(
  cwd: string,
  args: string[],
  opts?: { env?: NodeJS.ProcessEnv },
): Promise<string> {
  try {
    const { stdout } = await pExecFile('git', args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      env: opts?.env ? { ...process.env, ...opts.env } : undefined,
    })
    return stdout
  } catch (err) {
    const e = err as { code?: number; stderr?: string; message: string }
    throw new GitError(args, e.code ?? -1, e.stderr ?? e.message)
  }
}
