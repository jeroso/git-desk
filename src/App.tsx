import { useEffect, useState } from 'react'
import { useRepoStore } from './store/repoStore'
import { useLogStore } from './store/logStore'
import { TopBar } from './components/TopBar'
import { BranchPanel } from './components/BranchPanel'
import { CommitGraph } from './components/CommitGraph'
import { ChangedFiles } from './components/ChangedFiles'
import { DiffView } from './components/DiffView'
import { Toast } from './components/Toast'
import { CommitView } from './components/CommitView'
import { RemoteDialog } from './components/RemoteDialog'
import { ConflictPanel } from './components/ConflictPanel'
import { useConflictStore } from './store/conflictStore'
import { withToast } from './lib/api'
import type { FileChange } from './types'

export default function App() {
  const { current, loadRecents } = useRepoStore()
  const log = useLogStore()

  useEffect(() => {
    loadRecents()
  }, [loadRecents])

  useEffect(() => {
    if (current) log.refresh(current.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path])

  const repo = current?.path
  const [tab, setTab] = useState<'log' | 'commit'>('log')
  const [showRemote, setShowRemote] = useState(false)
  const conflict = useConflictStore()

  async function runOp(
    repoPath: string,
    fn: () => Promise<{ ok: boolean; output: string }>,
    op: 'merge' | 'rebase' | 'cherry-pick',
  ) {
    await withToast(fn)
    const status: FileChange[] = (await withToast(() => window.api.git.status(repoPath))) ?? []
    const conflicted = status.filter((c) => c.status === 'conflicted').map((c) => c.path)
    if (conflicted.length > 0) conflict.open(op, conflicted)
    log.refresh(repoPath)
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        onRefresh={() => repo && log.refresh(repo)}
        onOpenRemote={() => setShowRemote(true)}
        onFetch={async () => { if (repo) { await withToast(() => window.api.git.fetch(repo)); log.refresh(repo) } }}
        onPull={async () => { if (repo) { await withToast(() => window.api.git.pull(repo)); log.refresh(repo) } }}
        onPush={async () => { if (repo) await withToast(() => window.api.git.push(repo)) }}
      />
      {!repo ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          저장소를 추가하세요
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex gap-1 px-2 pt-1 text-xs border-b">
            {(['log', 'commit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-t ${
                  tab === t ? 'bg-gray-100 font-semibold' : 'text-gray-500'
                }`}
              >
                {t === 'log' ? 'Log' : 'Commit'}
              </button>
            ))}
          </div>
          {tab === 'log' ? (
            <div className="flex-1 flex min-h-0">
              <BranchPanel
                branches={log.branches}
                onCheckout={async (name) => {
                  await withToast(() => window.api.git.checkout(repo!, name))
                  log.refresh(repo!)
                }}
                onMerge={(name) => runOp(repo!, () => window.api.git.merge(repo!, name), 'merge')}
                onRebase={(name) => runOp(repo!, () => window.api.git.rebase(repo!, name), 'rebase')}
                onCreate={async () => {
                  const name = window.prompt('새 브랜치 이름')
                  if (name) {
                    await withToast(() => window.api.git.createBranch(repo!, name))
                    log.refresh(repo!)
                  }
                }}
              />
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 flex min-h-0">
                  {log.graph && (
                    <CommitGraph
                      commits={log.commits}
                      graph={log.graph}
                      selectedHash={log.selectedHash}
                      onSelect={(h) => log.selectCommit(repo, h)}
                    />
                  )}
                  <ChangedFiles
                    files={log.changedFiles}
                    selectedFile={log.selectedFile}
                    onSelect={(f) => log.selectFile(repo, f)}
                  />
                </div>
                <DiffView file={log.selectedFile} diff={log.diff} />
              </div>
            </div>
          ) : (
            <CommitView repo={repo} />
          )}
        </div>
      )}
      {showRemote && repo && <RemoteDialog repo={repo} onClose={() => setShowRemote(false)} />}
      {repo && <ConflictPanel repo={repo} onDone={() => log.refresh(repo)} />}
      <Toast />
    </div>
  )
}
