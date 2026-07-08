import { git } from './exec'
import type { Commit } from './types'

// Separators in git's OUTPUT (the parser splits on these real bytes).
const SEP = '\x00'
const REC = '\x1e'

// Format string passed to git as an ARGUMENT. We must NOT put raw NUL bytes in
// argv (Node's execFile rejects them: ERR_INVALID_ARG_VALUE). git's pretty-format
// placeholders %x00 / %x1e make git emit those bytes in the output instead.
// %H hash, %P parents, %an author, %aI ISO date, %s subject, %D refs
export const LOG_FORMAT = ['%H', '%P', '%an', '%aI', '%s', '%D'].join('%x00') + '%x1e'

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

/** 커밋의 전체 메시지(제목+본문). 편집 다이얼로그 prefill용. */
export async function getCommitMessage(repo: string, hash: string): Promise<string> {
  const out = await git(repo, ['log', '-1', '--format=%B', hash])
  return out.replace(/\n+$/, '')
}

/** bare 'YYYY-MM-DD'에 시각을 붙인다(그 외 형식은 그대로 둔다). --since/--until 경계용. */
function withDayTime(date: string, time: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date} ${time}` : date
}

/** 커밋 로그 필터. 빈/미지정 필드는 무시된다. author/text는 대소문자 무시로 매칭. */
export interface LogFilter {
  author?: string
  text?: string
  since?: string // 'YYYY-MM-DD' 또는 git이 해석 가능한 날짜/표현
  until?: string
}

/**
 * 커밋을 날짜순으로 가져온다. ref가 주어지면 그 브랜치/레퍼런스의 히스토리만,
 * 없으면 모든 브랜치(--all). limit으로 페이지네이션. filter로 작성자/메시지/날짜 제한.
 */
export async function getLog(
  repo: string,
  limit = 500,
  ref?: string,
  filter?: LogFilter,
): Promise<Commit[]> {
  const range = ref ? [ref] : ['--all']
  const args = [
    'log',
    ...range,
    '--date-order',
    `--max-count=${limit}`,
    `--pretty=format:${LOG_FORMAT}`,
  ]
  // git은 --author와 --grep을 AND로 결합한다. -i는 둘 다 대소문자 무시에 적용.
  if (filter?.author || filter?.text) args.push('-i')
  if (filter?.author) args.push(`--author=${filter.author}`)
  if (filter?.text) args.push(`--grep=${filter.text}`)
  // git의 --since/--until은 시각을 생략하면 '현재 시각'으로 채운다(approxidate). 그래서
  // bare 'YYYY-MM-DD'는 그날 자정이 아니라 지금 시각으로 해석돼 경계가 어긋난다. 날짜
  // 경계를 결정적으로 만들기 위해 시작일은 00:00:00, 종료일은 23:59:59를 명시한다.
  if (filter?.since) args.push(`--since=${withDayTime(filter.since, '00:00:00')}`)
  if (filter?.until) args.push(`--until=${withDayTime(filter.until, '23:59:59')}`)
  // Trailing '--' tells git everything before it is a revision, nothing a path.
  // Without it, a branch whose name collides with a worktree path (e.g. a "test"
  // branch next to a "test/" dir) fails with "ambiguous argument ... both
  // revision and filename".
  args.push('--')
  const raw = await git(repo, args)
  return parseLog(raw)
}

/** 저장소 전체(모든 브랜치) 커밋 작성자 목록. 필터 자동완성용. 중복 제거 후 정렬. */
export async function getAuthors(repo: string): Promise<string[]> {
  const raw = await git(repo, ['log', '--all', '--format=%an', '--'])
  const set = new Set(
    raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  return [...set].sort((a, b) => a.localeCompare(b))
}
