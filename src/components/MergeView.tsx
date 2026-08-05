import { useEffect, useState, type ReactNode } from 'react'
import { parseConflicts, buildMerged, type ParsedConflict, type ConflictSeg } from '../lib/mergeConflict'
import { withToast, withToastOk, useToast } from '../lib/api'

interface Props {
  repo: string
  file: string
  onClose: () => void
  onResolved: () => void
}

function Lines({ lines, tone }: { lines: string[]; tone: 'shared' | 'ours' | 'theirs' }) {
  const bg =
    tone === 'ours'
      ? 'bg-green-50 dark:bg-green-950/40'
      : tone === 'theirs'
        ? 'bg-blue-50 dark:bg-blue-950/40'
        : ''
  return (
    <div className={bg}>
      {lines.map((l, i) => (
        <div key={i} className="px-2 whitespace-pre-wrap break-words">
          {l || ' '}
        </div>
      ))}
    </div>
  )
}

function Cell({ side, children }: { side: 'l' | 'm' | 'r'; children: ReactNode }) {
  const border = side !== 'r' ? 'border-r dark:border-neutral-700' : ''
  // overflow-hidden + min-w-0 keep each column's long lines inside its own track
  // (with grid-cols-3 = minmax(0,1fr), unwrapped lines would otherwise bleed over the next column).
  return <div className={`${border} min-w-0 overflow-hidden`}>{children}</div>
}

export function MergeView({ repo, file, onClose, onResolved }: Props) {
  const [parsed, setParsed] = useState<ParsedConflict | null>(null)
  const [resolutions, setResolutions] = useState<(string | null)[]>([])
  // 워크트리 마커가 아니라 인덱스 stage에서 복원해 띄운 경우. 저장하면 현재
  // 작업트리 내용을 덮어쓰므로 사용자에게 알려야 한다.
  const [rebuilt, setRebuilt] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const t = await withToast(() => window.api.git.readWorktreeFile(repo, file))
      if (cancelled) return
      if (t === undefined) {
        onClose()
        return
      }
      let p = parseConflicts(t)
      let fromIndex = false
      if (!p.ok) {
        // 마커가 지워졌어도(직접 편집·저장 중단 등) 인덱스에 base/ours/theirs가 남아
        // 있으면 거기서 원래 충돌을 되살린다. 작업트리 파일은 건드리지 않는다.
        const text = await withToast(() => window.api.git.rebuildConflictText(repo, file))
        if (cancelled) return
        if (text) {
          p = parseConflicts(text)
          fromIndex = p.ok
        }
      }
      if (!p.ok) {
        useToast
          .getState()
          .show(
            '이 파일은 3-pane 머지로 열 수 없습니다 (바이너리이거나 한쪽이 삭제된 충돌). ' +
              '내용이 맞으면 [해결됨 표시], 아니면 [에디터에서 열기]로 해결하세요.',
          )
        onClose()
        return
      }
      setRebuilt(fromIndex)
      setParsed(p)
      setResolutions(new Array(p.conflictCount).fill(null))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, file])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!parsed) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 text-white text-sm">
        불러오는 중…
      </div>
    )
  }

  const remaining = resolutions.filter((r) => r === null).length
  const setRes = (ci: number, val: string) =>
    setResolutions((prev) => {
      const next = [...prev]
      next[ci] = val
      return next
    })

  const save = async () => {
    const merged = buildMerged(parsed.segments, resolutions)
    // 두 호출 모두 성공해야 "해결됨"이다. 쓰기만 되고 git add가 빠지면
    // 마커 없는 파일 + 미해결 인덱스가 남아 다시 열 수 없게 된다.
    if (!(await withToastOk(() => window.api.git.writeWorktreeFile(repo, file, merged)))) return
    if (!(await withToastOk(() => window.api.git.markResolved(repo, [file])))) return
    onResolved()
  }

  // conflict 세그먼트 인덱스를 미리 매핑(shared는 -1).
  let counter = 0
  const segConflictIdx = parsed.segments.map((s) => (s.type === 'conflict' ? counter++ : -1))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex flex-col">
      <div className="bg-white dark:bg-neutral-900 dark:text-neutral-100 m-4 rounded-lg shadow-xl flex-1 flex flex-col min-h-0 text-xs">
        <div className="flex items-center justify-between px-4 py-2 border-b dark:border-neutral-700">
          <span className="font-semibold">충돌 머지 — {file}</span>
          <span className="text-gray-500 dark:text-neutral-400">남은 충돌 {remaining}개</span>
        </div>
        {rebuilt && (
          <div className="px-4 py-1.5 bg-amber-100 dark:bg-amber-900/40 border-b border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100">
            작업트리에 충돌 마커가 없어 <b>인덱스에서 원래 충돌을 복원</b>했습니다. 저장하면 현재
            파일 내용을 덮어씁니다 — 이미 직접 해결해 둔 상태라면 취소하고 [해결됨 표시]를
            누르세요.
          </div>
        )}
        <div className="grid grid-cols-3 text-[11px] font-semibold text-center border-b dark:border-neutral-700">
          <div className="py-1 text-green-700 dark:text-green-400">Local · {parsed.oursLabel}</div>
          <div className="py-1">Result</div>
          <div className="py-1 text-blue-700 dark:text-blue-400">Remote · {parsed.theirsLabel}</div>
        </div>
        <div className="grid grid-cols-3 flex-1 overflow-auto font-mono leading-tight">
          {parsed.segments.flatMap((seg: ConflictSeg, si: number) => {
            if (seg.type === 'shared') {
              return [
                <Cell key={`l${si}`} side="l">
                  <Lines lines={seg.lines} tone="shared" />
                </Cell>,
                <Cell key={`m${si}`} side="m">
                  <Lines lines={seg.lines} tone="shared" />
                </Cell>,
                <Cell key={`r${si}`} side="r">
                  <Lines lines={seg.lines} tone="shared" />
                </Cell>,
              ]
            }
            const idx = segConflictIdx[si]
            const res = resolutions[idx]
            return [
              <Cell key={`l${si}`} side="l">
                <Lines lines={seg.ours} tone="ours" />
              </Cell>,
              <Cell key={`m${si}`} side="m">
                <div className="p-1 space-y-1">
                  <div className="flex gap-1">
                    <button
                      className="border dark:border-neutral-600 rounded px-1 hover:bg-gray-100 dark:hover:bg-neutral-800"
                      onClick={() => setRes(idx, seg.ours.join('\n'))}
                    >
                      Use Local
                    </button>
                    <button
                      className="border dark:border-neutral-600 rounded px-1 hover:bg-gray-100 dark:hover:bg-neutral-800"
                      onClick={() => setRes(idx, [...seg.ours, ...seg.theirs].join('\n'))}
                    >
                      Both
                    </button>
                    <button
                      className="border dark:border-neutral-600 rounded px-1 hover:bg-gray-100 dark:hover:bg-neutral-800"
                      onClick={() => setRes(idx, seg.theirs.join('\n'))}
                    >
                      Use Remote
                    </button>
                  </div>
                  <textarea
                    value={res ?? ''}
                    placeholder="충돌 미해결 — 버튼을 누르거나 직접 입력"
                    onChange={(e) => setRes(idx, e.target.value)}
                    className={`w-full border rounded p-1 font-mono resize-y min-h-[3em] dark:bg-neutral-950 ${
                      res === null ? 'border-amber-400' : 'border-neutral-300 dark:border-neutral-600'
                    }`}
                  />
                </div>
              </Cell>,
              <Cell key={`r${si}`} side="r">
                <Lines lines={seg.theirs} tone="theirs" />
              </Cell>,
            ]
          })}
        </div>
        <div className="flex justify-end gap-2 px-4 py-2 border-t dark:border-neutral-700">
          <button
            onClick={onClose}
            className="border dark:border-neutral-600 rounded px-3 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={remaining > 0}
            className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-40"
          >
            저장 (해결됨 표시)
          </button>
        </div>
      </div>
    </div>
  )
}
