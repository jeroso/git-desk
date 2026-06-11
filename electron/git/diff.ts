import { git } from './exec'

/** 특정 커밋에서 변경된 파일 목록 (name-status). */
export async function getCommitFiles(
  repo: string,
  hash: string,
): Promise<{ path: string; status: string }[]> {
  const raw = await git(repo, ['show', '--name-status', '--pretty=format:', '-z', hash])
  const tokens = raw.split('\x00').filter(Boolean)
  const out: { path: string; status: string }[] = []
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i]
    const path = tokens[++i]
    if (path) out.push({ path, status })
  }
  return out
}

/** 한 커밋에서 한 파일의 unified diff 텍스트. */
export function getCommitDiff(repo: string, hash: string, file: string): Promise<string> {
  return git(repo, ['show', '--format=', hash, '--', file])
}

/** working tree(또는 staged)에서 한 파일의 unified diff 텍스트. */
export function getWorktreeDiff(repo: string, file: string, staged: boolean): Promise<string> {
  const args = ['diff']
  if (staged) args.push('--cached')
  args.push('--', file)
  return git(repo, args)
}
