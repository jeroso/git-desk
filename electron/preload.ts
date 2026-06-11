import { contextBridge, ipcRenderer } from 'electron'

const api = {
  repos: {
    list: () => ipcRenderer.invoke('repos:list'),
    remove: (p: string) => ipcRenderer.invoke('repos:remove', p),
    pickFolder: () => ipcRenderer.invoke('repos:pickFolder'),
    open: (p: string) => ipcRenderer.invoke('repos:open', p),
  },
  git: {
    log: (repo: string, limit?: number) => ipcRenderer.invoke('git:log', repo, limit),
    status: (repo: string) => ipcRenderer.invoke('git:status', repo),
    branches: (repo: string) => ipcRenderer.invoke('git:branches', repo),
    checkout: (repo: string, name: string) => ipcRenderer.invoke('git:checkout', repo, name),
    createBranch: (repo: string, name: string) =>
      ipcRenderer.invoke('git:createBranch', repo, name),
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
