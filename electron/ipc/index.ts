import { ipcMain, dialog, shell } from 'electron'
import { getLog } from '../git/log'
import { computeGraph } from '../git/graph'
import { getStatus } from '../git/status'
import { getBranches, checkout, createBranch } from '../git/branch'
import { getCommitFiles, getCommitDiff, getWorktreeDiff } from '../git/diff'
import { listRepos, addRepo, removeRepo } from '../repos/store'
import { commit, commitAndPush } from '../git/commit'
import { getRemotes, setRemoteUrl, rewriteRemoteHost, fetchRemote, pull, push } from '../git/remote'
import { readSshHosts } from '../ssh/config'
import { mergeBranch, rebaseOnto, cherryPick, continueOp, abortOp, markResolved } from '../git/ops'

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
  ipcMain.handle('git:log', async (_e, repo: string, limit?: number) => {
    const commits = await getLog(repo, limit)
    const graph = computeGraph(commits)
    return { commits, graph }
  })

  // status / branches
  ipcMain.handle('git:status', (_e, repo: string) => getStatus(repo))
  ipcMain.handle('git:branches', (_e, repo: string) => getBranches(repo))
  ipcMain.handle('git:checkout', (_e, repo: string, name: string) => checkout(repo, name))
  ipcMain.handle('git:createBranch', (_e, repo: string, name: string) => createBranch(repo, name))

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

  ipcMain.handle('git:merge', (_e, repo: string, b: string) => mergeBranch(repo, b))
  ipcMain.handle('git:rebase', (_e, repo: string, b: string) => rebaseOnto(repo, b))
  ipcMain.handle('git:cherryPick', (_e, repo: string, h: string) => cherryPick(repo, h))
  ipcMain.handle('git:continueOp', (_e, repo: string, op: 'merge' | 'rebase' | 'cherry-pick') =>
    continueOp(repo, op),
  )
  ipcMain.handle('git:abortOp', (_e, repo: string, op: 'merge' | 'rebase' | 'cherry-pick') =>
    abortOp(repo, op),
  )
  ipcMain.handle('git:markResolved', (_e, repo: string, files: string[]) =>
    markResolved(repo, files),
  )
}
