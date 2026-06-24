import { useRepoStore } from '../store/repoStore'
import { useThemeStore } from '../store/themeStore'
import { useLogStore } from '../store/logStore'

interface Props {
  onRefresh: () => void
  onOpenRemote: () => void
  onFetch: () => void
  onPull: () => void
  onPush: () => void
}

export function TopBar({ onRefresh, onOpenRemote, onFetch, onPull, onPush }: Props) {
  const { recents, current, pickAndOpen, open } = useRepoStore()
  const { theme, toggle } = useThemeStore()
  const currentBranch = useLogStore((s) => s.currentBranch)
  return (
    <div className="h-10 border-b dark:border-neutral-700 flex items-center gap-2 px-2 text-xs">
      <select
        value={current?.path ?? ''}
        onChange={(e) => open(e.target.value)}
        className="border dark:border-neutral-600 rounded px-2 py-1 max-w-xs dark:bg-neutral-800 dark:text-neutral-200"
      >
        <option value="" disabled>
          저장소 선택
        </option>
        {recents.map((r) => (
          <option key={r.path} value={r.path}>
            {r.name}
          </option>
        ))}
      </select>
      <button onClick={pickAndOpen} className="border dark:border-neutral-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:text-neutral-200">
        + 폴더 추가
      </button>
      {current && (
        <span
          className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 max-w-[14rem]"
          title={currentBranch ? `현재 브랜치: ${currentBranch}` : 'detached HEAD'}
        >
          <span aria-hidden>⎇</span>
          <span className="font-semibold truncate">{currentBranch ?? '(detached)'}</span>
        </span>
      )}
      <div className="flex-1" />
      <button onClick={onFetch} className="border dark:border-neutral-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:text-neutral-200">Fetch</button>
      <button onClick={onPull} className="border dark:border-neutral-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:text-neutral-200">Pull</button>
      <button onClick={onPush} className="border dark:border-neutral-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:text-neutral-200">Push</button>
      <button onClick={onRefresh} className="border dark:border-neutral-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:text-neutral-200">
        ⟳ 새로고침
      </button>
      <button onClick={toggle} className="border dark:border-neutral-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:text-neutral-200">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <button onClick={onOpenRemote} className="border dark:border-neutral-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:text-neutral-200">
        ⚙ Remote
      </button>
    </div>
  )
}
