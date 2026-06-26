export type ConflictSeg =
  | { type: 'shared'; lines: string[] }
  | { type: 'conflict'; ours: string[]; theirs: string[]; base?: string[] }

export interface ParsedConflict {
  segments: ConflictSeg[]
  conflictCount: number
  oursLabel: string
  theirsLabel: string
  ok: boolean
}

/**
 * 작업트리 충돌 파일(마커 포함)을 공통/충돌 세그먼트로 분해한다.
 * 기본 마커와 diff3(`|||||||`) 둘 다 지원. 마커가 없거나 닫히지 않으면 ok:false.
 */
export function parseConflicts(text: string): ParsedConflict {
  const lines = text.split('\n')
  const segments: ConflictSeg[] = []
  let shared: string[] = []
  let oursLabel = 'Ours'
  let theirsLabel = 'Theirs'
  let conflictCount = 0
  let ok = true
  let i = 0

  const flush = () => {
    if (shared.length) {
      segments.push({ type: 'shared', lines: shared })
      shared = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('<<<<<<<')) {
      flush()
      const label = line.slice(7).trim()
      if (label) oursLabel = label
      const ours: string[] = []
      const base: string[] = []
      const theirs: string[] = []
      let phase: 'ours' | 'base' | 'theirs' = 'ours'
      let closed = false
      i++
      while (i < lines.length) {
        const l = lines[i]
        if (l.startsWith('|||||||')) {
          phase = 'base'
        } else if (l.startsWith('=======')) {
          phase = 'theirs'
        } else if (l.startsWith('>>>>>>>')) {
          const t = l.slice(7).trim()
          if (t) theirsLabel = t
          closed = true
          i++
          break
        } else if (phase === 'ours') {
          ours.push(l)
        } else if (phase === 'base') {
          base.push(l)
        } else {
          theirs.push(l)
        }
        i++
      }
      if (!closed) {
        ok = false
        break
      }
      conflictCount++
      const seg: ConflictSeg = { type: 'conflict', ours, theirs }
      if (base.length) seg.base = base
      segments.push(seg)
    } else {
      shared.push(line)
      i++
    }
  }
  flush()
  if (conflictCount === 0) ok = false
  return { segments, conflictCount, oursLabel, theirsLabel, ok }
}

/**
 * 세그먼트 + 충돌별 해결 문자열로 최종 파일 텍스트를 재구성한다.
 * resolutions[i]는 i번째 conflict 세그먼트의 결과(여러 줄 가능). 빈 문자열/null은 해당 hunk 삭제.
 */
export function buildMerged(segments: ConflictSeg[], resolutions: (string | null)[]): string {
  const out: string[] = []
  let ci = 0
  for (const seg of segments) {
    if (seg.type === 'shared') {
      out.push(...seg.lines)
    } else {
      const r = resolutions[ci++] ?? ''
      if (r !== '') out.push(...r.split('\n'))
    }
  }
  return out.join('\n')
}
