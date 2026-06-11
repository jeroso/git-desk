import { git } from './exec'
import type { Commit } from './types'

const SEP = '\x00'
const REC = '\x1e'

// %H hash, %P parents, %an author, %aI ISO date, %s subject, %D refs
export const LOG_FORMAT = ['%H', '%P', '%an', '%aI', '%s', '%D'].join(SEP) + REC

export function parseLog(raw: string): Commit[] {
  return raw
    .split(REC)
    .map((r) => r.replace(/^\n/, ''))
    .filter((r) => r.length > 0)
    .map((record) => {
      const [hash, parents, author, dateISO, subject, refs] = record.split(SEP)
      return {
        hash,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        author,
        dateISO,
        subject,
        refs: refs ? refs.split(',').map((s) => s.trim()).filter(Boolean) : [],
      }
    })
}

/** 모든 브랜치의 커밋을 날짜순으로 가져온다. limit으로 페이지네이션. */
export async function getLog(repo: string, limit = 500): Promise<Commit[]> {
  const raw = await git(repo, [
    'log',
    '--all',
    '--date-order',
    `--max-count=${limit}`,
    `--pretty=format:${LOG_FORMAT}`,
  ])
  return parseLog(raw)
}
