import { ipcMain, dialog, shell } from 'electron'
import { getLog } from '../git/log'
import { computeGraph } from '../git/graph'
import { getStatus } from '../git/status'
import { getBranches, checkout, createBranch } from '../git/branch'
import { getCommitFiles, getCommitDiff, getWorktreeDiff } from '../git/diff'
import { listRepos, addRepo, removeRepo } from '../repos/store'
import { commit, commitAndPush } from '../git/commit'

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
}
