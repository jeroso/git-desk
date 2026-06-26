import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 작업트리 파일 원문(충돌 마커 포함)을 읽는다. file은 repo-상대 경로. */
export function readWorktreeFile(repo: string, file: string): Promise<string> {
  return readFile(join(repo, file), 'utf8')
}

/** 해결된 내용을 작업트리 파일에 쓴다. 이후 markResolved(git add)로 해결 표시. */
export async function writeWorktreeFile(repo: string, file: string, content: string): Promise<void> {
  await writeFile(join(repo, file), content, 'utf8')
}
