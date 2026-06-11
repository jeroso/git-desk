import { git } from './exec'

/** 선택한 파일만 stage하고 커밋한다. untracked 포함을 위해 add 사용. */
export async function commit(repo: string, files: string[], message: string): Promise<string> {
  if (files.length === 0) throw new Error('커밋할 파일이 없습니다')
  if (!message.trim()) throw new Error('커밋 메시지를 입력하세요')
  await git(repo, ['add', '--', ...files])
  return git(repo, ['commit', '-m', message, '--', ...files])
}

export async function commitAndPush(
  repo: string,
  files: string[],
  message: string,
): Promise<string> {
  const out = await commit(repo, files, message)
  const push = await git(repo, ['push'])
  return out + '\n' + push
}
