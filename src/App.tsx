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
import { MergeView } from './components/MergeView'
import { ConflictBanner } from './components/ConflictBanner'
import { CheckoutConflictDialog } from './components/CheckoutConflictDialog'
import { PromptDialog } from './components/PromptDialog'
import { Splitter } from './components/Splitter'
import { useConflictStore } from './store/conflictStore'
import { withToast, notify, useToast } from './lib/api'
import { ask } from './lib/prompt'
import { cleanDiff } from './lib/diff'
import { ResetModeDialog } from './components/ResetModeDialog'
import { MessageDialog } from './components/MessageDialog'
import { RewriteWarningDialog } from './components/RewriteWarningDialog'
import { headHash } from './lib/commitSelection'
import type { FileChange } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** git pull/fetch 출력을 한 줄 요약으로 줄인다 (전체 출력으로 화면을 덮지 않도록). */
function summarizeUpdate(out: string): string {
  if (/already up to date/i.test(out)) return '이미 최신입니다'
  const stat = out.match(/\d+ files? changed[^\n]*/i)
  if (stat) return stat[0].trim()
  const updating = out.match(/Updating\s+[0-9a-f]+\.\.[0-9a-f]+/i)
  if (updating) return `${updating[0]} 업데이트 완료`
  if (/Fast-forward/i.test(out)) return 'Fast-forward 업데이트 완료'
  return '업데이트 완료'
}

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

  // repo 또는 로그가 갱신될 때마다 실제 충돌 상태를 감지해 배너에 반영.
  useEffect(() => {
    if (!repo) {
      useConflictStore.getState().setDetected({ inProgress: false, op: null, files: [] })
      return
    }
    window.api.git
      .conflictState(repo)
      .then((d) => useConflictStore.getState().setDetected(d))
      .catch(() => {})
  }, [repo, log.commits])
  const [tab, setTab] = useState<'log' | 'commit'>('log')
  const [showRemote, setShowRemote] = useState(false)
  // Resizable pane sizes (px). Drag the splitters between panes to adjust.
  const [branchW, setBranchW] = useState(224)
  const [filesW, setFilesW] = useState(288)
  const [diffH, setDiffH] = useState(256)
  // 일반 체크아웃이 로컬 변경 충돌로 거부됐을 때 띄울 선택 다이얼로그 대상.
  const [checkoutConflict, setCheckoutConflict] = useState<{ name: string; isRemote: boolean } | null>(null)
  const conflict = useConflictStore()
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<{ hash: string; initial: string } | null>(null)
  const [squashTarget, setSquashTarget] = useState<{ hashes: string[]; initial: string } | null>(null)
  const [rewriteWarn, setRewriteWarn] = useState<{ run: () => void } | null>(null)

  async function runOp(
    repoPath: string,
    fn: () => Promise<{ ok: boolean; output: string }>,
    op: 'merge' | 'rebase' | 'cherry-pick' | 'checkout' | 'revert',
    label?: string,
  ) {
    const res = await withToast(fn)
    const status: FileChange[] = (await withToast(() => window.api.git.status(repoPath))) ?? []
    const conflicted = status.filter((c) => c.status === 'conflicted').map((c) => c.path)
    if (conflicted.length > 0) {
      conflict.open(op, conflicted)
    } else if (res && !res.ok) {
      useToast.getState().show(res.output)
    } else if (res && res.ok) {
      notify(op === 'checkout' ? '스마트 체크아웃 완료' : `${label ?? op} 완료`)
    }
    log.refresh(repoPath)
  }

  async function guardPushed(relevantHash: string, run: () => void) {
    if (!repo) return
    const pushed = await window.api.git.isPushed(repo, relevantHash)
    if (pushed) setRewriteWarn({ run })
    else run()
  }
  async function doReset(hash: string, mode: 'soft' | 'mixed' | 'hard') {
    const out = await withToast(() => window.api.git.reset(repo!, hash, mode))
    if (out !== undefined) notify(`Reset (${mode}) 완료`)
    log.refresh(repo!)
  }
  async function doUndo(hash: string) {
    const out = await withToast(() => window.api.git.undoCommit(repo!, hash))
    if (out !== undefined) notify('Undo Commit 완료')
    log.refresh(repo!)
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
          if (out !== undefined) notify(summarizeUpdate(out))
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
          <ConflictBanner
            onResolve={() => {
              const d = useConflictStore.getState().detected
              conflict.open(d.op ?? 'checkout', d.files)
            }}
            onAbort={async () => {
              const d = useConflictStore.getState().detected
              if (!d.op) return
              if (!window.confirm(`${d.op} 작업을 중단(abort)하고 되돌릴까요?`)) return
              const out = await withToast(() =>
                window.api.git.abortOp(repo!, d.op as 'merge' | 'rebase' | 'cherry-pick' | 'revert'),
              )
              if (out !== undefined) notify('충돌 작업을 중단했습니다')
              log.refresh(repo!)
            }}
          />
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
                  onCheckout={async (name, isRemote) => {
                    try {
                      await window.api.git.checkout(repo!, name, isRemote)
                      if (isRemote) notify(`'${name.replace(/^[^/]+\//, '')}' 로컬 브랜치로 체크아웃됨`)
                      log.refresh(repo!)
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e)
                      // 커밋되지 않은 로컬 변경 때문에 거부된 경우: 스마트/강제 선택 다이얼로그.
                      if (/would be overwritten by checkout|commit your changes or stash/i.test(msg)) {
                        setCheckoutConflict({ name, isRemote })
                      } else {
                        useToast.getState().show(msg)
                      }
                    }
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
                  onUpdate={async (name) => {
                    const out = await withToast(() => window.api.git.updateBranch(repo!, name))
                    if (out !== undefined) notify(`'${name}' ${summarizeUpdate(out)}`)
                    log.refresh(repo!)
                  }}
                  onPush={async (name) => {
                    const out = await withToast(() => window.api.git.pushBranch(repo!, name))
                    if (out !== undefined) notify(`'${name}' 푸시 완료`)
                    log.refresh(repo!)
                  }}
                  onDelete={async (name, isRemote) => {
                    const what = isRemote ? `원격 브랜치 '${name}'` : `브랜치 '${name}'`
                    if (!window.confirm(`${what}를 삭제할까요?`)) return
                    try {
                      await window.api.git.deleteBranch(repo!, name, isRemote, false)
                      notify(`${what} 삭제됨`)
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e)
                      // 병합되지 않은 로컬 브랜치: 강제 삭제 여부를 한 번 더 확인.
                      if (!isRemote && /not fully merged/i.test(msg)) {
                        if (window.confirm(`'${name}'가 병합되지 않았습니다. 강제 삭제할까요?`)) {
                          const out = await withToast(() => window.api.git.deleteBranch(repo!, name, false, true))
                          if (out !== undefined) notify(`${what} 강제 삭제됨`)
                        }
                      } else {
                        useToast.getState().show(msg)
                      }
                    }
                    // 방금 지운 브랜치를 로그 필터로 보고 있었다면 '전체 브랜치'로 되돌린다
                    // (없는 리비전으로 git log를 돌려 터지는 것을 방지).
                    if (useLogStore.getState().selectedRef === name) {
                      await log.selectBranch(repo!, null)
                    } else {
                      log.refresh(repo!)
                    }
                  }}
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
                        onRevert={(hashes) =>
                          runOp(repo!, () => window.api.git.revert(repo!, hashes), 'revert', '되돌리기')
                        }
                        onReset={(hash) => setResetTarget(hash)}
                        onUndo={(hash) =>
                          guardPushed(headHash(log.commits) ?? hash, () => doUndo(hash))
                        }
                        onEditMessage={async (hash) => {
                          const full = (await withToast(() => window.api.git.commitMessage(repo!, hash))) ?? ''
                          setEditTarget({ hash, initial: full })
                        }}
                        onDrop={(hashes) =>
                          guardPushed(hashes[0], () =>
                            runOp(
                              repo!,
                              () => window.api.git.rebaseEdit(repo!, { kind: 'drop', hashes }),
                              'rebase',
                              '드롭',
                            ),
                          )
                        }
                        onSquash={(hashes) => {
                          const initial = log.commits
                            .filter((c) => hashes.includes(c.hash))
                            .map((c) => c.subject)
                            .reverse()
                            .join('\n\n')
                          setSquashTarget({ hashes, initial })
                        }}
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
                      onOpenWindow={async (f) => {
                        const hash = log.selectedHash
                        if (!repo || !hash) return
                        const diff =
                          (await withToast(() => window.api.git.commitDiff(repo, hash, f))) ?? ''
                        await withToast(() => window.api.git.openDiffWindow(f, cleanDiff(diff)))
                      }}
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
      {repo && conflict.mergeFile && (
        <MergeView
          repo={repo}
          file={conflict.mergeFile}
          onClose={conflict.closeMerge}
          onResolved={() => {
            conflict.closeMerge()
            log.refresh(repo)
          }}
        />
      )}
      {checkoutConflict && repo && (
        <CheckoutConflictDialog
          branch={checkoutConflict.name}
          onCancel={() => setCheckoutConflict(null)}
          onSmart={() => {
            const cc = checkoutConflict
            setCheckoutConflict(null)
            runOp(repo, () => window.api.git.smartCheckout(repo, cc.name, cc.isRemote), 'checkout')
          }}
          onForce={async () => {
            const cc = checkoutConflict
            setCheckoutConflict(null)
            if (
              !window.confirm(
                `'${cc.name}'로 강제 체크아웃하면 커밋되지 않은 로컬 변경이 사라집니다. 계속할까요?`,
              )
            )
              return
            const out = await withToast(() => window.api.git.checkout(repo, cc.name, cc.isRemote, true))
            if (out !== undefined) notify(`'${cc.name}' 체크아웃됨 (강제)`)
            log.refresh(repo)
          }}
        />
      )}
      {resetTarget && (
        <ResetModeDialog
          shortHash={resetTarget.slice(0, 7)}
          onCancel={() => setResetTarget(null)}
          onConfirm={(mode) => {
            const h = resetTarget
            setResetTarget(null)
            guardPushed(headHash(log.commits) ?? h, () => doReset(h, mode))
          }}
        />
      )}
      {editTarget && (
        <MessageDialog
          title="커밋 메시지 수정"
          initial={editTarget.initial}
          onCancel={() => setEditTarget(null)}
          onConfirm={(msg) => {
            const { hash } = editTarget
            setEditTarget(null)
            guardPushed(hash, () =>
              runOp(
                repo!,
                () => window.api.git.editMessage(repo!, hash, msg),
                'rebase',
                '커밋 메시지 수정',
              ),
            )
          }}
        />
      )}
      {squashTarget && (
        <MessageDialog
          title={`Squash ${squashTarget.hashes.length} commits`}
          initial={squashTarget.initial}
          onCancel={() => setSquashTarget(null)}
          onConfirm={(msg) => {
            const { hashes } = squashTarget
            setSquashTarget(null)
            guardPushed(hashes[0], () =>
              runOp(
                repo!,
                () => window.api.git.rebaseEdit(repo!, { kind: 'squash', hashes, message: msg }),
                'rebase',
                'Squash',
              ),
            )
          }}
        />
      )}
      {rewriteWarn && (
        <RewriteWarningDialog
          onCancel={() => setRewriteWarn(null)}
          onConfirm={() => {
            const r = rewriteWarn.run
            setRewriteWarn(null)
            r()
          }}
        />
      )}
      <PromptDialog />
      <Toast />
    </div>
  )
}
