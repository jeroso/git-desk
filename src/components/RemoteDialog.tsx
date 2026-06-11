import { useEffect, useState } from 'react'
import type { RemoteInfo, SshHost } from '../types'
import { withToast } from '../lib/api'

export function RemoteDialog({ repo, onClose }: { repo: string; onClose: () => void }) {
  const [remotes, setRemotes] = useState<RemoteInfo[]>([])
  const [hosts, setHosts] = useState<SshHost[]>([])
  const [alias, setAlias] = useState('')

  useEffect(() => {
    ;(async () => {
      const r = (await withToast(() => window.api.git.remotes(repo))) ?? []
      const h = (await withToast(() => window.api.ssh.hosts())) ?? []
      setRemotes(r)
      setHosts(h)
    })()
  }, [repo])

  const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0]

  const apply = async () => {
    if (!origin || !alias) return
    await withToast(() => window.api.git.setRemoteAlias(repo, origin.name, origin.url, alias))
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg shadow-xl w-[28rem] p-4 text-xs space-y-3">
        <div className="font-semibold text-sm">Remote &amp; Account</div>
        <div>
          <div className="text-gray-500">Remote: {origin?.name ?? '(없음)'}</div>
          <div className="font-mono break-all">{origin?.url ?? '-'}</div>
        </div>
        <div>
          <div className="text-gray-500 mb-1">계정 (~/.ssh/config):</div>
          {hosts.length === 0 && <div className="text-gray-400">Host 항목이 없습니다</div>}
          {hosts.map((h) => (
            <label key={h.alias} className="flex items-center gap-2 py-0.5">
              <input
                type="radio"
                name="alias"
                checked={alias === h.alias}
                onChange={() => setAlias(h.alias)}
              />
              <span className="font-mono">{h.alias}</span>
              <span className="text-gray-400">
                → {h.hostName ?? '?'} {h.identityFile ? `(${h.identityFile})` : ''}
              </span>
            </label>
          ))}
        </div>
        <div className="text-gray-400">계정 선택 시 URL의 호스트 별칭이 자동 변경됩니다.</div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="border rounded px-3 py-1">
            취소
          </button>
          <button
            onClick={apply}
            disabled={!alias}
            className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-40"
          >
            적용 (set-url)
          </button>
        </div>
      </div>
    </div>
  )
}
