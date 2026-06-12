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

export function CommitView({ repo }: { repo: string }) {
  const s = useCommitStore()
  useEffect(() => {
    s.refresh(repo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  const allChecked = s.changes.length > 0 && s.checked.size === s.changes.length

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-96 border-r dark:border-neutral-700 flex flex-col text-xs">
        <div className="px-2 py-1 border-b dark:border-neutral-700 flex items-center gap-2">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => s.toggleAll(e.target.checked)}
          />
          <span className="text-gray-500 dark:text-neutral-400">Changes ({s.changes.length})</span>
        </div>
        <div className="flex-1 overflow-auto">
          {s.changes.map((c) => (
            <div
              key={c.path}
              className={`flex items-center gap-2 px-2 py-0.5 ${
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
                onClick={() => s.selectFile(repo, c.path, c.staged)}
              >
                <span className="text-gray-500 dark:text-neutral-400 w-3">{STATUS_LABEL[c.status]}</span>
                <span className="truncate">{c.path}</span>
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
