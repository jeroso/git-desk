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
import { PromptDialog } from './components/PromptDialog'
import { Splitter } from './components/Splitter'
import { useConflictStore } from './store/conflictStore'
import { withToast, notify, useToast } from './lib/api'
import { ask } from './lib/prompt'
import type { FileChange } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export default function App() {
  const { current, loadRecents } = useRepoStore()
  const log = useLogStore()

  useEffect(() => {
    loadRecents()
  }, [loadRecents])

  useEffect(() => {
    // New repo: reset the history filter to "all branches" and load.
    if (current) log.selectBranch(current.path, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path])

  const repo = current?.path
  const [tab, setTab] = useState<'log' | 'commit'>('log')
  const [showRemote, setShowRemote] = useState(false)
  // Resizable pane sizes (px). Drag the splitters between panes to adjust.
  const [branchW, setBranchW] = useState(224)
  const [filesW, setFilesW] = useState(288)
  const [diffH, setDiffH] = useState(256)
  const conflict = useConflictStore()

  async function runOp(
    repoPath: string,
    fn: () => Promise<{ ok: boolean; output: string }>,
    op: 'merge' | 'rebase' | 'cherry-pick',
  ) {
    const res = await withToast(fn)
    const status: FileChange[] = (await withToast(() => window.api.git.status(repoPath))) ?? []
    const conflicted = status.filter((c) => c.status === 'conflicted').map((c) => c.path)
    if (conflicted.length > 0) {
      conflict.open(op, conflicted)
    } else if (res && !res.ok) {
      useToast.getState().show(res.output) // failed, but not a conflict (e.g. nothing to do)
    } else if (res && res.ok) {
      notify(`${op} 완료`)
    }
    log.refresh(repoPath)
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        onRefresh={() => repo && log.refresh(repo)}
        onOpenRemote={() => setShowRemote(true)}
        onFetch={async () => {
          if (!repo) return
          const out = await withToast(() => window.api.git.fetch(repo))
          if (out !== undefined) notify('가져오기 완료 (fetch)')
          log.refresh(repo)
        }}
        onPull={async () => {
          if (!repo) return
          const out = await withToast(() => window.api.git.pull(repo))
          if (out !== undefined) notify(out.trim() || '이미 최신입니다')
          log.refresh(repo)
        }}
        onPush={async () => {
          if (!repo) return
          const out = await withToast(() => window.api.git.push(repo))
          if (out !== undefined) notify(out.trim() || '푸시 완료')
        }}
      />
      {!repo ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-neutral-500">
          저장소를 추가하세요
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex gap-1 px-2 pt-1 text-xs border-b dark:border-neutral-700">
            {(['log', 'commit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-t ${
                  tab === t ? 'bg-gray-100 dark:bg-neutral-800 font-semibold' : 'text-gray-500 dark:text-neutral-400'
                }`}
              >
                {t === 'log' ? 'Log' : 'Commit'}
              </button>
            ))}
          </div>
          {tab === 'log' ? (
            <div className="flex-1 flex min-h-0">
              <div style={{ width: branchW }} className="shrink-0 h-full">
                <BranchPanel
                  branches={log.branches}
                  selectedRef={log.selectedRef}
                  onSelectBranch={(ref) => log.selectBranch(repo!, ref)}
                  onCheckout={async (name) => {
                    await withToast(() => window.api.git.checkout(repo!, name))
                    log.refresh(repo!)
                  }}
                  onNewBranch={async (base) => {
                    const name = await ask(`'${base}' 기준 새 브랜치 이름`)
                    if (name) {
                      await withToast(() => window.api.git.createBranch(repo!, name, base))
                      notify(`브랜치 '${name}' 생성됨`)
                      log.refresh(repo!)
                    }
                  }}
                  onMerge={(name) => runOp(repo!, () => window.api.git.merge(repo!, name), 'merge')}
                  onRebase={(name) => runOp(repo!, () => window.api.git.rebase(repo!, name), 'rebase')}
                  onCreate={async () => {
                    const name = await ask('새 브랜치 이름')
                    if (name) {
                      await withToast(() => window.api.git.createBranch(repo!, name))
                      notify(`브랜치 '${name}' 생성됨`)
                      log.refresh(repo!)
                    }
                  }}
                />
              </div>
              <Splitter
                orientation="vertical"
                onDrag={(d) => setBranchW((w) => clamp(w + d, 140, 500))}
              />
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 flex min-h-0">
                  <div className="flex-1 flex min-w-0 min-h-0">
                    {log.graph && (
                      <CommitGraph
                        commits={log.commits}
                        graph={log.graph}
                        selectedHash={log.selectedHash}
                        onSelect={(h) => log.selectCommit(repo, h)}
                        onCherryPick={(hashes) =>
                          runOp(repo!, () => window.api.git.cherryPick(repo!, hashes), 'cherry-pick')
                        }
                      />
                    )}
                  </div>
                  <Splitter
                    orientation="vertical"
                    onDrag={(d) => setFilesW((w) => clamp(w - d, 160, 600))}
                  />
                  <div style={{ width: filesW }} className="shrink-0 h-full">
                    <ChangedFiles
                      files={log.changedFiles}
                      selectedFile={log.selectedFile}
                      onSelect={(f) => log.selectFile(repo, f)}
                    />
                  </div>
                </div>
                <Splitter
                  orientation="horizontal"
                  onDrag={(d) => setDiffH((h) => clamp(h - d, 80, 600))}
                />
                <div style={{ height: diffH }} className="shrink-0">
                  <DiffView file={log.selectedFile} diff={log.diff} />
                </div>
              </div>
            </div>
          ) : (
            <CommitView repo={repo} />
          )}
        </div>
      )}
      {showRemote && repo && <RemoteDialog repo={repo} onClose={() => setShowRemote(false)} />}
      {repo && <ConflictPanel repo={repo} onDone={() => log.refresh(repo)} />}
      <PromptDialog />
      <Toast />
    </div>
  )
}
