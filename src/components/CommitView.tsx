import { useEffect } from 'react'
import { useCommitStore } from '../store/commitStore'
import { DiffView } from './DiffView'

const STATUS_LABEL: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
  conflicted: 'U',
}

// IntelliJ-style colors: modified=blue, added/untracked=green,
// deleted=grey strikethrough, renamed=teal, conflicted=red.
const STATUS_COLOR: Record<string, string> = {
  modified: 'text-blue-600 dark:text-blue-400',
  added: 'text-green-600 dark:text-green-400',
  untracked: 'text-green-600 dark:text-green-400',
  deleted: 'text-gray-400 line-through dark:text-neutral-500',
  renamed: 'text-teal-600 dark:text-teal-400',
  conflicted: 'text-red-600 dark:text-red-400',
}

export function CommitView({ repo }: { repo: string }) {
  const s = useCommitStore()
  useEffect(() => {
    s.refresh(repo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  const allChecked = s.changes.length > 0 && s.checked.size === s.changes.length

  const rollback = (paths: string[]) => {
    if (paths.length === 0) return
    const label =
      paths.length === 1 ? `'${paths[0]}'` : `선택한 ${paths.length}개 파일`
    if (window.confirm(`${label}의 변경을 되돌릴까요? (커밋되지 않은 변경이 사라집니다)`)) {
      s.rollback(repo, paths)
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-96 border-r dark:border-neutral-700 flex flex-col text-xs">
        <div className="px-2 py-1 border-b dark:border-neutral-700 flex items-center gap-1 text-gray-600 dark:text-neutral-300">
          <span title="현재 브랜치">⎇</span>
          <span className="font-semibold truncate" title={`현재 브랜치: ${s.branch}`}>
            {s.branch || '(detached)'}
          </span>
        </div>
        <div className="px-2 py-1 border-b dark:border-neutral-700 flex items-center gap-2">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => s.toggleAll(e.target.checked)}
          />
          <span
            className="text-gray-500 dark:text-neutral-400"
            title="Shift+클릭: 범위 선택 · ⌘/Ctrl+클릭: 개별 토글"
          >
            Changes ({s.changes.length})
          </span>
          <button
            onClick={() => rollback([...s.checked])}
            disabled={s.checked.size === 0}
            title="선택한 파일의 변경 되돌리기 (Rollback)"
            className="ml-auto px-1.5 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-30"
          >
            ↩ Rollback
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {s.changes.map((c) => (
            <div
              key={c.path}
              className={`group flex items-center gap-2 px-2 py-0.5 ${
                c.path === s.selectedFile ? 'bg-blue-100 dark:bg-blue-500/30' : 'hover:bg-gray-100 dark:hover:bg-neutral-800'
              }`}
            >
              <input
                type="checkbox"
                checked={s.checked.has(c.path)}
                onChange={() => s.toggle(c.path)}
              />
              <button
                className="flex-1 text-left flex gap-2 truncate"
                onClick={(e) => {
                  // Shift+클릭=범위 선택, Cmd/Ctrl+클릭=토글, 일반 클릭=diff 보기.
                  if (e.shiftKey) s.selectRange(c.path)
                  else if (e.metaKey || e.ctrlKey) s.toggle(c.path)
                  else s.selectFile(repo, c.path, c.staged)
                }}
              >
                <span className={`w-3 ${STATUS_COLOR[c.status] ?? 'text-gray-500 dark:text-neutral-400'}`}>
                  {STATUS_LABEL[c.status]}
                </span>
                <span className={`truncate ${STATUS_COLOR[c.status] ?? ''}`}>{c.path}</span>
              </button>
              <button
                onClick={() => rollback([c.path])}
                title="이 파일 변경 되돌리기 (Rollback)"
                className="opacity-0 group-hover:opacity-100 px-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              >
                ↩
              </button>
            </div>
          ))}
        </div>
        <div className="border-t dark:border-neutral-700 p-2 space-y-2">
          <textarea
            value={s.message}
            onChange={(e) => s.setMessage(e.target.value)}
            placeholder="커밋 메시지..."
            className="w-full h-20 border rounded p-2 resize-none dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-200"
          />
          <div className="flex gap-2">
            <button
              onClick={() => s.doCommit(repo, false)}
              className="flex-1 bg-blue-600 text-white rounded py-1 hover:bg-blue-700"
            >
              Commit
            </button>
            <button
              onClick={() => s.doCommit(repo, true)}
              className="flex-1 border border-blue-600 text-blue-600 rounded py-1 hover:bg-blue-50"
            >
              Commit and Push
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <DiffView file={s.selectedFile} diff={s.diff} />
      </div>
    </div>
  )
}
