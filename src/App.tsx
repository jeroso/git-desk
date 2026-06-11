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

  return (
    <div className="h-full flex flex-col">
      <TopBar
        onRefresh={() => repo && log.refresh(repo)}
        onOpenRemote={() => {}}
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
                  await window.api.git.checkout(repo, name)
                  log.refresh(repo)
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
      <Toast />
    </div>
  )
}
