import { contextBridge, ipcRenderer } from 'electron'
import type { RebaseEditRequest } from './git/rebaseEdit'

const api = {
  repos: {
    list: () => ipcRenderer.invoke('repos:list'),
    remove: (p: string) => ipcRenderer.invoke('repos:remove', p),
    pickFolder: () => ipcRenderer.invoke('repos:pickFolder'),
    open: (p: string) => ipcRenderer.invoke('repos:open', p),
  },
  git: {
    log: (repo: string, limit?: number, ref?: string) =>
      ipcRenderer.invoke('git:log', repo, limit, ref),
    status: (repo: string) => ipcRenderer.invoke('git:status', repo),
    branches: (repo: string) => ipcRenderer.invoke('git:branches', repo),
    currentBranch: (repo: string) => ipcRenderer.invoke('git:currentBranch', repo),
    checkout: (repo: string, name: string, isRemote?: boolean, force?: boolean) =>
      ipcRenderer.invoke('git:checkout', repo, name, isRemote, force),
    smartCheckout: (repo: string, name: string, isRemote?: boolean) =>
      ipcRenderer.invoke('git:smartCheckout', repo, name, isRemote),
    createBranch: (repo: string, name: string, base?: string) =>
      ipcRenderer.invoke('git:createBranch', repo, name, base),
    deleteBranch: (repo: string, name: string, isRemote?: boolean, force?: boolean) =>
      ipcRenderer.invoke('git:deleteBranch', repo, name, isRemote, force),
    commitFiles: (repo: string, hash: string) =>
      ipcRenderer.invoke('git:commitFiles', repo, hash),
    commitDiff: (repo: string, hash: string, file: string) =>
      ipcRenderer.invoke('git:commitDiff', repo, hash, file),
    worktreeDiff: (repo: string, file: string, staged: boolean) =>
      ipcRenderer.invoke('git:worktreeDiff', repo, file, staged),
    commit: (repo: string, files: string[], msg: string) =>
      ipcRenderer.invoke('git:commit', repo, files, msg),
    commitAndPush: (repo: string, files: string[], msg: string) =>
      ipcRenderer.invoke('git:commitAndPush', repo, files, msg),
    remotes: (repo: string) => ipcRenderer.invoke('git:remotes', repo),
    setRemoteAlias: (repo: string, name: string, url: string, alias: string) =>
      ipcRenderer.invoke('git:setRemoteAlias', repo, name, url, alias),
    fetch: (repo: string) => ipcRenderer.invoke('git:fetch', repo),
    pull: (repo: string) => ipcRenderer.invoke('git:pull', repo),
    push: (repo: string) => ipcRenderer.invoke('git:push', repo),
    pushBranch: (repo: string, branch: string) => ipcRenderer.invoke('git:pushBranch', repo, branch),
    updateBranch: (repo: string, branch: string) =>
      ipcRenderer.invoke('git:updateBranch', repo, branch),
    openDiffWindow: (title: string, diff: string) =>
      ipcRenderer.invoke('git:openDiffWindow', title, diff),
    merge: (repo: string, b: string) => ipcRenderer.invoke('git:merge', repo, b),
    rebase: (repo: string, b: string) => ipcRenderer.invoke('git:rebase', repo, b),
    cherryPick: (repo: string, hashes: string[]) => ipcRenderer.invoke('git:cherryPick', repo, hashes),
    reset: (repo: string, hash: string, mode: 'soft' | 'mixed' | 'hard') =>
      ipcRenderer.invoke('git:reset', repo, hash, mode),
    undoCommit: (repo: string, hash: string) => ipcRenderer.invoke('git:undoCommit', repo, hash),
    revert: (repo: string, hashes: string[]) => ipcRenderer.invoke('git:revert', repo, hashes),
    commitMessage: (repo: string, hash: string) => ipcRenderer.invoke('git:commitMessage', repo, hash),
    editMessage: (repo: string, hash: string, message: string) =>
      ipcRenderer.invoke('git:editMessage', repo, hash, message),
    rebaseEdit: (repo: string, req: RebaseEditRequest) =>
      ipcRenderer.invoke('git:rebaseEdit', repo, req),
    isPushed: (repo: string, hash: string) => ipcRenderer.invoke('git:isPushed', repo, hash),
    continueOp: (repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') =>
      ipcRenderer.invoke('git:continueOp', repo, op),
    abortOp: (repo: string, op: 'merge' | 'rebase' | 'cherry-pick' | 'revert') =>
      ipcRenderer.invoke('git:abortOp', repo, op),
    markResolved: (repo: string, files: string[]) =>
      ipcRenderer.invoke('git:markResolved', repo, files),
    rollback: (repo: string, files: { path: string; status: string }[]) =>
      ipcRenderer.invoke('git:rollback', repo, files),
  },
  ssh: {
    hosts: () => ipcRenderer.invoke('ssh:hosts'),
  },
  shell: {
    openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
  },
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
