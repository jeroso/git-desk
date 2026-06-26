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

// git's empty-tree object — used as the "before" side when the oldest commit is a root commit.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

async function baseOf(repo: string, oldest: string): Promise<string> {
  try {
    await git(repo, ['rev-parse', '--verify', `${oldest}^`])
    return `${oldest}^`
  } catch {
    return EMPTY_TREE
  }
}

/** oldest^..newest 범위에서 변경된 파일 목록 (여러 커밋 선택 시). */
export async function getRangeFiles(
  repo: string,
  oldest: string,
  newest: string,
): Promise<{ path: string; status: string }[]> {
  const base = await baseOf(repo, oldest)
  const raw = await git(repo, ['diff', '--name-status', '-z', base, newest])
  const tokens = raw.split('\x00').filter(Boolean)
  const out: { path: string; status: string }[] = []
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i]
    const path = tokens[++i]
    if (path) out.push({ path, status })
  }
  return out
}

/** oldest^..newest 범위에서 한 파일의 unified diff. */
export async function getRangeDiff(
  repo: string,
  oldest: string,
  newest: string,
  file: string,
): Promise<string> {
  const base = await baseOf(repo, oldest)
  return git(repo, ['diff', base, newest, '--', file])
}
