import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git, GitError } from './exec'

/**
 * 해당 경로의 미해결 인덱스 stage(1=base, 2=ours, 3=theirs)와 blob SHA를 구한다.
 * 경로가 아니라 SHA로 읽어야 `git show :2:<path>`의 경로 해석 문제를 피할 수 있다.
 */
async function unmergedStages(repo: string, file: string): Promise<Map<number, string>> {
  const raw = await git(repo, ['ls-files', '-u', '-z', '--', file])
  const stages = new Map<number, string>()
  for (const entry of raw.split('\0')) {
    if (!entry) continue
    // "<mode> <sha> <stage>\t<path>" — -z라서 경로는 인용되지 않는다.
    const [mode, sha, stage] = entry.slice(0, entry.indexOf('\t')).split(/\s+/)
    void mode
    const n = Number(stage)
    if (n >= 1 && n <= 3) stages.set(n, sha)
  }
  return stages
}

/**
 * 워크트리에 충돌 마커가 남아 있지 않을 때(직접 편집했거나 저장이 중간에 끊긴 경우),
 * 인덱스의 미해결 stage에서 충돌 마커가 든 텍스트를 다시 만들어 돌려준다.
 * 3-pane 머지가 워크트리 마커가 아니라 인덱스를 원본으로 쓸 수 있게 하는 용도.
 *
 * 워크트리 파일은 절대 건드리지 않는다(모든 작업은 임시 디렉터리에서 한다).
 * 재구성할 수 없으면 null: 미해결이 아님, 한쪽 stage가 없음(삭제/수정 충돌),
 * 바이너리 등.
 */
export async function rebuildConflictText(repo: string, file: string): Promise<string | null> {
  const stages = await unmergedStages(repo, file)
  // ours/theirs 양쪽이 다 있어야 3-way 재구성이 성립한다.
  // (삭제/수정 충돌은 한쪽이 없으므로 여기서 걸러진다.)
  const ours = stages.get(2)
  const theirs = stages.get(3)
  if (!ours || !theirs) return null

  const dir = await mkdtemp(join(tmpdir(), 'gitdesk-merge-'))
  try {
    const p = { base: join(dir, 'base'), ours: join(dir, 'ours'), theirs: join(dir, 'theirs') }
    const base = stages.get(1)
    // add/add 충돌은 base stage가 없다. git이 내부에서 하는 것과 같게 빈 base로 둔다.
    await writeFile(p.base, base ? await git(repo, ['cat-file', 'blob', base]) : '', 'utf8')
    await writeFile(p.ours, await git(repo, ['cat-file', 'blob', ours]), 'utf8')
    await writeFile(p.theirs, await git(repo, ['cat-file', 'blob', theirs]), 'utf8')
    const args = ['merge-file', '-p', '-L', 'HEAD', '-L', 'base', '-L', 'incoming', p.ours, p.base, p.theirs]
    try {
      // 깔끔하게 합쳐지면 마커 없는 결과가 나온다. 그대로 돌려주고 호출부의
      // parseConflicts가 "마커 없음"으로 판단하게 둔다.
      return await git(repo, args)
    } catch (err) {
      // merge-file의 종료코드는 충돌 개수(1~127)다 — 실패가 아니라 정상 결과이고,
      // 마커가 든 텍스트는 stdout에 있다. 음수(셸에서 255 등)는 진짜 실패로,
      // 바이너리("Cannot merge binary files")가 대표적이다.
      if (err instanceof GitError && err.code >= 1 && err.code <= 127) return err.stdout
      return null
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
