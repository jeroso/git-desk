import { useRepoStore } from '../store/repoStore'

interface Props {
  onRefresh: () => void
  onOpenRemote: () => void
  onFetch: () => void
  onPull: () => void
  onPush: () => void
}

export function TopBar({ onRefresh, onOpenRemote, onFetch, onPull, onPush }: Props) {
  const { recents, current, pickAndOpen, open } = useRepoStore()
  return (
    <div className="h-10 border-b flex items-center gap-2 px-2 text-xs">
      <select
        value={current?.path ?? ''}
        onChange={(e) => open(e.target.value)}
        className="border rounded px-2 py-1 max-w-xs"
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
      <button onClick={pickAndOpen} className="border rounded px-2 py-1 hover:bg-gray-100">
        + 폴더 추가
      </button>
      <div className="flex-1" />
      <button onClick={onFetch} className="border rounded px-2 py-1 hover:bg-gray-100">Fetch</button>
      <button onClick={onPull} className="border rounded px-2 py-1 hover:bg-gray-100">Pull</button>
      <button onClick={onPush} className="border rounded px-2 py-1 hover:bg-gray-100">Push</button>
      <button onClick={onRefresh} className="border rounded px-2 py-1 hover:bg-gray-100">
        ⟳ 새로고침
      </button>
      <button onClick={onOpenRemote} className="border rounded px-2 py-1 hover:bg-gray-100">
        ⚙ Remote
      </button>
    </div>
  )
}
