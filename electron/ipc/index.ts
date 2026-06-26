import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { openDiffWindow } from './diffWindow'
import { getLog, getCommitMessage } from '../git/log'
import { computeGraph } from '../git/graph'
import { getStatus } from '../git/status'
import { getBranches, checkout, createBranch, deleteBranch, currentBranch } from '../git/branch'
import { getCommitFiles, getCommitDiff, getWorktreeDiff } from '../git/diff'
import { listRepos, addRepo, removeRepo } from '../repos/store'
import { commit, commitAndPush } from '../git/commit'
import { getRemotes, setRemoteUrl, rewriteRemoteHost, fetchRemote, pull, push, pushBranch, updateBranch } from '../git/remote'
import { readSshHosts } from '../ssh/config'
import {
  mergeBranch, rebaseOnto, cherryPick, continueOp, abortOp, markResolved, rollback, smartCheckout,
  resetTo, undoCommit, revertCommits, isPushed, editMessage,
} from '../git/ops'
import { rebaseEdit, type RebaseEditRequest } from '../git/rebaseEdit'
import { readWorktreeFile, writeWorktreeFile } from '../git/worktreeFile'

export function registerIpc() {
  // repos
  ipcMain.handle('repos:list', () => listRepos())
  ipcMain.handle('repos:remove', (_e, p: string) => removeRepo(p))
  ipcMain.handle('repos:pickFolder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })
  ipcMain.handle('repos:open', (_e, p: string) => addRepo(p, new Date().toISOString()))

  // log + graph
  ipcMain.handle('git:log', async (_e, repo: string, limit?: number, ref?: string) => {
    const commits = await getLog(repo, limit, ref)
    const graph = computeGraph(commits)
    return { commits, graph }
  })

  // status / branches
  ipcMain.handle('git:status', (_e, repo: string) => getStatus(repo))
  ipcMain.handle('git:branches', (_e, repo: string) => getBranches(repo))
  ipcMain.handle('git:currentBranch', (_e, repo: string) => currentBranch(repo))
  ipcMain.handle('git:checkout', (_e, repo: string, name: string, isRemote?: boolean, force?: boolean) =>
    checkout(repo, name, isRemote, force),
  )
  ipcMain.handle('git:smartCheckout', (_e, repo: string, name: string, isRemote?: boolean) =>
    smartCheckout(repo, name, isRemote),
  )
  ipcMain.handle('git:createBranch', (_e, repo: string, name: string, base?: string) =>
    createBranch(repo, name, base),
  )
  ipcMain.handle('git:deleteBranch', (_e, repo: string, name: string, isRemote?: boolean, force?: boolean) =>
    deleteBranch(repo, name, isRemote, force),
  )

  // diff
  ipcMain.handle('git:commitFiles', (_e, repo: string, hash: string) => getCommitFiles(repo, hash))
  ipcMain.handle('git:commitDiff', (_e, repo: string, hash: string, file: string) =>
    getCommitDiff(repo, hash, file),
  )
  ipcMain.handle('git:worktreeDiff', (_e, repo: string, file: string, staged: boolean) =>
    getWorktreeDiff(repo, file, staged),
  )

  ipcMain.handle('git:commit', (_e, repo: string, files: string[], msg: string) =>
    commit(repo, files, msg),
  )
  ipcMain.handle('git:commitAndPush', (_e, repo: string, files: string[], msg: string) =>
    commitAndPush(repo, files, msg),
  )

  // open path in external editor / file manager
  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))

  // ssh + remote
  ipcMain.handle('ssh:hosts', () => readSshHosts())
  ipcMain.handle('git:remotes', (_e, repo: string) => getRemotes(repo))
  ipcMain.handle('git:setRemoteAlias', async (_e, repo: string, name: string, url: string, alias: string) => {
    return setRemoteUrl(repo, name, rewriteRemoteHost(url, alias))
  })
  ipcMain.handle('git:fetch', (_e, repo: string) => fetchRemote(repo))
  ipcMain.handle('git:pull', (_e, repo: string) => pull(repo))
  ipcMain.handle('git:push', (_e, repo: string) => push(repo))
  ipcMain.handle('git:pushBranch', (_e, repo: string, branch: string) => pushBranch(repo, branch))
  ipcMain.handle('git:updateBranch', (_e, repo: string, branch: string) =>
    updateBranch(repo, branch),
  )

  // open a file's diff in a separate, lightweight window
  ipcMain.handle('git:openDiffWindow', (e, title: string, diff: string) => {
    const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined
    openDiffWindow(title, diff, parent)
  })

  ipcMain.handle('git:merge', (_e, repo: string, b: string) => mergeBranch(repo, b))
  ipcMain.handle('git:rebase', (_e, repo: string, b: string) => rebaseOnto(repo, b))
  ipcMain.handle('git:cherryPick', (_e, repo: string, hashes: string[]) => cherryPick(repo, hashes))
  ipcMain.handle('git:reset', (_e, repo: string, hash: string, mode: 'soft' | 'mixed' | 'hard') =>
    resetTo(repo, hash, mode),
  )
  ipcMain.handle('git:undoCommit', (_e, repo: string, hash: string) => undoCommit(repo, hash))
  ipcMain.handle('git:revert', (_e, repo: string, hashes: string[]) => revertCommits(repo, hashes))
  ipcMain.handle('git:commitMessage', (_e, repo: string, hash: string) => getCommitMessage(repo, hash))
  ipcMain.handle('git:editMessage', (_e, repo: string, hash: string, message: string) =>
    editMessage(repo, hash, message),
  )
  ipcMain.handle('git:rebaseEdit', (_e, repo: string, req: RebaseEditRequest) => rebaseEdit(repo, req))
  ipcMain.handle('git:isPushed', (_e, repo: string, hash: string) => isPushed(repo, hash))
  ipcMain.handle('git:continueOp', (_e, repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') =>
    continueOp(repo, op),
  )
  ipcMain.handle('git:abortOp', (_e, repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') =>
    abortOp(repo, op),
  )
  ipcMain.handle('git:markResolved', (_e, repo: string, files: string[]) =>
    markResolved(repo, files),
  )
  ipcMain.handle('git:readWorktreeFile', (_e, repo: string, file: string) =>
    readWorktreeFile(repo, file),
  )
  ipcMain.handle('git:writeWorktreeFile', (_e, repo: string, file: string, content: string) =>
    writeWorktreeFile(repo, file, content),
  )
  ipcMain.handle('git:rollback', (_e, repo: string, files: { path: string; status: string }[]) =>
    rollback(repo, files),
  )
}
